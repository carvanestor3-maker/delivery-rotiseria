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
  const stmt = db.prepare('SELECT key, value FROM settings');
  const rows = stmt.all();
  const settings = {};
  rows.forEach(row => {
    settings[row.key] = row.value;
  });
  return settings;
}

// RUTAS API DE MENÚ Y CLIENTE
app.get('/api/menu', (req, res) => {
  try {
    const categoriesStmt = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC');
    const categories = categoriesStmt.all();

    const productsStmt = db.prepare('SELECT * FROM products ORDER BY name ASC');
    const products = productsStmt.all();

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

    const countStmt = db.prepare('SELECT COUNT(*) as count FROM orders');
    const totalOrders = countStmt.get().count;
    const orderNumber = `#${101 + totalOrders}`;

    const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);

    const insertStmt = db.prepare(`
      INSERT INTO orders (order_number, customer_name, customer_phone, address, delivery_type, payment_method, payment_note, notes, items, total, status, paid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nuevo', 0)
    `);

    const info = insertStmt.run(
      orderNumber,
      customer_name,
      customer_phone,
      address || 'Retiro en local',
      delivery_type || 'delivery',
      payment_method || 'Efectivo',
      payment_note || '',
      notes || '',
      itemsJson,
      parseFloat(total)
    );

    const newOrderStmt = db.prepare('SELECT * FROM orders WHERE id = ?');
    const newOrder = newOrderStmt.get(info.lastInsertRowid);
    newOrder.items = JSON.parse(newOrder.items);

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
    const { status } = req.query;
    let stmt;
    if (status) {
      stmt = db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC');
      var orders = stmt.all(status);
    } else {
      stmt = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100');
      var orders = stmt.all();
    }

    orders = orders.map(o => ({
      ...o,
      items: JSON.parse(o.items)
    }));

    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/orders/:id/status - Cambiar estado del pedido (con validación estricta de ingreso a caja)
app.put('/api/orders/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['nuevo', 'en_preparacion', 'en_camino', 'entregado', 'cancelado'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Estado no válido' });
    }

    // Obtener pedido actual
    const checkStmt = db.prepare('SELECT * FROM orders WHERE id = ?');
    const existingOrder = checkStmt.get(id);

    if (!existingOrder) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
    }

    // Validación estricta: No se permite marcar como 'entregado' si no ha sido ingresado a caja (paid = 1)
    if (status === 'entregado' && existingOrder.paid !== 1) {
      return res.status(400).json({
        success: false,
        error: `No se puede marcar como Entregado el pedido ${existingOrder.order_number} porque aún no ha sido ingresado a Caja ($${existingOrder.total}). Primero debe ingresarse a caja.`
      });
    }

    const updateStmt = db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    updateStmt.run(status, id);

    const updatedOrderStmt = db.prepare('SELECT * FROM orders WHERE id = ?');
    const updatedOrder = updatedOrderStmt.get(id);
    if (updatedOrder) {
      updatedOrder.items = JSON.parse(updatedOrder.items);
      io.emit('order_updated', updatedOrder);
    }

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/orders/:id/paid', (req, res) => {
  try {
    const { id } = req.params;
    const { paid } = req.body;

    const newPaidVal = paid !== undefined ? (paid ? 1 : 0) : 1;
    const stmt = db.prepare('UPDATE orders SET paid = ? WHERE id = ?');
    stmt.run(newPaidVal, id);

    const updatedOrderStmt = db.prepare('SELECT * FROM orders WHERE id = ?');
    const updatedOrder = updatedOrderStmt.get(id);
    if (updatedOrder) {
      updatedOrder.items = JSON.parse(updatedOrder.items);
      io.emit('order_updated', updatedOrder);
    }

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/cash/summary', (req, res) => {
  try {
    const todayOrdersStmt = db.prepare("SELECT * FROM orders WHERE status != 'cancelado' ORDER BY id DESC");
    const rawOrders = todayOrdersStmt.all();

    let totalSales = 0;
    let cashTotal = 0;
    let cashCollected = 0;
    let cashPending = 0;
    let cardTotal = 0;
    let digitalTotal = 0;

    const orders = rawOrders.map(o => {
      const items = JSON.parse(o.items);
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

    res.json({
      success: true,
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
    const stmt = db.prepare('SELECT * FROM orders WHERE id = ?');
    const order = stmt.get(id);
    if (!order) return res.status(404).json({ success: false, error: 'Pedido no encontrado' });

    order.items = JSON.parse(order.items);

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

// RUTAS API PRODUCTOS & CATEGORÍAS
app.get('/api/admin/products', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT p.*, c.name as category_name, c.icon as category_icon 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      ORDER BY p.category_id ASC, p.name ASC
    `);
    res.json({ success: true, products: stmt.all() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/products', (req, res) => {
  try {
    const { id, category_id, name, description, price, image_url, available } = req.body;
    if (id) {
      const updateStmt = db.prepare(`
        UPDATE products 
        SET category_id = ?, name = ?, description = ?, price = ?, image_url = ?, available = ?
        WHERE id = ?
      `);
      updateStmt.run(category_id, name, description, parseFloat(price), image_url, available ? 1 : 0, id);
    } else {
      const insertStmt = db.prepare(`
        INSERT INTO products (category_id, name, description, price, image_url, available)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(category_id, name, description, parseFloat(price), image_url, available !== undefined ? (available ? 1 : 0) : 1);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/categories', (req, res) => {
  try {
    const { name, icon, sort_order } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'El nombre es obligatorio' });

    const insertStmt = db.prepare('INSERT INTO categories (name, icon, sort_order) VALUES (?, ?, ?)');
    insertStmt.run(name, icon || '🍽️', parseInt(sort_order || 10));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/products/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('UPDATE products SET available = CASE WHEN available = 1 THEN 0 ELSE 1 END WHERE id = ?');
    stmt.run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM products WHERE id = ?');
    stmt.run(id);
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
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(settings)) {
      stmt.run(key, String(value));
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Servidor Delivery & Cocina en ejecución (Acceso Local y Red Wi-Fi):
👉 Desde la PC:       http://localhost:${PORT}/cocina.html
👉 Desde el Celular:  http://192.168.100.145:${PORT}/cocina.html
  `);
});
