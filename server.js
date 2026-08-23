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
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
    const { box_number, cashier_name, initial_cash, pin } = req.body;
    const numBox = parseInt(box_number || 1);

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: auth.levelTooLow ? `El usuario ${auth.user.name} no posee Nivel 2 o superior.` : 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) incorrecto' });
    }

    const strCashierName = (cashier_name || auth.user.name).trim();

    const store = db.getStore();
    if (!store.cash_shifts) store.cash_shifts = [];

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
      cashier_name: strCashierName,
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

    db.saveStore();
    io.emit('cash_shift_updated');

    res.json({ success: true, shift: activeShift, user_name: auth.user.name, box_number: activeShift.box_number || 1 });
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
    const { id, name, unit, min_stock, current_stock, pin } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) requerido' });
    }

    const store = db.getStore();
    if (id) {
      const mat = store.raw_materials.find(m => m.id === parseInt(id));
      if (mat) {
        mat.name = name;
        mat.unit = unit || 'kg';
        mat.min_stock = parseFloat(min_stock || 5);
        if (current_stock !== undefined) mat.current_stock = parseFloat(current_stock);
      }
    } else {
      const nextId = store.raw_materials.length > 0 ? Math.max(...store.raw_materials.map(m => m.id)) + 1 : 1;
      store.raw_materials.push({
        id: nextId,
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

// REGISTRO DE PRODUCCIÓN DIARIA DE COMIDA PREPARADA POR LA COCINA (REQUERIDO NIVEL 2 O 3)
app.post('/api/production/add', (req, res) => {
  try {
    const { product_id, quantity, notes, pin } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) requerido' });
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

app.post('/api/orders', (req, res) => {
  try {
    const { customer_name, customer_phone, address, delivery_type, payment_method, payment_note, notes, items, total } = req.body;

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
    db.saveStore();

    io.emit('new_order', newOrder);

    const settings = getSettingsMap();
    if (settings.auto_print_epson === '1' && settings.epson_printer_ip) {
      printToEpsonNetwork(newOrder, settings.epson_printer_ip, settings.epson_printer_port || 9100)
        .then(() => console.log(`🖨️ Ticket ${orderNumber} impreso automáticamente en Epson ${settings.epson_printer_ip}`))
        .catch(err => console.error(`⚠️ Error al auto-imprimir en Epson: ${err.message}`));
    }

    res.json({
      success: true,
      order: newOrder
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
    const { status } = req.body;

    const validStatuses = ['nuevo', 'en_preparacion', 'en_camino', 'entregado', 'cancelado'];
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
      stock_adjustments: store.stock_adjustments || []
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
    const { id, category_id, name, description, price, image_url, available, barcode, plu_code, unit_type, is_weighed, pin } = req.body;

    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La modificación del menú requiere PIN de Gerente / Dueño (Nivel 3).' });
    }

    const store = db.getStore();
    const strBarcode = barcode ? String(barcode).trim() : '';
    const strPlu = plu_code ? String(plu_code).trim() : '';

    if (strBarcode) {
      const dup = store.products.find(p => p.barcode === strBarcode && p.id !== parseInt(id || 0));
      if (dup) {
        return res.status(400).json({ success: false, error: `El código de barras "${strBarcode}" ya pertenece al producto "${dup.name}".` });
      }
    }

    if (id) {
      const prod = store.products.find(p => p.id === parseInt(id));
      if (prod) {
        prod.category_id = parseInt(category_id);
        prod.name = name;
        prod.description = description;
        prod.price = parseFloat(price);
        prod.image_url = image_url;
        prod.available = available ? 1 : 0;
        prod.barcode = strBarcode;
        prod.plu_code = strPlu;
        prod.unit_type = unit_type || 'unidad';
        prod.is_weighed = is_weighed ? 1 : 0;
      }
    } else {
      const nextId = store.products.length > 0 ? Math.max(...store.products.map(p => p.id)) + 1 : 1;
      store.products.push({
        id: nextId,
        category_id: parseInt(category_id),
        name,
        description,
        price: parseFloat(price),
        image_url,
        available: available !== undefined ? (available ? 1 : 0) : 1,
        barcode: strBarcode,
        plu_code: strPlu,
        unit_type: unit_type || 'unidad',
        is_weighed: is_weighed ? 1 : 0
      });
    }
    db.saveStore();
    res.json({ success: true, user_name: auth.user.name });
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Servidor Delivery, Descarga de Backup ZIP & Auditoría en ejecución:
👉 Local: http://localhost:${PORT}/admin.html
  `);
});
