const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const net = require('net');
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

// HELPER: VERIFICACIÓN DE PIN POR NIVEL (NIVEL 2 VS NIVEL 3)
function verifyPin(inputPin, requiredLevel = 2) {
  const settings = getSettingsMap();
  const encargadoPin = settings.encargado_pin || '2222';
  const adminPin = settings.admin_pin || '9999';

  const strPin = String(inputPin || '').trim();

  if (requiredLevel === 3) {
    return strPin === String(adminPin);
  } else {
    return strPin === String(encargadoPin) || strPin === String(adminPin);
  }
}

// VERIFICAR PIN DE SEGURIDAD (APIS PUBLICAS)
app.post('/api/verify-pin', (req, res) => {
  try {
    const { pin, level } = req.body;
    const reqLevel = parseInt(level || 2);
    const isValid = verifyPin(pin, reqLevel);

    if (isValid) {
      return res.json({ success: true, authorized: true, level: reqLevel });
    } else {
      return res.status(401).json({ 
        success: false, 
        authorized: false, 
        error: reqLevel === 3 ? 'PIN de Gerente/Dueño (Nivel 3) incorrecto' : 'PIN de Encargado/Gerente (Nivel 2) incorrecto' 
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// APERTURA DE TURNO DE CAJA (REQUERIDO NIVEL 2 - ENCARGADO / GERENTE)
app.post('/api/cash/shift/open', (req, res) => {
  try {
    const { initial_cash, pin, opened_by } = req.body;

    if (!verifyPin(pin, 2)) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) incorrecto' });
    }

    const store = db.getStore();
    if (!store.cash_shifts) store.cash_shifts = [];

    const activeShift = store.cash_shifts.find(s => s.status === 'open');
    if (activeShift) {
      return res.status(400).json({ success: false, error: 'Ya existe una caja abierta en este turno.' });
    }

    const nextId = store.cash_shifts.length > 0 ? Math.max(...store.cash_shifts.map(s => s.id)) + 1 : 1;
    const newShift = {
      id: nextId,
      opened_at: new Date().toISOString(),
      closed_at: null,
      initial_cash: parseFloat(initial_cash || 0),
      final_cash: null,
      status: 'open',
      opened_by: opened_by || 'Encargado (Nivel 2)'
    };

    store.cash_shifts.unshift(newShift);
    db.saveStore();
    io.emit('cash_shift_updated');

    res.json({ success: true, shift: newShift });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CIERRE DE TURNO DE CAJA (REQUERIDO NIVEL 2)
app.post('/api/cash/shift/close', (req, res) => {
  try {
    const { final_cash, pin, closed_by } = req.body;

    if (!verifyPin(pin, 2)) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) incorrecto' });
    }

    const store = db.getStore();
    if (!store.cash_shifts) store.cash_shifts = [];

    const activeShift = store.cash_shifts.find(s => s.status === 'open');
    if (!activeShift) {
      return res.status(400).json({ success: false, error: 'No hay ninguna caja abierta para cerrar.' });
    }

    activeShift.closed_at = new Date().toISOString();
    activeShift.final_cash = parseFloat(final_cash || 0);
    activeShift.status = 'closed';
    activeShift.closed_by = closed_by || 'Encargado (Nivel 2)';

    db.saveStore();
    io.emit('cash_shift_updated');

    res.json({ success: true, shift: activeShift });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// BITÁCORA DE AUDITORÍA Y FACTURACIÓN MULTI-PERÍODO (EXCLUSIVO NIVEL 3 - GERENTE / DUEÑO)
app.post('/api/admin/audit-logs', (req, res) => {
  try {
    const { pin } = req.body;

    if (!verifyPin(pin, 3)) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La Bitácora de Auditoría es de acceso exclusivo para Gerente / Dueño (Nivel 3).' });
    }

    const store = db.getStore();
    const now = new Date();

    // Filtros de facturación: Diario (hoy), Semanal (7 días), Quincenal (15 días), Mensual (30 días)
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

// CONCILIAR / AJUSTAR STOCK REAL VS VIRTUAL (REQUERIDO NIVEL 3 - GERENTE / DUEÑO)
app.post('/api/admin/stock/adjust', (req, res) => {
  try {
    const { raw_material_id, real_stock, reason, pin } = req.body;

    if (!verifyPin(pin, 3)) {
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
      registered_by: 'Gerente / Dueño (Nivel 3)'
    });

    db.saveStore();
    io.emit('stock_updated');

    res.json({
      success: true,
      raw_material_name: rawMat.name,
      old_stock: oldStock,
      new_stock: newStock,
      difference: diff
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// REGISTRAR PRODUCCIÓN EN LOTE EN COCINA (Mise en place - Requiere Nivel 2)
app.post('/api/production/register', (req, res) => {
  try {
    const { product_id, portions, pin } = req.body;
    const pid = parseInt(product_id);
    const qtyPortions = parseFloat(portions || 0);

    if (pin && !verifyPin(pin, 2)) {
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

    // Calcular y descontar insumos del stock general según receta
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
      discounted: discountedMaterials
    });
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

    // Si es Cuenta Corriente, validar registro previo
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

// PUT /api/orders/:id/status - Cambiar estado con validaciones
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

    // Validación para avance en cocina si es Cuenta Corriente: Verificar límite de crédito
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

    // Validación de cobro en efectivo / tarjeta antes de marcar entregado
    if (status === 'entregado' && !isCuentaCorriente && existingOrder.paid !== 1) {
      return res.status(400).json({
        success: false,
        error: `No se puede marcar como Entregado el pedido ${existingOrder.order_number} porque aún no ha sido ingresado a Caja ($${existingOrder.total}). Primero debe ingresarse a caja.`
      });
    }

    // DESCUENTO AUTOMÁTICO DE INSUMOS POR PORCIONADO EN COCINA (cuando entra a preparacion)
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

    // Si pasa a entregado y es Cuenta Corriente, sumar la deuda a la cuenta del cliente
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

// APIS DE MERCADERÍA, INSUMOS, PROVEEDORES Y RECETAS
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

// Ingreso de Mercadería al Stock General (Requiere PIN Nivel 2)
app.post('/api/stock/entry', (req, res) => {
  try {
    const { pin, supplier_id, raw_material_id, quantity, unit_cost, notes, registered_by } = req.body;

    if (!verifyPin(pin, 2)) {
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
      registered_by: registered_by || 'Encargado (Nivel 2)'
    });

    db.saveStore();
    io.emit('stock_updated');

    res.json({ success: true, raw_material: rawMat });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Guardar Insumo / Materia Prima (Requiere PIN Nivel 2)
app.post('/api/admin/materials', (req, res) => {
  try {
    const { id, name, unit, min_stock, current_stock, pin } = req.body;

    if (!verifyPin(pin, 2)) {
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

    if (!verifyPin(pin, 3)) {
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

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Registrar Cobro Parcial o Total de Cuenta Corriente
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

    const activeShift = (store.cash_shifts || []).find(s => s.status === 'open');

    res.json({
      success: true,
      active_shift: activeShift || null,
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
    const { id, category_id, name, description, price, image_url, available, pin } = req.body;

    if (!verifyPin(pin, 3)) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La modificación del menú requiere PIN de Gerente / Dueño (Nivel 3).' });
    }

    const store = db.getStore();
    if (id) {
      const prod = store.products.find(p => p.id === parseInt(id));
      if (prod) {
        prod.category_id = parseInt(category_id);
        prod.name = name;
        prod.description = description;
        prod.price = parseFloat(price);
        prod.image_url = image_url;
        prod.available = available ? 1 : 0;
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
        available: available !== undefined ? (available ? 1 : 0) : 1
      });
    }
    db.saveStore();
    res.json({ success: true });
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Servidor Delivery, Facturación Multi-Período & Apertura de Caja Nivel 2 en ejecución:
👉 Local: http://localhost:${PORT}/admin.html
  `);
});
