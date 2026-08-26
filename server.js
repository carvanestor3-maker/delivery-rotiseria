const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const net = require('net');
const fs = require('fs');
const { execSync } = require('child_process');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Socket.io conexiones
io.on('connection', (socket) => {
  console.log('⚡ Nuevo cliente conectado:', socket.id);
});

function getSettingsMap() {
  const store = db.getStore();
  return store.settings || {};
}

// HELPER PRINCIPAL: VERIFICACIÓN DE PIN POR USUARIO Y NIVEL
function verifyUserPin(inputPin, requiredLevel = 2) {
  const store = db.getStore();
  const strPin = String(inputPin || '').trim();

  if (!strPin) return { isValid: false, user: null };

  const users = store.users || [];
  const foundUser = users.find(u => u.active !== 0 && String(u.pin).trim() === strPin);

  if (foundUser) {
    if (foundUser.level >= requiredLevel) {
      return { isValid: true, user: foundUser };
    } else {
      return { isValid: false, user: foundUser, levelTooLow: true };
    }
  }

  const settings = getSettingsMap();
  const encargadoPin = settings.encargado_pin || '2222';
  const adminPin = settings.admin_pin || '9999';

  if (requiredLevel === 3) {
    if (strPin === String(adminPin)) {
      return { isValid: true, user: { id: 0, name: 'Gerente General / Dueño', level: 3 } };
    }
  } else {
    if (strPin === String(encargadoPin)) {
      return { isValid: true, user: { id: 0, name: 'Encargado de Turno', level: 2 } };
    } else if (strPin === String(adminPin)) {
      return { isValid: true, user: { id: 0, name: 'Gerente General / Dueño', level: 3 } };
    }
  }

  return { isValid: false, user: null };
}

// DESCARGA DIRECTA DE COPIA DE SEGURIDAD ZIP (REQUERIDO NIVEL 3)
app.get('/api/admin/backup/download', (req, res) => {
  try {
    const pin = req.query.pin;
    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: Se requiere PIN Nivel 3 para descargar copias de seguridad.' });
    }

    const backupDir = path.join(__dirname, '..', 'respaldos_delivery');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipFileName = `backup_rotiseria_${dateStr}.zip`;
    const zipPath = path.join(backupDir, zipFileName);

    const psCmd = `powershell -Command "Compress-Archive -Path '${__dirname}\\*' -DestinationPath '${zipPath}' -Force"`;
    execSync(psCmd);

    res.download(zipPath, zipFileName, (err) => {
      if (err) console.error('Error al enviar archivo zip:', err);
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// RUTA API DE VERIFICACIÓN DE PIN (PÚBLICA CON RETORNO DE NOMBRE DE USUARIO)
app.post('/api/verify-pin', (req, res) => {
  try {
    const { pin, level } = req.body;
    const reqLevel = parseInt(level || 2);
    const result = verifyUserPin(pin, reqLevel);

    if (result.isValid) {
      return res.json({ 
        success: true, 
        authorized: true, 
        user_name: result.user.name, 
        user_level: result.user.level 
      });
    } else {
      const errMsg = result.levelTooLow 
        ? `Acceso denegado: El usuario "${result.user.name}" posee Nivel ${result.user.level} y esta acción requiere Nivel ${reqLevel}.`
        : `Clave PIN incorrecta para Nivel ${reqLevel}.`;
      return res.status(401).json({ success: false, authorized: false, error: errMsg });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GESTIÓN DE USUARIOS / PERSONAL NOMBRADO (REQUERIDO NIVEL 3)
app.get('/api/admin/users', (req, res) => {
  try {
    const store = db.getStore();
    res.json({ success: true, users: store.users || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/users', (req, res) => {
  try {
    const { id, name, pin, level, admin_pin } = req.body;

    const auth = verifyUserPin(admin_pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La gestión de personal requiere PIN de Gerente / Dueño (Nivel 3).' });
    }

    if (!name || !pin || !level) {
      return res.status(400).json({ success: false, error: 'Nombre, PIN y Nivel son obligatorios.' });
    }

    const store = db.getStore();
    if (!store.users) store.users = [];

    const numLevel = parseInt(level);
    const strPin = String(pin).trim();

    const existingPinUser = store.users.find(u => String(u.pin).trim() === strPin && u.id !== parseInt(id || 0));
    if (existingPinUser) {
      return res.status(400).json({ success: false, error: `La clave PIN "${strPin}" ya pertenece al usuario "${existingPinUser.name}". Debe asignar una clave única por personal.` });
    }

    if (id) {
      const u = store.users.find(usr => usr.id === parseInt(id));
      if (u) {
        u.name = name;
        u.pin = strPin;
        u.level = numLevel;
      }
    } else {
      const nextId = store.users.length > 0 ? Math.max(...store.users.map(usr => usr.id)) + 1 : 1;
      store.users.push({
        id: nextId,
        name,
        pin: strPin,
        level: numLevel,
        active: 1
      });
    }

    db.saveStore();
    res.json({ success: true, users: store.users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { admin_pin } = req.body;

    const auth = verifyUserPin(admin_pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: Se requiere PIN Nivel 3.' });
    }

    const store = db.getStore();
    store.users = (store.users || []).filter(u => u.id !== parseInt(id));
    db.saveStore();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// APERTURA DE TURNO DE CAJA POR NÚMERO DE CAJA, CAJERO ASIGNADO Y AUTORIZANTE (REQUERIDO NIVEL 2 O 3)
app.post('/api/cash/shift/open', (req, res) => {
  try {
    const { box_number, cashier_name, initial_cash, shift_type, pin } = req.body;
    const numBox = parseInt(box_number || 1);
    const strShiftType = shift_type || 'comandas'; // 'comandas' | 'pre_packaged' | 'weighed_food'

    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN personal no válido o no registrado.' });
    }

    const strCashierName = (cashier_name || auth.user.name).trim();

    const store = db.getStore();
    if (!store.cash_shifts) store.cash_shifts = [];

    // 1. Regla Nivel 1: Un operario Nivel 1 no puede tener 2 cajas abiertas simultáneamente con su clave
    if (auth.user.level === 1) {
      const activeShiftByUser = store.cash_shifts.find(s => s.status === 'open' && s.user_id === auth.user.id);
      if (activeShiftByUser) {
        return res.status(400).json({ 
          success: false, 
          error: `⚠️ EL OPERARIO "${auth.user.name}" (Nivel 1) YA TIENE LA CAJA N° ${activeShiftByUser.box_number} ABIERTA. Un operario de Nivel 1 no puede abrir dos cajas simultáneamente.` 
        });
      }
    }

    // 2. Regla General (Nivel 1, 2 o 3): El nombre del cajero asignado NO se puede repetir en 2 cajas abiertas simultáneamente
    const activeShiftWithSameCashier = store.cash_shifts.find(s => s.status === 'open' && (s.cashier_name || '').toLowerCase() === strCashierName.toLowerCase());
    if (activeShiftWithSameCashier) {
      return res.status(400).json({ 
        success: false, 
        error: `⚠️ EL CAJERO/A "${strCashierName}" YA ESTÁ ASIGNADO/A A LA CAJA N° ${activeShiftWithSameCashier.box_number} ACTUALMENTE ABIERTA. No se puede repetir el nombre del cajero en dos cajas abiertas.` 
      });
    }

    // 3. Regla Número de Caja: La caja N° numBox no puede ser reabierta sin cerrar la previa
    const activeShiftOnBox = store.cash_shifts.find(s => s.status === 'open' && (s.box_number || 1) === numBox);
    if (activeShiftOnBox) {
      return res.status(400).json({ 
        success: false, 
        error: `⚠️ LA CAJA N° ${numBox} YA ESTÁ ABIERTA: Fue habilitada por "${activeShiftOnBox.opened_by}" para el cajero "${activeShiftOnBox.cashier_name || 'Sin asignar'}". Elija otro número de caja o cierre la Caja N° ${numBox} previa.` 
      });
    }

    const nextId = store.cash_shifts.length > 0 ? Math.max(...store.cash_shifts.map(s => s.id)) + 1 : 1;
    const newShift = {
      id: nextId,
      box_number: numBox,
      user_id: auth.user.id,
      cashier_name: strCashierName,
      shift_type: strShiftType,
      opened_at: new Date().toISOString(),
      closed_at: null,
      initial_cash: parseFloat(initial_cash || 0),
      final_cash: null,
      status: 'open',
      opened_by: `${auth.user.name} (Nivel ${auth.user.level})`
    };

    store.cash_shifts.unshift(newShift);
    db.saveStore();
    io.emit('cash_shift_updated');

    res.json({ success: true, shift: newShift, user_name: auth.user.name, cashier_name: strCashierName, box_number: numBox });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CIERRE DE TURNO DE CAJA POR NÚMERO DE CAJA Y USUARIO INDIVIDUAL (REQUERIDO NIVEL 2 O 3)
app.post('/api/cash/shift/close', (req, res) => {
  try {
    const { box_number, shift_id, final_cash, pin } = req.body;
    const numBox = box_number ? parseInt(box_number) : null;
    const shiftId = shift_id ? parseInt(shift_id) : null;

    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ 
        success: false, 
        error: '⚠️ Acceso Denegado: La clave PIN ingresada no es válida o no está registrada. Si el cajero es un Aprendiz (sin PIN de Nivel 1), el cierre de caja debe ser realizado o autorizado por un Encargado (Nivel 2) o Gerente (Nivel 3).' 
      });
    }

    const store = db.getStore();
    if (!store.cash_shifts) store.cash_shifts = [];

    let activeShift = null;
    if (shiftId) {
      activeShift = store.cash_shifts.find(s => s.id === shiftId && s.status === 'open');
    } else if (numBox) {
      activeShift = store.cash_shifts.find(s => s.status === 'open' && (s.box_number || 1) === numBox);
    } else {
      activeShift = store.cash_shifts.find(s => s.status === 'open');
    }

    if (!activeShift) {
      return res.status(400).json({ success: false, error: numBox ? `La Caja N° ${numBox} no está abierta o ya fue cerrada.` : 'No hay ninguna caja abierta para cerrar.' });
    }

    activeShift.closed_at = new Date().toISOString();
    activeShift.final_cash = parseFloat(final_cash || 0);
    activeShift.status = 'closed';
    activeShift.closed_by = `${auth.user.name} (Nivel ${auth.user.level})`;

    // REGLA DE NEGOCIO DEL BAR:
    // Si se cierra la última caja abierta de la sucursal, el Bar se cierra automáticamente.
    const remainingOpenCashShifts = store.cash_shifts.filter(s => s.status === 'open');
    let barAutoClosed = false;
    if (remainingOpenCashShifts.length === 0 && store.bar_shifts) {
      const openBarShift = store.bar_shifts.find(b => b.status === 'open');
      if (openBarShift) {
        openBarShift.status = 'closed';
        openBarShift.closed_at = new Date().toISOString();
        openBarShift.closed_by = `Cierre Automático (Caja N° ${activeShift.box_number || 1} cerrada por ${auth.user.name})`;
        barAutoClosed = true;
        io.emit('bar_shift_updated', openBarShift);
      }
    }

    db.saveStore();
    io.emit('cash_shift_updated');

    res.json({ success: true, shift: activeShift, user_name: auth.user.name, box_number: activeShift.box_number || 1, bar_auto_closed: barAutoClosed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// BITÁCORA DE AUDITORÍA Y FACTURACIÓN MULTI-PERÍODO (EXCLUSIVO NIVEL 3 - GERENTE / DUEÑO)
app.post('/api/admin/audit-logs', (req, res) => {
  try {
    const { pin } = req.body;

    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La Bitácora de Auditoría es de acceso exclusivo para Gerente / Dueño (Nivel 3).' });
    }

    const store = db.getStore();
    const now = new Date();

    const validOrders = store.orders.filter(o => o.status !== 'cancelado');

    function calculateFinancialMetrics(days) {
      const cutoff = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
      const periodOrders = validOrders.filter(o => new Date(o.created_at) >= cutoff);

      let total = 0;
      let cash = 0;
      let card = 0;
      let digital = 0;
      let cc = 0;

      periodOrders.forEach(o => {
        total += o.total;
        if (o.payment_method === 'Efectivo') cash += o.total;
        else if (o.payment_method.includes('Tarjeta')) card += o.total;
        else if (o.payment_method.includes('Cuenta Corriente')) cc += o.total;
        else digital += o.total;
      });

      return {
        count: periodOrders.length,
        total_sales: total,
        cash_sales: cash,
        card_sales: card,
        digital_sales: digital,
        cc_sales: cc
      };
    }

    const billing = {
      diario: calculateFinancialMetrics(1),
      semanal: calculateFinancialMetrics(7),
      quincenal: calculateFinancialMetrics(15),
      mensual: calculateFinancialMetrics(30)
    };

    res.json({
      success: true,
      audited_by_user: auth.user.name,
      billing,
      stock_entries: store.stock_entries || [],
      stock_adjustments: store.stock_adjustments || [],
      account_payments: store.account_payments || [],
      cash_shifts: store.cash_shifts || []
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CONCILIAR / AJUSTAR STOCK REAL VS VIRTUAL CON AUDITORÍA DE USUARIO (REQUERIDO NIVEL 3)
app.post('/api/admin/stock/adjust', (req, res) => {
  try {
    const { raw_material_id, real_stock, reason, pin } = req.body;

    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La Conciliación de Stock requiere PIN de Gerente / Dueño (Nivel 3).' });
    }

    const store = db.getStore();
    const rawMat = store.raw_materials.find(m => m.id === parseInt(raw_material_id));
    if (!rawMat) {
      return res.status(404).json({ success: false, error: 'Insumo no encontrado' });
    }

    const oldStock = rawMat.current_stock || 0;
    const newStock = parseFloat(real_stock || 0);
    const diff = newStock - oldStock;

    rawMat.current_stock = newStock;

    if (!store.stock_adjustments) store.stock_adjustments = [];
    const nextId = store.stock_adjustments.length > 0 ? Math.max(...store.stock_adjustments.map(a => a.id)) + 1 : 1;
    store.stock_adjustments.unshift({
      id: nextId,
      date: new Date().toISOString(),
      raw_material_name: rawMat.name,
      unit: rawMat.unit,
      old_stock: oldStock,
      new_stock: newStock,
      difference: diff,
      reason: reason || 'Conciliación de inventario físico real',
      registered_by: `${auth.user.name} (Nivel ${auth.user.level})`
    });

    db.saveStore();
    io.emit('stock_updated');

    res.json({
      success: true,
      raw_material_name: rawMat.name,
      old_stock: oldStock,
      new_stock: newStock,
      difference: diff,
      user_name: auth.user.name
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// REGISTRAR PRODUCCIÓN EN LOTE CON NOMBRE DE ENCARGADO (Mise en place - Requiere Nivel 2)
app.post('/api/production/register', (req, res) => {
  try {
    const { product_id, portions, pin } = req.body;
    const pid = parseInt(product_id);
    const qtyPortions = parseFloat(portions || 0);

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) incorrecto' });
    }

    if (!pid || qtyPortions <= 0) {
      return res.status(400).json({ success: false, error: 'Producto y cantidad de porciones producidas son obligatorios' });
    }

    const store = db.getStore();
    const prod = store.products.find(p => p.id === pid);
    if (!prod) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }

    const recipes = store.product_recipes.filter(r => r.product_id === pid);
    let discountedMaterials = [];

    recipes.forEach(r => {
      const rawMat = store.raw_materials.find(m => m.id === r.raw_material_id);
      if (rawMat) {
        const discountQty = (r.qty_per_portion || 0) * qtyPortions;
        rawMat.current_stock = Math.max(0, (rawMat.current_stock || 0) - discountQty);
        discountedMaterials.push(`${rawMat.name}: -${discountQty.toFixed(2)}${rawMat.unit}`);
      }
    });

    db.saveStore();
    io.emit('stock_updated');

    res.json({
      success: true,
      product_name: prod.name,
      portions: qtyPortions,
      discounted: discountedMaterials,
      user_name: auth.user.name
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ingreso de Mercadería al Stock General con Nombre de Usuario (Requiere PIN Nivel 2)
app.post('/api/stock/entry', (req, res) => {
  try {
    const { pin, supplier_id, raw_material_id, quantity, unit_cost, notes } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) incorrecto' });
    }

    const store = db.getStore();
    const rawMat = store.raw_materials.find(m => m.id === parseInt(raw_material_id));
    if (!rawMat) {
      return res.status(404).json({ success: false, error: 'Insumo de materia prima no encontrado' });
    }

    const qtyAdd = parseFloat(quantity || 0);
    if (qtyAdd <= 0) {
      return res.status(400).json({ success: false, error: 'La cantidad ingresada debe ser mayor a 0' });
    }

    rawMat.current_stock = (rawMat.current_stock || 0) + qtyAdd;

    const supplier = store.suppliers.find(s => s.id === parseInt(supplier_id));

    const nextId = store.stock_entries.length > 0 ? Math.max(...store.stock_entries.map(e => e.id)) + 1 : 1;
    store.stock_entries.unshift({
      id: nextId,
      date: new Date().toISOString(),
      supplier_name: supplier ? supplier.name : 'Proveedor General',
      raw_material_name: rawMat.name,
      unit: rawMat.unit,
      quantity: qtyAdd,
      unit_cost: parseFloat(unit_cost || 0),
      total_cost: qtyAdd * parseFloat(unit_cost || 0),
      notes: notes || '',
      registered_by: `${auth.user.name} (Nivel ${auth.user.level})`
    });

    db.saveStore();
    io.emit('stock_updated');

    res.json({ success: true, raw_material: rawMat, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Guardar Insumo / Materia Prima (Requiere PIN Nivel 2)
app.post('/api/admin/materials', (req, res) => {
  try {
    const { id, code, name, unit, min_stock, current_stock, pin } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) requerido' });
    }

    const strCode = (code || '').trim().toUpperCase();
    if (!strCode) {
      return res.status(400).json({ success: false, error: '⚠️ El Código / SKU del insumo es obligatorio. Escanea el código de barras de fábrica o presiona el botón ⚡ Auto.' });
    }

    const store = db.getStore();

    const dupMatCode = store.raw_materials.find(m => m.code && m.code.toUpperCase() === strCode && m.id !== parseInt(id || 0));
    if (dupMatCode) {
      return res.status(400).json({ success: false, error: `⚠️ CÓDIGO SKU DUPLICADO: El código "${strCode}" ya está asignado al insumo genérico "${dupMatCode.name}".` });
    }

    const dupMatName = store.raw_materials.find(m => m.name && m.name.trim().toLowerCase() === name.trim().toLowerCase() && m.id !== parseInt(id || 0));
    if (dupMatName) {
      return res.status(400).json({ success: false, error: `⚠️ INSUMO DUPLICADO: Ya existe un insumo genérico registrado con el nombre "${dupMatName.name}".` });
    }
    if (id) {
      const mat = store.raw_materials.find(m => m.id === parseInt(id));
      if (mat) {
        mat.code = strCode;
        mat.name = name;
        mat.unit = unit || 'kg';
        mat.min_stock = parseFloat(min_stock || 5);
        if (current_stock !== undefined) mat.current_stock = parseFloat(current_stock);
      }
    } else {
      const nextId = store.raw_materials.length > 0 ? Math.max(...store.raw_materials.map(m => m.id)) + 1 : 1;
      store.raw_materials.push({
        id: nextId,
        code: strCode,
        name,
        unit: unit || 'kg',
        current_stock: parseFloat(current_stock || 0),
        min_stock: parseFloat(min_stock || 5)
      });
    }
    db.saveStore();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Obtener recetas / escandallos
app.get('/api/admin/recipes', (req, res) => {
  try {
    const store = db.getStore();
    res.json({ success: true, recipes: store.product_recipes || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Guardar receta de un producto generado por producción (Ficha Técnica)
app.post('/api/admin/recipes/save', (req, res) => {
  try {
    const { product_id, ingredients, pin } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) requerido' });
    }

    const pid = parseInt(product_id);
    if (!pid) {
      return res.status(400).json({ success: false, error: 'Debe seleccionar un producto de cocina' });
    }

    const store = db.getStore();
    if (!store.product_recipes) store.product_recipes = [];

    store.product_recipes = store.product_recipes.filter(r => r.product_id !== pid);

    if (Array.isArray(ingredients)) {
      ingredients.forEach(ing => {
        const rawMatId = parseInt(ing.raw_material_id);
        const qtyPerPortion = parseFloat(ing.qty_per_portion || 0);
        if (rawMatId && qtyPerPortion > 0) {
          store.product_recipes.push({
            product_id: pid,
            raw_material_id: rawMatId,
            qty_per_portion: qtyPerPortion
          });
        }
      });
    }

    db.saveStore();
    io.emit('stock_updated');

    res.json({ success: true, product_id: pid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// REGISTRO DE PRODUCCIÓN DIARIA DE COMIDA PREPARADA POR LA COCINA (REQUERIDO NIVEL 2 O 3)
app.post('/api/production/add', (req, res) => {
  try {
    const { product_id, quantity, notes, operator_name, pin } = req.body;

    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN personal de operario o personal registrado (Nivel 1, 2 o 3) requerido' });
    }

    const store = db.getStore();
    const prod = store.products.find(p => p.id === parseInt(product_id));
    if (!prod) {
      return res.status(404).json({ success: false, error: 'Producto de comida elaborada no encontrado' });
    }

    const qtyAdd = parseFloat(quantity || 0);
    if (qtyAdd <= 0) {
      return res.status(400).json({ success: false, error: 'La cantidad producida debe ser mayor a 0' });
    }

    prod.stock_prepared = parseFloat(((prod.stock_prepared || 0) + qtyAdd).toFixed(3));
    prod.is_prepared_food = 1;

    // Descontar insumos genéricos según la Receta / Ficha Técnica (Escandallo)
    const recipes = (store.product_recipes || []).filter(r => r.product_id === prod.id);
    const deductedMaterials = [];

    recipes.forEach(r => {
      const mat = store.raw_materials.find(m => m.id === r.raw_material_id);
      if (mat) {
        const totalDeduct = parseFloat((r.qty_per_portion * qtyAdd).toFixed(4));
        mat.current_stock = parseFloat(Math.max(0, (mat.current_stock || 0) - totalDeduct).toFixed(4));
        deductedMaterials.push({
          material_name: mat.name,
          code: mat.code,
          unit: mat.unit,
          qty_deducted: totalDeduct,
          remaining_stock: mat.current_stock
        });
      }
    });

    if (!store.production_entries) store.production_entries = [];

    const nextId = store.production_entries.length > 0 ? Math.max(...store.production_entries.map(e => e.id)) + 1 : 1;
    const newEntry = {
      id: nextId,
      date: new Date().toISOString(),
      product_id: prod.id,
      product_name: prod.name,
      unit_type: prod.unit_type || 'kg',
      quantity: qtyAdd,
      notes: notes || '',
      operator_name: operator_name ? String(operator_name).trim() : auth.user.name,
      deducted_materials: deductedMaterials,
      registered_by: `${auth.user.name} (Nivel ${auth.user.level})`
    };

    store.production_entries.unshift(newEntry);
    db.saveStore();
    io.emit('stock_updated');

    res.json({ success: true, product: prod, entry: newEntry, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// MÓDULO DE PRODUCCIÓN PREVIA DE LOTES (COCINA, PANADERÍA Y COMIDA POR KILO)
// ==========================================

// GET /api/production/batches
app.get('/api/production/batches', (req, res) => {
  try {
    const store = db.getStore();
    if (!store.production_batches) store.production_batches = [];
    res.json({
      success: true,
      batches: store.production_batches,
      products: store.products || [],
      raw_materials: store.raw_materials || []
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/production/batches/start (Iniciar Lote de Producción)
app.post('/api/production/batches/start', (req, res) => {
  try {
    const { product_id, quantity, category_sector, operator_name, notes, pin } = req.body;

    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de operario registrado (Nivel 1, 2 o 3) requerido' });
    }

    const store = db.getStore();
    const prod = store.products.find(p => p.id === parseInt(product_id));
    if (!prod) {
      return res.status(404).json({ success: false, error: 'Producto de comida elaborada o panificados no encontrado' });
    }

    const qtyAdd = parseFloat(quantity || 0);
    if (qtyAdd <= 0) {
      return res.status(400).json({ success: false, error: 'La cantidad a producir debe ser mayor a 0' });
    }

    if (!store.production_batches) store.production_batches = [];

    const nextId = store.production_batches.length > 0 ? Math.max(...store.production_batches.map(b => b.id)) + 1 : 1;
    const batchNumber = `#PROD-${100 + nextId}`;

    const newBatch = {
      id: nextId,
      batch_number: batchNumber,
      product_id: prod.id,
      product_name: prod.name,
      category_sector: category_sector || 'Cocina - Elaboración General',
      quantity: qtyAdd,
      unit_type: prod.unit_type || 'kg',
      operator_name: operator_name ? String(operator_name).trim() : auth.user.name,
      operator_pin: auth.user.pin,
      started_at: new Date().toISOString(),
      finished_at: null,
      duration_seconds: null,
      status: 'in_progress',
      notes: notes || '',
      deducted_materials: []
    };

    store.production_batches.unshift(newBatch);
    db.saveStore();

    io.emit('production_updated', newBatch);

    res.json({ success: true, batch: newBatch });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/production/batches/:id/finish (Concluir Lote de Producción)
app.post('/api/production/batches/:id/finish', (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const store = db.getStore();
    if (!store.production_batches) store.production_batches = [];
    const batch = store.production_batches.find(b => b.id === parseInt(id));

    if (!batch) {
      return res.status(404).json({ success: false, error: 'Lote de producción no encontrado' });
    }

    if (batch.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Este lote de producción ya fue marcado como finalizado' });
    }

    const now = new Date();
    const startTime = new Date(batch.started_at);
    const durationSeconds = Math.max(1, Math.floor((now - startTime) / 1000));

    batch.finished_at = now.toISOString();
    batch.duration_seconds = durationSeconds;
    batch.status = 'completed';
    if (notes) batch.notes = (batch.notes ? `${batch.notes} | ` : '') + notes;

    // Actualizar Stock de Comida Preparada y Análisis Estadístico de Costos
    const prod = store.products.find(p => p.id === batch.product_id);
    const deductedMaterials = [];
    let rawMaterialCostTotal = 0;

    if (prod) {
      prod.stock_prepared = parseFloat(((prod.stock_prepared || 0) + batch.quantity).toFixed(3));
      prod.is_prepared_food = 1;

      // Descontar insumos genéricos según Ficha Técnica (Escandallo) y calcular costo directo de materias primas
      const recipes = (store.product_recipes || []).filter(r => r.product_id === prod.id);
      recipes.forEach(r => {
        const mat = store.raw_materials.find(m => m.id === r.raw_material_id);
        if (mat) {
          const totalDeduct = parseFloat((r.qty_per_portion * batch.quantity).toFixed(4));
          const unitCost = parseFloat(mat.cost_per_unit || mat.cost || 0);
          const matCost = parseFloat((totalDeduct * unitCost).toFixed(2));
          rawMaterialCostTotal += matCost;

          mat.current_stock = parseFloat(Math.max(0, (mat.current_stock || 0) - totalDeduct).toFixed(4));
          deductedMaterials.push({
            material_name: mat.name,
            code: mat.code,
            unit: mat.unit,
            qty_deducted: totalDeduct,
            cost_per_unit: unitCost,
            total_cost: matCost,
            remaining_stock: mat.current_stock
          });
        }
      });
      batch.deducted_materials = deductedMaterials;

      // Cálculo de Mano de Obra por Tiempo (Tarifa Horaria del Operario)
      const hourlyRate = parseFloat((store.settings && store.settings.production_hourly_wage) || 3500);
      const laborCostTotal = parseFloat(((durationSeconds / 3600) * hourlyRate).toFixed(2));
      const totalBatchCost = parseFloat((rawMaterialCostTotal + laborCostTotal).toFixed(2));
      const unitCostReal = parseFloat((totalBatchCost / batch.quantity).toFixed(2));
      const sellingPriceUnit = parseFloat(prod.price || 0);
      const profitMarginPercent = sellingPriceUnit > 0 
        ? parseFloat((((sellingPriceUnit - unitCostReal) / sellingPriceUnit) * 100).toFixed(1)) 
        : 0;

      // Guardar Análisis Financiero y Estadístico en el Lote
      batch.cost_analysis = {
        raw_material_cost_total: rawMaterialCostTotal,
        hourly_rate: hourlyRate,
        labor_cost_total: laborCostTotal,
        total_batch_cost: totalBatchCost,
        unit_cost_real: unitCostReal,
        selling_price_unit: sellingPriceUnit,
        profit_margin_percent: profitMarginPercent
      };

      // Actualizar automáticamente el costo unitario del producto en la base de datos
      prod.cost_price = unitCostReal;
    }

    // Guardar también en el registro histórico de production_entries para auditoría
    if (!store.production_entries) store.production_entries = [];
    store.production_entries.unshift({
      id: store.production_entries.length + 1,
      date: batch.finished_at,
      product_id: batch.product_id,
      product_name: batch.product_name,
      unit_type: batch.unit_type,
      quantity: batch.quantity,
      cost_analysis: batch.cost_analysis || null,
      notes: `Lote ${batch.batch_number} - Duración: ${Math.floor(durationSeconds/60)}m ${durationSeconds%60}s | Costo Unitario Real: $${batch.cost_analysis ? batch.cost_analysis.unit_cost_real : 0}`,
      operator_name: batch.operator_name,
      deducted_materials: deductedMaterials,
      registered_by: `${batch.operator_name} (Lote KDS)`
    });

    db.saveStore();

    io.emit('production_updated', batch);
    io.emit('stock_updated');

    res.json({ success: true, batch, product: prod });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ARQUEO DE SOBRANTES Y CONCILIACIÓN DE DESPERDICIOS/MERMAS/OFERTAS AL CIERRE DE CAJA
app.post('/api/cash/shift/reconcile-food', (req, res) => {
  try {
    const { box_number, measured_items, pin } = req.body;

    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN no registrado o inválido.' });
    }

    const store = db.getStore();
    if (!store.food_waste_logs) store.food_waste_logs = [];

    const numBox = parseInt(box_number || 1);
    const wasteResults = [];

    if (Array.isArray(measured_items)) {
      measured_items.forEach(item => {
        const prod = store.products.find(p => p.id === parseInt(item.product_id));
        if (prod) {
          const expectedStock = parseFloat((prod.stock_prepared || 0).toFixed(3));
          const measuredKg = parseFloat(parseFloat(item.measured_remaining || 0).toFixed(3));
          const wasteKg = parseFloat(Math.max(0, expectedStock - measuredKg).toFixed(3));
          const action = item.action || 'waste';

          // Resetear el producto fresco original a 0 para el siguiente turno
          prod.stock_prepared = 0;

          if (measuredKg > 0) {
            if (action === 'offer') {
              // 1. OFERTA REFRIGERADA CON CÓDIGO DE BARRAS EAN-13 PARA LA BALANZA
              const discountPercent = parseFloat(item.discount_percent || 30);
              const hours = parseInt(item.refrigerated_hours || 4);
              const offerPrice = parseFloat((prod.price * (1 - (discountPercent / 100))).toFixed(2));
              
              const offerPlu = `9${String(prod.plu_code || prod.id).padStart(3, '0')}`;
              const offerName = `❄️ ${prod.name} (Refrigerado ${hours}hs - ${discountPercent}% OFF)`;
              const scaleEanCode = `20${offerPlu}00000`; // Prefijo Balanza EAN-13

              // Buscar si ya existe la oferta o crear un producto nuevo en oferta
              let offerProd = store.products.find(p => p.is_refrigerated_offer === 1 && p.original_product_id === prod.id);
              if (offerProd) {
                offerProd.name = offerName;
                offerProd.price = offerPrice;
                offerProd.original_price = prod.price;
                offerProd.stock_prepared = parseFloat(((offerProd.stock_prepared || 0) + measuredKg).toFixed(3));
                offerProd.refrigerated_hours = hours;
                offerProd.discount_percent = discountPercent;
                offerProd.available = 1;
              } else {
                const nextId = store.products.length > 0 ? Math.max(...store.products.map(p => p.id)) + 1 : 1;
                offerProd = {
                  id: nextId,
                  original_product_id: prod.id,
                  category_id: prod.category_id,
                  name: offerName,
                  description: `Conservación en frío de ${hours} hs. Calidad óptima a precio rebajado (${discountPercent}% OFF).`,
                  price: offerPrice,
                  original_price: prod.price,
                  image_url: prod.image_url,
                  available: 1,
                  stock_prepared: measuredKg,
                  unit_type: 'kg',
                  is_prepared_food: 1,
                  is_refrigerated_offer: 1,
                  discount_percent: discountPercent,
                  refrigerated_hours: hours,
                  plu_code: offerPlu,
                  barcode: scaleEanCode
                };
                store.products.push(offerProd);
              }

              const nextLogId = store.food_waste_logs.length > 0 ? Math.max(...store.food_waste_logs.map(w => w.id)) + 1 : 1;
              const offerRecord = {
                id: nextLogId,
                date: new Date().toISOString(),
                box_number: numBox,
                product_id: prod.id,
                product_name: prod.name,
                action: 'offer',
                action_label: `🏷️ Oferta Refrigerada (${discountPercent}% OFF)`,
                unit_type: 'kg',
                expected_kg: expectedStock,
                measured_kg: measuredKg,
                waste_kg: 0,
                scale_ean: scaleEanCode,
                offer_price: offerPrice,
                notes: `Convertido a Oferta Refrigerada (${hours} hs de conservación, ${discountPercent}% descuento)`,
                registered_by: `${auth.user.name} (Nivel ${auth.user.level})`
              };
              store.food_waste_logs.unshift(offerRecord);
              wasteResults.push(offerRecord);

            } else if (action === 'reprocess') {
              // 2. REPROCESADO EN COCINA (DESCUENTO 100% A INSUMO / MATERIA PRIMA)
              const rawMatId = parseInt(item.target_raw_material_id || 0);
              const rawMat = (store.raw_materials || []).find(m => m.id === rawMatId);

              if (rawMat) {
                rawMat.current_stock = parseFloat(((rawMat.current_stock || 0) + measuredKg).toFixed(3));
              }

              const nextLogId = store.food_waste_logs.length > 0 ? Math.max(...store.food_waste_logs.map(w => w.id)) + 1 : 1;
              const reprocessRecord = {
                id: nextLogId,
                date: new Date().toISOString(),
                box_number: numBox,
                product_id: prod.id,
                product_name: prod.name,
                action: 'reprocess',
                action_label: `♻️ Reprocesado en Cocina (Insumo: ${rawMat ? rawMat.name : 'Cocina'})`,
                unit_type: 'kg',
                expected_kg: expectedStock,
                measured_kg: measuredKg,
                waste_kg: 0,
                notes: `Reprocesado 100% como ingrediente para ${rawMat ? rawMat.name : 'Cocina'}`,
                registered_by: `${auth.user.name} (Nivel ${auth.user.level})`
              };
              store.food_waste_logs.unshift(reprocessRecord);
              wasteResults.push(reprocessRecord);

            } else {
              // 3. DESPERDICIO / TIRADO / INAPTO
              const nextLogId = store.food_waste_logs.length > 0 ? Math.max(...store.food_waste_logs.map(w => w.id)) + 1 : 1;
              const wasteRecord = {
                id: nextLogId,
                date: new Date().toISOString(),
                box_number: numBox,
                product_id: prod.id,
                product_name: prod.name,
                action: 'waste',
                action_label: '🗑️ Desperdicio / Tirado',
                unit_type: 'kg',
                expected_kg: expectedStock,
                measured_kg: 0,
                waste_kg: measuredKg,
                notes: item.notes || 'Comida sobrante no apta dada de baja al cierre de turno',
                registered_by: `${auth.user.name} (Nivel ${auth.user.level})`
              };
              store.food_waste_logs.unshift(wasteRecord);
              wasteResults.push(wasteRecord);
            }
          }
        }
      });
    }

    db.saveStore();
    io.emit('stock_updated');

    res.json({ success: true, waste_logs: wasteResults, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// RUTAS API DE MENÚ Y CLIENTE
app.get('/api/menu', (req, res) => {
  try {
    const store = db.getStore();
    const categories = [...store.categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const products = store.products;
    const settings = getSettingsMap();

    res.json({
      success: true,
      categories,
      products,
      settings
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// REGISTRO DE NUEVO SOCIO DEL CLUB / EDICIÓN DE PERFIL
app.post('/api/club/register', (req, res) => {
  try {
    const { dni, name, phone, address, birthdate, referral_code } = req.body;
    const strDni = (dni || '').trim();
    const strName = (name || '').trim();
    const strPhone = (phone || '').trim();

    if (!strDni || !strName || !strPhone) {
      return res.status(400).json({ success: false, error: '⚠️ DNI, Nombre y Teléfono WhatsApp son obligatorios.' });
    }

    const store = db.getStore();
    if (!store.customers) store.customers = [];

    let customer = store.customers.find(c => String(c.dni).trim() === strDni);
    let isNew = false;
    const welcomePts = parseInt((store.settings && store.settings.welcome_points) || 1000);
    const referralPts = parseInt((store.settings && store.settings.referral_points) || 500);

    if (customer) {
      customer.name = strName;
      customer.phone = strPhone;
      if (address) customer.address = address.trim();
      if (birthdate) customer.birthdate = birthdate.trim();
      customer.updated_at = new Date().toISOString();
    } else {
      isNew = true;
      const nextId = store.customers.length > 0 ? Math.max(...store.customers.map(c => c.id)) + 1 : 1;
      customer = {
        id: nextId,
        dni: strDni,
        name: strName,
        phone: strPhone,
        address: (address || '').trim(),
        birthdate: (birthdate || '').trim(),
        points: welcomePts,
        total_orders: 0,
        total_spent: 0,
        referral_code: `REF-${strDni}`,
        referred_by: (referral_code || '').trim(),
        history: [
          {
            date: new Date().toISOString(),
            description: '🎁 Regalo de Bienvenida al Club La Gran Rotisería',
            points_change: welcomePts,
            type: 'welcome'
          }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Si fue referido por otro socio, acreditarle puntos al referente
      if (referral_code) {
        const cleanRef = String(referral_code).trim().replace('REF-', '');
        const referrer = store.customers.find(c => String(c.dni).trim() === cleanRef || String(c.phone).trim() === cleanRef);
        if (referrer) {
          referrer.points = (referrer.points || 0) + referralPts;
          if (!referrer.history) referrer.history = [];
          referrer.history.unshift({
            date: new Date().toISOString(),
            description: `👥 Premio por Invitar al Nuevo Socio ${strName} (DNI ${strDni})`,
            points_change: referralPts,
            type: 'referral'
          });
        }
      }

      store.customers.unshift(customer);
    }

    db.saveStore();
    io.emit('customer_updated', customer);

    res.json({
      success: true,
      is_new: isNew,
      welcome_points: isNew ? welcomePts : 0,
      customer
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// RECUPERAR CUENTA Y SALDO DE SOCIO POR DNI
app.post('/api/club/login-by-dni', (req, res) => {
  try {
    const { dni } = req.body;
    const strDni = (dni || '').trim();
    if (!strDni) {
      return res.status(400).json({ success: false, error: 'Ingrese el número de DNI.' });
    }

    const store = db.getStore();
    const customer = (store.customers || []).find(c => String(c.dni).trim() === strDni);

    if (!customer) {
      return res.status(404).json({ success: false, error: `Socio no encontrado con DNI ${strDni}. Debe asociarse completando su perfil.` });
    }

    res.json({ success: true, customer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const { customer_name, customer_phone, customer_dni, address, delivery_type, payment_method, payment_note, notes, items, total } = req.body;

    if (!customer_name || !customer_phone || !items || !total) {
      return res.status(400).json({ success: false, error: 'Faltan datos obligatorios del pedido' });
    }

    const store = db.getStore();
    const totalOrders = store.orders.length;
    const orderNumber = `#${101 + totalOrders}`;

    const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);

    if (payment_method && payment_method.includes('Cuenta Corriente')) {
      const account = store.customer_accounts.find(a => 
        a.dni === payment_note || 
        a.phone.includes(customer_phone) || 
        customer_phone.includes(a.phone)
      );

      if (!account) {
        return res.status(400).json({ 
          success: false, 
          error: `El cliente ${customer_name} no posee una Cuenta Corriente autorizada en el sistema. Debe registrarse previamente en el Panel de Administración.` 
        });
      }
    }

    const nextId = store.orders.length > 0 ? Math.max(...store.orders.map(o => o.id)) + 1 : 1;
    const newOrder = {
      id: nextId,
      order_number: orderNumber,
      customer_name,
      customer_phone,
      customer_dni: customer_dni || '',
      address: address || 'Retiro en local',
      delivery_type: delivery_type || 'delivery',
      payment_method: payment_method || 'Efectivo',
      payment_note: payment_note || '',
      notes: notes || '',
      items: typeof items === 'string' ? items : JSON.parse(itemsJson),
      total: parseFloat(total),
      status: 'nuevo',
      paid: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    store.orders.unshift(newOrder);

    // Acreditar puntos automáticamente al Socio si está registrado en el Club
    const strSearchDni = (customer_dni || '').trim();
    let customerObj = null;
    if (strSearchDni) {
      customerObj = (store.customers || []).find(c => String(c.dni).trim() === strSearchDni);
    }
    if (!customerObj && customer_phone) {
      customerObj = (store.customers || []).find(c => String(c.phone).trim() === String(customer_phone).trim());
    }

    if (customerObj) {
      const ptsRatio = parseFloat((store.settings && store.settings.points_per_100_currency) || 3);
      const pointsEarned = Math.floor((parseFloat(total) / 100) * ptsRatio);
      
      if (pointsEarned > 0) {
        customerObj.points = (customerObj.points || 0) + pointsEarned;
        customerObj.total_orders = (customerObj.total_orders || 0) + 1;
        customerObj.total_spent = (customerObj.total_spent || 0) + parseFloat(total);
        
        if (!customerObj.history) customerObj.history = [];
        customerObj.history.unshift({
          date: new Date().toISOString(),
          description: `🛒 Puntos acumulados por Pedido ${orderNumber} ($${total})`,
          points_change: pointsEarned,
          type: 'purchase'
        });

        newOrder.points_earned = pointsEarned;
      }
    }

    db.saveStore();

    io.emit('new_order', newOrder);
    if (customerObj) io.emit('customer_updated', customerObj);

    const settings = getSettingsMap();
    if (settings.auto_print_epson === '1' && settings.epson_printer_ip) {
      printToEpsonNetwork(newOrder, settings.epson_printer_ip, settings.epson_printer_port || 9100)
        .then(() => console.log(`🖨️ Ticket ${orderNumber} impreso automáticamente en Epson ${settings.epson_printer_ip}`))
        .catch(err => console.error(`⚠️ Error al auto-imprimir en Epson: ${err.message}`));
    }

    res.json({
      success: true,
      order: newOrder,
      customer: customerObj || null
    });
  } catch (err) {
    console.error('Error al guardar pedido:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// RUTAS API DE PANTALLA DE COCINA (KDS), CAJA & ADMIN
app.get('/api/orders', (req, res) => {
  try {
    const store = db.getStore();
    const { status } = req.query;
    let orders = store.orders;
    if (status) {
      orders = orders.filter(o => o.status === status);
    }
    orders = orders.map(o => ({
      ...o,
      items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items
    }));

    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/orders/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status, delivered_at } = req.body;

    const validStatuses = ['nuevo', 'en_preparacion', 'en_camino', 'entregado', 'cancelado', 'ready', 'bar_despachado', 'en_proceso', 'falta_insumo'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Estado no válido' });
    }

    const store = db.getStore();
    const existingOrder = store.orders.find(o => o.id === parseInt(id));

    if (!existingOrder) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
    }

    const isCuentaCorriente = existingOrder.payment_method && existingOrder.payment_method.includes('Cuenta Corriente');

    if (isCuentaCorriente && ['en_preparacion', 'en_camino', 'entregado'].includes(status)) {
      const account = store.customer_accounts.find(a => 
        a.dni === existingOrder.payment_note || 
        a.phone.includes(existingOrder.customer_phone) || 
        existingOrder.customer_phone.includes(a.phone)
      );

      if (!account) {
        return res.status(400).json({ 
          success: false, 
          error: `⚠️ BLOQUEADO EN COCINA: El cliente ${existingOrder.customer_name} no posee una Cuenta Corriente autorizada en el sistema.` 
        });
      }

      const totalDeudaPróxima = (account.balance || 0) + existingOrder.total;
      if (totalDeudaPróxima > account.credit_limit) {
        return res.status(400).json({
          success: false,
          error: `⚠️ BLOQUEADO EN COCINA (LÍMITE EXCEDIDO): Deuda actual ($${account.balance}) + Pedido ($${existingOrder.total}) = $${totalDeudaPróxima}, superando el Límite Fiable de $${account.credit_limit}.\n\nSe requiere un Cobro Parcial en el Admin para desbloquear la cocina.`
        });
      }
    }

    if (status === 'entregado' && !isCuentaCorriente && existingOrder.paid !== 1) {
      return res.status(400).json({
        success: false,
        error: `No se puede marcar como Entregado el pedido ${existingOrder.order_number} porque aún no ha sido ingresado a Caja ($${existingOrder.total}). Primero debe ingresarse a caja.`
      });
    }

    if (status === 'en_preparacion' && existingOrder.status !== 'en_preparacion') {
      const orderItems = typeof existingOrder.items === 'string' ? JSON.parse(existingOrder.items) : existingOrder.items;
      if (Array.isArray(orderItems)) {
        orderItems.forEach(item => {
          const recipes = store.product_recipes.filter(r => r.product_id === item.id);
          recipes.forEach(r => {
            const rawMat = store.raw_materials.find(m => m.id === r.raw_material_id);
            if (rawMat) {
              const discountQty = (r.qty_per_portion || 0) * (item.qty || 1);
              rawMat.current_stock = Math.max(0, (rawMat.current_stock || 0) - discountQty);
            }
          });
        });
      }
    }

    if (status === 'entregado' && isCuentaCorriente && existingOrder.status !== 'entregado') {
      const account = store.customer_accounts.find(a => 
        a.dni === existingOrder.payment_note || 
        a.phone.includes(existingOrder.customer_phone) || 
        existingOrder.customer_phone.includes(a.phone)
      );
      if (account) {
        account.balance = (account.balance || 0) + existingOrder.total;
      }
    }

    existingOrder.status = status;
    if (delivered_at) existingOrder.delivered_at = delivered_at;
    existingOrder.updated_at = new Date().toISOString();
    db.saveStore();

    const updatedOrder = {
      ...existingOrder,
      items: typeof existingOrder.items === 'string' ? JSON.parse(existingOrder.items) : existingOrder.items
    };

    io.emit('order_updated', updatedOrder);

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// NOTIFICACIÓN DE INCIDENTE / FALTA DE INSUMO EN BARRA CON ALERTA A CAJA
app.post('/api/bar/orders/:id/incident', (req, res) => {
  try {
    const { id } = req.params;
    const { reason, note, barista_name } = req.body;

    const store = db.getStore();
    const order = store.orders.find(o => o.id === parseInt(id));
    if (!order) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
    }

    order.bar_status = 'en_proceso';
    order.bar_incident_reason = reason || 'Falta de Insumo';
    order.bar_incident_note = note || '';
    order.bar_incident_by = barista_name || 'Barista';
    order.bar_incident_at = new Date().toISOString();
    order.updated_at = new Date().toISOString();

    db.saveStore();

    const updatedOrder = {
      ...order,
      items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items
    };

    io.emit('order_updated', updatedOrder);
    io.emit('bar_incident_alert', {
      order_id: order.id,
      order_number: order.order_number,
      customer_name: order.customer_name,
      reason: order.bar_incident_reason,
      note: order.bar_incident_note,
      barista_name: order.bar_incident_by,
      time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    });

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/orders/:id/paid', (req, res) => {
  try {
    const { id } = req.params;
    const { paid } = req.body;

    const store = db.getStore();
    const order = store.orders.find(o => o.id === parseInt(id));
    if (order) {
      order.paid = paid ? 1 : 0;
      order.updated_at = new Date().toISOString();
      db.saveStore();

      const updatedOrder = {
        ...order,
        items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items
      };
      io.emit('order_updated', updatedOrder);
      return res.json({ success: true, order: updatedOrder });
    }
    res.status(404).json({ success: false, error: 'Pedido no encontrado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GESTIÓN DE SOCIOS DEL CLUB Y REGISTRO CENTRALIZADO DE PUNTOS
app.get('/api/admin/customers', (req, res) => {
  try {
    const store = db.getStore();
    res.json({
      success: true,
      customers: store.customers || [],
      settings: getSettingsMap()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/customers/adjust-points', (req, res) => {
  try {
    const { customer_id, points_change, reason, pin } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La acreditación o ajuste manual de puntos requiere PIN de Encargado (Nivel 2) o Gerente (Nivel 3).' });
    }

    const store = db.getStore();
    const customer = (store.customers || []).find(c => c.id === parseInt(customer_id));

    if (!customer) {
      return res.status(404).json({ success: false, error: 'Socio no encontrado en la base de datos.' });
    }

    const changeNum = parseInt(points_change || 0);
    if (changeNum === 0) {
      return res.status(400).json({ success: false, error: 'La cantidad de puntos a ajustar debe ser distinta de 0.' });
    }

    customer.points = Math.max(0, (customer.points || 0) + changeNum);
    if (!customer.history) customer.history = [];

    customer.history.unshift({
      date: new Date().toISOString(),
      description: `⭐ Ajuste Manual por ${auth.user.name}: ${reason || 'Acreditación especial de puntos'}`,
      points_change: changeNum,
      type: 'manual_adjustment'
    });

    db.saveStore();
    io.emit('customer_updated', customer);

    res.json({ success: true, customer, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// APIS DE MERCADERÍA, INSUMOS Y PROVEEDORES
app.get('/api/admin/stock', (req, res) => {
  try {
    const store = db.getStore();
    res.json({
      success: true,
      suppliers: store.suppliers || [],
      raw_materials: store.raw_materials || [],
      product_recipes: store.product_recipes || [],
      stock_entries: store.stock_entries || [],
      stock_adjustments: store.stock_adjustments || [],
      production_entries: store.production_entries || []
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// RUTAS DE CUENTAS CORRIENTES (REQUERIDO NIVEL 3 - GERENTE / DUEÑO)
app.get('/api/admin/accounts', (req, res) => {
  try {
    const store = db.getStore();
    res.json({ 
      success: true, 
      accounts: store.customer_accounts || [],
      payments: store.account_payments || []
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/accounts', (req, res) => {
  try {
    const { id, name, dni, phone, address, payment_term, credit_limit, pin } = req.body;

    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La apertura y gestión de Cuentas Corrientes requiere PIN de Gerente / Dueño (Nivel 3).' });
    }

    if (!name || !dni || !phone) {
      return res.status(400).json({ success: false, error: 'Nombre, DNI y Teléfono son obligatorios' });
    }

    const store = db.getStore();
    if (id) {
      const acc = store.customer_accounts.find(a => a.id === parseInt(id));
      if (acc) {
        acc.name = name;
        acc.dni = dni;
        acc.phone = phone;
        acc.address = address || '';
        acc.payment_term = payment_term || 'quincenal';
        acc.credit_limit = parseFloat(credit_limit || 20000);
        db.saveStore();
      }
    } else {
      const nextId = store.customer_accounts.length > 0 ? Math.max(...store.customer_accounts.map(a => a.id)) + 1 : 1;
      store.customer_accounts.push({
        id: nextId,
        name,
        dni,
        phone,
        address: address || '',
        payment_term: payment_term || 'quincenal',
        credit_limit: parseFloat(credit_limit || 20000),
        balance: 0,
        status: 'active',
        created_at: new Date().toISOString()
      });
      db.saveStore();
    }

    res.json({ success: true, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/accounts/:id/payment', (req, res) => {
  try {
    const { id } = req.params;
    const { amount, payment_type, notes } = req.body;

    const store = db.getStore();
    const account = store.customer_accounts.find(a => a.id === parseInt(id));
    if (!account) {
      return res.status(404).json({ success: false, error: 'Cuenta de cliente no encontrada' });
    }

    const payAmount = parseFloat(amount || 0);
    if (payAmount <= 0) {
      return res.status(400).json({ success: false, error: 'El monto ingresado debe ser mayor a $0' });
    }

    account.balance = Math.max(0, (account.balance || 0) - payAmount);

    const nextPaymentId = store.account_payments.length > 0 ? Math.max(...store.account_payments.map(p => p.id)) + 1 : 1;
    store.account_payments.unshift({
      id: nextPaymentId,
      account_id: account.id,
      customer_name: account.name,
      amount: payAmount,
      type: payment_type || 'parcial',
      notes: notes || '',
      date: new Date().toISOString()
    });

    const totalOrders = store.orders.length;
    const orderNumber = `#PAGO-CC-${101 + totalOrders}`;

    store.orders.unshift({
      id: store.orders.length > 0 ? Math.max(...store.orders.map(o => o.id)) + 1 : 1,
      order_number: orderNumber,
      customer_name: `COBRO CC: ${account.name}`,
      customer_phone: account.phone,
      address: account.address,
      delivery_type: 'retiro',
      payment_method: 'Efectivo',
      payment_note: `Pago ${payment_type === 'total' ? 'Total' : 'Parcial'} Cuenta Corriente`,
      notes: notes || `Ingreso de cobro a cuenta corriente de ${account.name}`,
      items: JSON.stringify([{ name: `Cobro Cuenta Corriente (${payment_type})`, qty: 1, price: payAmount }]),
      total: payAmount,
      status: 'entregado',
      paid: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    db.saveStore();
    io.emit('order_updated');

    res.json({ success: true, account });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/cash/summary', (req, res) => {
  try {
    const store = db.getStore();
    const rawOrders = store.orders.filter(o => o.status !== 'cancelado');

    let totalSales = 0;
    let cashTotal = 0;
    let cashCollected = 0;
    let cashPending = 0;
    let cardTotal = 0;
    let digitalTotal = 0;

    const orders = rawOrders.map(o => {
      const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
      const isPaid = o.paid === 1;
      const total = o.total;

      totalSales += total;

      if (o.payment_method === 'Efectivo') {
        cashTotal += total;
        if (isPaid) {
          cashCollected += total;
        } else {
          cashPending += total;
        }
      } else if (o.payment_method.includes('Tarjeta')) {
        cardTotal += total;
      } else {
        digitalTotal += total;
      }

      return {
        ...o,
        items
      };
    });

    const activeShifts = (store.cash_shifts || []).filter(s => s.status === 'open');
    const openBoxNumbers = activeShifts.map(s => s.box_number || 1);

    res.json({
      success: true,
      active_shift: activeShifts.length > 0 ? activeShifts[0] : null,
      active_shifts: activeShifts,
      open_box_numbers: openBoxNumbers,
      summary: {
        total_sales: totalSales,
        cash_total: cashTotal,
        cash_collected: cashCollected,
        cash_pending: cashPending,
        card_total: cardTotal,
        digital_total: digitalTotal,
        orders_count: orders.length
      },
      orders
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/print-epson/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const store = db.getStore();
    const order = store.orders.find(o => o.id === parseInt(id));
    if (!order) return res.status(404).json({ success: false, error: 'Pedido no encontrado' });

    order.items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;

    const settings = getSettingsMap();
    const printerIp = req.body.printer_ip || settings.epson_printer_ip;
    const printerPort = parseInt(req.body.printer_port || settings.epson_printer_port || 9100);

    if (!printerIp) {
      return res.status(400).json({ success: false, error: 'No se ha configurado la IP de la impresora Epson' });
    }

    await printToEpsonNetwork(order, printerIp, printerPort);
    res.json({ success: true, message: `Ticket enviado a impresora Epson en ${printerIp}:${printerPort}` });
  } catch (err) {
    console.error('Error al imprimir en Epson:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

function printToEpsonNetwork(order, ip, port = 9100) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(5000);

    client.connect(port, ip, () => {
      const ESC = '\x1B';
      const GS = '\x1D';

      let buffer = '';
      buffer += ESC + '@';
      buffer += ESC + 'a' + '\x01';
      buffer += ESC + '!' + '\x38';
      buffer += `COMANDA - COCINA\n`;
      buffer += ESC + '!' + '\x00';
      buffer += `--------------------------------\n`;

      buffer += ESC + 'a' + '\x00';
      buffer += `ORDEN: ${order.order_number}\n`;
      buffer += `FECHA: ${new Date().toLocaleString('es-AR')}\n`;
      buffer += `CLIENTE: ${order.customer_name}\n`;
      buffer += `TEL: ${order.customer_phone}\n`;
      buffer += `TIPO: ${order.delivery_type === 'delivery' ? 'DELIVERY A DOMICILIO' : 'RETIRO EN LOCAL'}\n`;
      if (order.address) buffer += `DIR: ${order.address}\n`;
      buffer += `PAGO: ${order.payment_method} ${order.payment_note ? `(${order.payment_note})` : ''}\n`;
      buffer += `ESTADO CAJA: ${order.paid ? 'COBRADO EN CAJA [OK]' : 'PENDIENTE DE COBRO'}\n`;
      buffer += `--------------------------------\n`;

      buffer += ESC + '!' + '\x08';
      buffer += `CANT  PRODUCTO                    TOTAL\n`;
      buffer += ESC + '!' + '\x00';

      if (Array.isArray(order.items)) {
        order.items.forEach(item => {
          const qty = `${item.qty}x`.padEnd(5);
          const name = item.name.substring(0, 20).padEnd(20);
          const total = `$${Math.round(item.price * item.qty)}`.padStart(7);
          buffer += `${qty}${name}${total}\n`;
        });
      }

      buffer += `--------------------------------\n`;
      if (order.notes) {
        buffer += ESC + '!' + '\x08';
        buffer += `NOTAS: ${order.notes}\n`;
        buffer += ESC + '!' + '\x00';
        buffer += `--------------------------------\n`;
      }

      buffer += ESC + 'a' + '\x02';
      buffer += ESC + '!' + '\x20';
      buffer += `TOTAL: $${Math.round(order.total)}\n`;
      buffer += ESC + '!' + '\x00';

      buffer += ESC + 'a' + '\x01';
      buffer += `\n-- La Gran Rotiseria --\n\n\n\n`;

      buffer += GS + 'V' + '\x41' + '\x03';

      client.write(Buffer.from(buffer, 'latin1'), () => {
        client.end();
        resolve();
      });
    });

    client.on('error', (err) => {
      client.destroy();
      reject(err);
    });

    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Tiempo de espera agotado al conectar con la impresora Epson'));
    });
  });
}

// RUTAS API PRODUCTOS & CATEGORÍAS (REQUERIDO NIVEL 3 - GERENTE / DUEÑO)
app.get('/api/admin/products', (req, res) => {
  try {
    const store = db.getStore();
    const products = store.products.map(p => {
      const cat = store.categories.find(c => c.id === p.category_id);
      return {
        ...p,
        category_name: cat ? cat.name : 'Sin categoría',
        category_icon: cat ? cat.icon : '🍽️'
      };
    });
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/products', (req, res) => {
  try {
    const { id, code, category_id, name, description, price, image_url, video_url, points_cost, available, barcode, plu_code, unit_type, is_weighed, pin } = req.body;

    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La modificación del menú requiere PIN de Gerente / Dueño (Nivel 3).' });
    }

    const store = db.getStore();
    const strCode = code ? String(code).trim().toUpperCase() : '';
    const strBarcode = barcode ? String(barcode).trim() : '';
    const strPlu = plu_code ? String(plu_code).trim() : '';

    if (strCode) {
      const dupCode = store.products.find(p => p.code === strCode && p.id !== parseInt(id || 0));
      if (dupCode) {
        return res.status(400).json({ success: false, error: `⚠️ CÓDIGO SKU DUPLICADO: El código "${strCode}" ya pertenece al plato "${dupCode.name}".` });
      }
    }

    if (strBarcode) {
      const dup = store.products.find(p => p.barcode === strBarcode && p.id !== parseInt(id || 0));
      if (dup) {
        return res.status(400).json({ success: false, error: `⚠️ CÓDIGO DE BARRAS DUPLICADO: El código "${strBarcode}" ya pertenece al plato "${dup.name}".` });
      }
    }

    if (strPlu) {
      const dupPlu = store.products.find(p => p.plu_code === strPlu && p.id !== parseInt(id || 0));
      if (dupPlu) {
        return res.status(400).json({ success: false, error: `⚠️ CÓDIGO PLU DUPLICADO: El código PLU "${strPlu}" ya pertenece al plato "${dupPlu.name}".` });
      }
    }

    if (name) {
      const dupName = store.products.find(p => p.name.trim().toLowerCase() === name.trim().toLowerCase() && p.id !== parseInt(id || 0));
      if (dupName) {
        return res.status(400).json({ success: false, error: `⚠️ PRODUCTO DUPLICADO: Ya existe un plato o bebida registrado con el nombre "${dupName.name}".` });
      }
    }

    if (id) {
      const prod = store.products.find(p => p.id === parseInt(id));
      if (prod) {
        prod.code = strCode || prod.code || `PROD-${String(prod.id).padStart(3, '0')}`;
        prod.category_id = parseInt(category_id);
        prod.name = name;
        prod.description = description;
        prod.price = parseFloat(price);
        prod.image_url = image_url;
        prod.video_url = video_url || '';
        prod.points_cost = points_cost ? parseInt(points_cost) : null;
        prod.available = available ? 1 : 0;
        prod.barcode = strBarcode;
        prod.plu_code = strPlu;
        prod.unit_type = unit_type || 'unidad';
        prod.is_weighed = is_weighed ? 1 : 0;
      }
    } else {
      const nextId = store.products.length > 0 ? Math.max(...store.products.map(p => p.id)) + 1 : 1;
      const finalCode = strCode || `PROD-${String(nextId).padStart(3, '0')}`;
      store.products.push({
        id: nextId,
        code: finalCode,
        category_id: parseInt(category_id),
        name,
        description,
        price: parseFloat(price),
        image_url,
        video_url: video_url || '',
        points_cost: points_cost ? parseInt(points_cost) : null,
        available: available !== undefined ? (available ? 1 : 0) : 1,
        barcode: strBarcode,
        plu_code: strPlu,
        unit_type: unit_type || 'unidad',
        is_weighed: is_weighed ? 1 : 0
      });
    }
    db.saveStore();
    io.emit('menu_updated');
    res.json({ success: true, user_name: auth.user.name });
    res.json({ success: true, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// RUTAS API GESTIÓN MODULAR DE CATEGORÍAS (REQUERIDO NIVEL 3 - GERENTE / DUEÑO)
app.post('/api/admin/categories', (req, res) => {
  try {
    const { id, name, icon, sector, sort_order, pin } = req.body;

    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La gestión modular de categorías requiere PIN de Gerente / Dueño (Nivel 3).' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'El nombre de la categoría es obligatorio.' });
    }

    const store = db.getStore();
    if (!store.categories) store.categories = [];

    const strName = name.trim();
    const strIcon = (icon || '🍽️').trim();

    const dupCat = store.categories.find(c => c.name.toLowerCase() === strName.toLowerCase() && c.id !== parseInt(id || 0));
    if (dupCat) {
      return res.status(400).json({ success: false, error: `⚠️ CATEGORÍA DUPLICADA: Ya existe una categoría con el nombre "${dupCat.name}".` });
    }

    if (id) {
      const cat = store.categories.find(c => c.id === parseInt(id));
      if (cat) {
        cat.name = strName;
        cat.icon = strIcon;
        if (sector) cat.sector = sector;
        if (sort_order !== undefined) cat.sort_order = parseInt(sort_order);
      }
    } else {
      const nextId = store.categories.length > 0 ? Math.max(...store.categories.map(c => c.id)) + 1 : 1;
      store.categories.push({
        id: nextId,
        name: strName,
        icon: strIcon,
        sort_order: sort_order !== undefined ? parseInt(sort_order) : store.categories.length,
        sector: sector || 'kitchen'
      });
    }

    db.saveStore();
    io.emit('menu_updated');
    res.json({ success: true, categories: store.categories, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/categories/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { pin } = req.body;

    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: Se requiere PIN Nivel 3 para eliminar categorías.' });
    }

    const store = db.getStore();
    const cid = parseInt(id);

    const prodsInCat = store.products.filter(p => p.category_id === cid);
    if (prodsInCat.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: `⚠️ NO SE PUEDE ELIMINAR: La categoría contiene ${prodsInCat.length} plato(s) o producto(s). Reasigne o elimine esos productos antes de borrar la categoría.` 
      });
    }

    store.categories = store.categories.filter(c => c.id !== cid);
    db.saveStore();
    io.emit('menu_updated');

    res.json({ success: true, categories: store.categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// RUTA API POS: VENTA DIRECTA EN MOSTRADOR POR ESCÁNER / BALANZA
app.post('/api/pos/sale', (req, res) => {
  try {
    const { items, payment_method, payment_note, cashier_name, box_number, total } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0 || !total) {
      return res.status(400).json({ success: false, error: 'El carrito de venta directa no puede estar vacío.' });
    }

    const store = db.getStore();
    const numBox = parseInt(box_number || 1);

    const activeShift = (store.cash_shifts || []).find(s => s.status === 'open' && (s.box_number || 1) === numBox);
    if (!activeShift) {
      return res.status(400).json({ success: false, error: `⚠️ NO HAY TURNO DE CAJA ABIERTO: Debe abrir la Caja N° ${numBox} antes de realizar cobros directos.` });
    }

    const totalOrders = store.orders.length;
    const orderNumber = `#POS-${101 + totalOrders}`;

    const strCashier = cashier_name || activeShift.cashier_name || activeShift.opened_by || 'Cajero';

    const newOrder = {
      id: store.orders.length > 0 ? Math.max(...store.orders.map(o => o.id)) + 1 : 1,
      order_number: orderNumber,
      customer_name: `VENTA DIRECTA MOSTRADOR (${strCashier})`,
      customer_phone: 'En Local',
      address: 'Venta Directa en Mostrador',
      delivery_type: 'retiro',
      payment_method: payment_method || 'Efectivo',
      payment_note: payment_note || `Caja N° ${numBox}`,
      notes: `Venta Directa POS cobrada por ${strCashier} en Caja N° ${numBox}`,
      items: typeof items === 'string' ? items : JSON.stringify(items),
      total: parseFloat(total),
      status: 'entregado',
      paid: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Descontar materias primas / stock de comida preparada si aplica
    items.forEach(item => {
      const qtySold = parseFloat(item.qty || 1);
      const prod = store.products.find(p => p.id === item.id);
      if (prod && prod.stock_prepared !== undefined) {
        prod.stock_prepared = Math.max(0, parseFloat((prod.stock_prepared - qtySold).toFixed(3)));
      }

      const recipes = (store.product_recipes || []).filter(r => r.product_id === item.id);
      recipes.forEach(r => {
        const rawMat = (store.raw_materials || []).find(m => m.id === r.raw_material_id);
        if (rawMat) {
          const discountQty = (r.qty_per_portion || 0) * qtySold;
          rawMat.current_stock = Math.max(0, parseFloat(((rawMat.current_stock || 0) - discountQty).toFixed(3)));
        }
      });
    });

    store.orders.unshift(newOrder);
    db.saveStore();

    io.emit('new_order', newOrder);
    io.emit('order_updated', newOrder);
    io.emit('cash_shift_updated');

    // Auto-imprimir ticket si está configurado
    const settings = getSettingsMap();
    if (settings.auto_print_epson === '1' && settings.epson_printer_ip) {
      printToEpsonNetwork(newOrder, settings.epson_printer_ip, settings.epson_printer_port || 9100)
        .then(() => console.log(`🖨️ Ticket POS ${orderNumber} impreso en Epson ${settings.epson_printer_ip}`))
        .catch(err => console.error(`⚠️ Error al imprimir POS en Epson: ${err.message}`));
    }

    res.json({ success: true, order: newOrder });
  } catch (err) {
    console.error('Error al procesar venta directa POS:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// APIS DE GESTIÓN DE TURNO DE BAR & CAFETERÍA
// ==========================================

app.get('/api/bar/shift', (req, res) => {
  try {
    const store = db.getStore();
    const shifts = store.bar_shifts || [];
    const activeShift = shifts.find(s => s.status === 'open') || null;
    res.json({ success: true, active_shift: activeShift, history: shifts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bar/shift/open', (req, res) => {
  try {
    const { barista_name, shift_name, pin } = req.body;
    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: '⚠️ PIN personal no válido. Ingresa tu clave registrada.' });
    }

    const store = db.getStore();
    if (!store.bar_shifts) store.bar_shifts = [];
    if (!store.cash_shifts) store.cash_shifts = [];

    // REGLA DE NEGOCIO DEL BAR:
    // El Bar no tiene caja propia, recibe tickets generados en Caja al momento de cobrar.
    // Por lo tanto, NO se puede abrir el Bar si no hay al menos una Estación de Caja Abierta.
    // (La Cocina sí puede abrir sin caja para producción previa).
    const activeCashShift = store.cash_shifts.find(s => s.status === 'open');
    if (!activeCashShift) {
      return res.status(400).json({
        success: false,
        error: '⚠️ REGLA DE APERTURA DE BAR: No se puede abrir el Turno de Bar si no hay ninguna Estación de Caja Abierta.\n\nEl Bar elabora en el momento los tickets emitidos al cobrar. Abre primero la Caja N° 1.'
      });
    }

    const existingOpen = store.bar_shifts.find(s => s.status === 'open');
    if (existingOpen) {
      return res.status(400).json({ success: false, error: `⚠️ Ya existe un Turno de Bar Abierto a nombre de "${existingOpen.barista_name}". Ciérralo antes de abrir uno nuevo.` });
    }

    const nextId = store.bar_shifts.length > 0 ? Math.max(...store.bar_shifts.map(s => s.id)) + 1 : 1;
    const newShift = {
      id: nextId,
      barista_name: barista_name || auth.user.name,
      shift_name: shift_name || 'Turno Bar',
      opened_at: new Date().toISOString(),
      closed_at: null,
      opened_by: auth.user.name,
      user_id: auth.user.id,
      status: 'open'
    };

    store.bar_shifts.unshift(newShift);
    db.saveStore();
    io.emit('bar_shift_updated', newShift);

    res.json({ success: true, shift: newShift, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bar/shift/close', (req, res) => {
  try {
    const { pin } = req.body;
    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: '⚠️ PIN personal no válido. Ingresa tu clave registrada.' });
    }

    const store = db.getStore();
    if (!store.bar_shifts) store.bar_shifts = [];

    const activeShift = store.bar_shifts.find(s => s.status === 'open');
    if (!activeShift) {
      return res.status(400).json({ success: false, error: '⚠️ No hay ningún turno de Bar abierto para cerrar.' });
    }

    activeShift.status = 'closed';
    activeShift.closed_at = new Date().toISOString();
    activeShift.closed_by = auth.user.name;

    db.saveStore();
    io.emit('bar_shift_updated', activeShift);

    res.json({ success: true, shift: activeShift, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// APIS DE FICHAJE DE ASISTENCIA Y CÓMPUTO DE HORAS TRABAJADAS
// ==========================================

app.get('/api/attendance/logs', (req, res) => {
  try {
    const store = db.getStore();
    const logs = store.attendance_logs || [];
    const activeStaff = logs.filter(l => l.status === 'active');
    res.json({ success: true, logs, active_staff: activeStaff });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/attendance/clock-in', (req, res) => {
  try {
    const { pin, sector } = req.body;
    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: '⚠️ PIN personal no válido. Ingresa tu clave registrada.' });
    }

    const store = db.getStore();
    if (!store.attendance_logs) store.attendance_logs = [];

    const existingActive = store.attendance_logs.find(l => l.user_id === auth.user.id && l.status === 'active');
    if (existingActive) {
      const since = new Date(existingActive.clock_in).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      return res.status(400).json({ success: false, error: `⚠️ "${auth.user.name}" ya tiene un turno abierto desde las ${since} hs. Marca salida antes de ingresar un nuevo turno.` });
    }

    const nextId = store.attendance_logs.length > 0 ? Math.max(...store.attendance_logs.map(l => l.id)) + 1 : 1;
    const newLog = {
      id: nextId,
      user_id: auth.user.id,
      user_name: auth.user.name,
      level: auth.user.level,
      sector: sector || (auth.user.level === 3 ? 'Administración' : auth.user.level === 2 ? 'Encargado' : 'General'),
      clock_in: new Date().toISOString(),
      clock_out: null,
      hours_worked: 0,
      status: 'active'
    };

    store.attendance_logs.unshift(newLog);
    db.saveStore();
    io.emit('attendance_updated');

    res.json({ success: true, log: newLog, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/attendance/clock-out', (req, res) => {
  try {
    const { pin } = req.body;
    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: '⚠️ PIN personal no válido. Ingresa tu clave registrada.' });
    }

    const store = db.getStore();
    if (!store.attendance_logs) store.attendance_logs = [];

    const activeLog = store.attendance_logs.find(l => l.user_id === auth.user.id && l.status === 'active');
    if (!activeLog) {
      return res.status(400).json({ success: false, error: `⚠️ No se encontró ningún turno activo para "${auth.user.name}". Debes marcar ingreso primero.` });
    }

    const clockOutDate = new Date();
    const clockInDate = new Date(activeLog.clock_in);
    const diffMs = clockOutDate - clockInDate;
    const hours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

    activeLog.clock_out = clockOutDate.toISOString();
    activeLog.hours_worked = hours;
    activeLog.status = 'completed';

    db.saveStore();
    io.emit('attendance_updated');

    res.json({ success: true, log: activeLog, user_name: auth.user.name, hours_worked: hours });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// API CLUB DE PUNTOS Y CLIENTES (ESTILO CLUB GRIDO)
// ==========================================

app.post('/api/customer/sync', (req, res) => {
  try {
    const { dni, name, phone, address } = req.body;
    if (!dni) return res.status(400).json({ success: false, error: 'El DNI es obligatorio' });

    const store = db.getStore();
    if (!store.club_customers) store.club_customers = [];

    const strDni = String(dni).trim();
    let cust = store.club_customers.find(c => String(c.dni).trim() === strDni);

    if (!cust) {
      const nextId = store.club_customers.length > 0 ? Math.max(...store.club_customers.map(c => c.id)) + 1 : 1;
      cust = {
        id: nextId,
        dni: strDni,
        name: name || 'Cliente Club',
        phone: phone || '',
        addresses: address ? [{ id: 1, text: address, tag: 'Casa' }] : [{ id: 1, text: 'España 1028 (Casi Yrigoyen)', tag: 'Local Retiro' }],
        points_balance: 100, // Bono de bienvenida
        barcode: `CLI-${strDni}`,
        created_at: new Date().toISOString()
      };
      store.club_customers.push(cust);

      if (!store.points_history) store.points_history = [];
      store.points_history.unshift({
        id: Date.now(),
        customer_dni: strDni,
        type: 'earn',
        points: 100,
        description: '🎁 Regalo de Bienvenida al Club La Gran Rotisería',
        date: new Date().toISOString()
      });

      db.saveStore();
    } else {
      if (name) cust.name = name;
      if (phone) cust.phone = phone;
      if (address && Array.isArray(cust.addresses)) {
        if (!cust.addresses.some(a => a.text === address)) {
          cust.addresses.push({ id: Date.now(), text: address, tag: 'Domicilio' });
        }
      }
      db.saveStore();
    }

    res.json({ success: true, customer: cust });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/customer/details/:dni', (req, res) => {
  try {
    const { dni } = req.params;
    const store = db.getStore();
    const strDni = String(dni).trim();
    const cust = (store.club_customers || []).find(c => String(c.dni).trim() === strDni);
    if (!cust) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const history = (store.points_history || []).filter(h => String(h.customer_dni).trim() === strDni);
    const coupons = store.coupons || [];

    res.json({ success: true, customer: cust, history, coupons });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/customer/transfer-points', (req, res) => {
  try {
    const { from_dni, to_dni, points } = req.body;
    const numPoints = parseInt(points || 0);
    if (numPoints <= 0) return res.status(400).json({ success: false, error: 'La cantidad de puntos debe ser mayor a 0' });

    const store = db.getStore();
    const strFrom = String(from_dni).trim();
    const strTo = String(to_dni).trim();

    if (strFrom === strTo) return res.status(400).json({ success: false, error: 'No podés transferirte puntos a vos mismo' });

    const sender = (store.club_customers || []).find(c => String(c.dni).trim() === strFrom);
    const receiver = (store.club_customers || []).find(c => String(c.dni).trim() === strTo);

    if (!sender) return res.status(404).json({ success: false, error: 'Tu usuario emisor no existe en el sistema' });
    if (!receiver) return res.status(404).json({ success: false, error: `No se encontró ningún cliente registrado con DNI ${strTo}` });

    if ((sender.points_balance || 0) < numPoints) {
      return res.status(400).json({ success: false, error: `Saldo insuficiente. Tenés ${sender.points_balance || 0} puntos disponibles.` });
    }

    sender.points_balance -= numPoints;
    receiver.points_balance = (receiver.points_balance || 0) + numPoints;

    if (!store.points_history) store.points_history = [];
    const now = new Date().toISOString();
    store.points_history.unshift({
      id: Date.now(),
      customer_dni: strFrom,
      type: 'transfer_out',
      points: numPoints,
      description: `🔄 Transferencia enviada a DNI ${strTo} (${receiver.name})`,
      date: now
    });
    store.points_history.unshift({
      id: Date.now() + 1,
      customer_dni: strTo,
      type: 'transfer_in',
      points: numPoints,
      description: `🎁 Transferencia recibida de DNI ${strFrom} (${sender.name})`,
      date: now
    });

    db.saveStore();
    res.json({ success: true, sender_balance: sender.points_balance, receiver_name: receiver.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/customer/address', (req, res) => {
  try {
    const { dni, text, tag } = req.body;
    if (!dni || !text) return res.status(400).json({ success: false, error: 'DNI y Dirección son obligatorios' });

    const store = db.getStore();
    const strDni = String(dni).trim();
    const cust = (store.club_customers || []).find(c => String(c.dni).trim() === strDni);
    if (!cust) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });

    if (!cust.addresses) cust.addresses = [];
    const newAddr = { id: Date.now(), text: text.trim(), tag: tag || 'Domicilio' };
    cust.addresses.push(newAddr);
    db.saveStore();

    res.json({ success: true, addresses: cust.addresses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/settings', (req, res) => {
  try {
    res.json({ success: true, settings: getSettingsMap() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const settings = req.body;
    const store = db.getStore();
    for (const [key, value] of Object.entries(settings)) {
      store.settings[key] = String(value);
    }
    db.saveStore();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// RUTAS EXPLÍCITAS DE NAVEGACIÓN Y PORTALES (MÁXIMA COMPATIBILIDAD EN CELULARES Y TABLETS)
app.get('/portales', (req, res) => res.sendFile(path.join(__dirname, 'public', 'portales.html')));
app.get('/portales.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'portales.html')));

app.get('/produccion', (req, res) => res.sendFile(path.join(__dirname, 'public', 'produccion.html')));
app.get('/produccion.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'produccion.html')));

app.get('/caja', (req, res) => res.sendFile(path.join(__dirname, 'public', 'caja.html')));
app.get('/caja.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'caja.html')));

app.get('/cocina', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cocina.html')));
app.get('/cocina.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cocina.html')));

app.get('/bar', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bar.html')));
app.get('/bar.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bar.html')));

app.get('/manifest-portales.json', (req, res) => {
  res.header('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest-portales.json'));
});
app.get('/manifest-pedidos.json', (req, res) => {
  res.header('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest-pedidos.json'));
});
app.get('/manifest.json', (req, res) => {
  res.header('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest-pedidos.json'));
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Servidor Delivery, Descarga de Backup ZIP & Auditoría en ejecución:
👉 Local: http://localhost:${PORT}/admin.html
  `);
});
