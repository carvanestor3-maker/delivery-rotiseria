// ==========================================================================
// BASE DE DATOS SEPARADA: Proveedores, Precios & Compras
// ==========================================================================
// A diferencia del resto del sistema (que vive todo junto adentro de un
// único registro JSON en la tabla app_store, manejado por db.js), este
// módulo es una base de datos APARTE con sus propias tablas SQL reales
// (o su propio archivo separado si no hay Postgres disponible). No agrega
// nada dentro del "store" general: es el primer paso de ir descentralizando
// de a poco las bases de datos de la app, tal cual se pidió.
//
// Lo único que comparte con el resto del sistema es el ID del insumo
// (raw_material_id) al que se vincula cada producto de proveedor, para
// poder comparar precios - pero esa vinculación se resuelve en server.js
// consultando ambas bases, nunca mezclando los datos en un solo lugar.
// ==========================================================================

const fs = require('fs');
const path = require('path');

const USE_POSTGRES = !!process.env.DATABASE_URL;
let pool = null;

if (USE_POSTGRES) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
    keepAlive: true
  });
  pool.on('error', (err) => {
    console.error('⚠️ [Proveedores] Conexión inactiva del pool cortada por el proveedor (recuperado sin caerse):', err.message);
  });
}

// ----- Modo archivo local separado (proveedores_store.json) -----
// OJO: es un ARCHIVO DISTINTO a delivery_store.json - a propósito, para que
// incluso corriendo sin Postgres en esta PC, los datos de proveedores sigan
// estando en su propia base separada y no mezclados con el resto.
const localPath = path.join(__dirname, 'proveedores_store.json');
let local = {
  suppliers: [
    { id: 1, name: 'Frigorífico Central', cuit: '', phone: '3794123456', email: '', address: 'Av. Cazadores Correntinos 2100', payment_terms: '', notes: '', created_at: new Date().toISOString() },
    { id: 2, name: 'Distribuidora Don Pedro', cuit: '', phone: '3794987654', email: '', address: 'Calle Junín 850', payment_terms: '', notes: '', created_at: new Date().toISOString() }
  ],
  supplier_products: [],
  supplier_purchases: []
};

function loadLocal() {
  try {
    if (fs.existsSync(localPath)) {
      local = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      if (!local.suppliers) local.suppliers = [];
      if (!local.supplier_products) local.supplier_products = [];
      if (!local.supplier_purchases) local.supplier_purchases = [];
    } else {
      saveLocal();
    }
  } catch (e) {
    console.error('Error al cargar proveedores_store.json:', e);
  }
}

function saveLocal() {
  try {
    fs.writeFileSync(localPath, JSON.stringify(local, null, 2), 'utf8');
  } catch (e) {
    console.error('Error al guardar proveedores_store.json:', e);
  }
}

// ----- Modo Postgres: tablas propias, separadas de app_store -----
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      cuit TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      payment_terms TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supplier_products (
      id SERIAL PRIMARY KEY,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      raw_material_id INTEGER NOT NULL,
      product_name TEXT DEFAULT '',
      unit_price NUMERIC NOT NULL DEFAULT 0,
      code TEXT DEFAULT '',
      availability TEXT NOT NULL DEFAULT 'disponible',
      lead_time TEXT DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supplier_purchases (
      id SERIAL PRIMARY KEY,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      supplier_name TEXT,
      date TIMESTAMPTZ DEFAULT now(),
      status TEXT NOT NULL DEFAULT 'pendiente',
      total NUMERIC NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      registered_by TEXT,
      received_at TIMESTAMPTZ
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supplier_purchase_items (
      id SERIAL PRIMARY KEY,
      purchase_id INTEGER NOT NULL REFERENCES supplier_purchases(id) ON DELETE CASCADE,
      raw_material_id INTEGER NOT NULL,
      raw_material_name TEXT,
      unit TEXT,
      quantity NUMERIC NOT NULL,
      unit_price NUMERIC NOT NULL,
      subtotal NUMERIC NOT NULL
    );
  `);

  // Primera vez: si la tabla de proveedores está vacía, la sembramos con
  // los dos proveedores que ya existían (para no perder esos datos al
  // separar la base).
  const { rows } = await pool.query('SELECT COUNT(*) AS count FROM suppliers');
  if (parseInt(rows[0].count) === 0) {
    await pool.query(
      `INSERT INTO suppliers (name, phone, address) VALUES
       ('Frigorífico Central', '3794123456', 'Av. Cazadores Correntinos 2100'),
       ('Distribuidora Don Pedro', '3794987654', 'Calle Junín 850')`
    );
  }
}

const ready = USE_POSTGRES
  ? ensureTables().catch(err => {
      console.error('⚠️ [Proveedores] No se pudo conectar a Postgres, uso archivo local separado como respaldo:', err.message);
      loadLocal();
    })
  : Promise.resolve(loadLocal());

// ---------------------------------------------------------------------
// Helpers de archivo local
// ---------------------------------------------------------------------
function nextLocalId(arr) {
  return arr.length > 0 ? Math.max(...arr.map(x => x.id)) + 1 : 1;
}

// node-pg devuelve las columnas NUMERIC como string (para no perder
// precisión) - las convertimos a número acá para que el front las pueda
// usar directo en cuentas sin tener que acordarse de parsear cada vez.
function numify(row, fields) {
  if (!row) return row;
  fields.forEach(f => {
    if (row[f] !== null && row[f] !== undefined) row[f] = parseFloat(row[f]);
  });
  return row;
}

// ==========================================================================
// API pública (misma forma sin importar si el motor real es Postgres o el
// archivo local separado)
// ==========================================================================

async function listSuppliers() {
  if (USE_POSTGRES) {
    const { rows } = await pool.query('SELECT * FROM suppliers ORDER BY name ASC');
    return rows;
  }
  return [...local.suppliers].sort((a, b) => a.name.localeCompare(b.name));
}

async function findSupplierByName(name, excludeId) {
  const suppliers = await listSuppliers();
  return suppliers.find(s => s.name && s.name.trim().toLowerCase() === name.toLowerCase() && s.id !== excludeId);
}

async function getSupplier(id) {
  if (USE_POSTGRES) {
    const { rows } = await pool.query('SELECT * FROM suppliers WHERE id = $1', [id]);
    return rows[0] || null;
  }
  return local.suppliers.find(s => s.id === id) || null;
}

async function createSupplier(data) {
  const payload = {
    name: (data.name || '').trim(),
    cuit: (data.cuit || '').trim(),
    phone: (data.phone || '').trim(),
    email: (data.email || '').trim(),
    address: (data.address || '').trim(),
    payment_terms: (data.payment_terms || '').trim(),
    notes: (data.notes || '').trim()
  };
  if (USE_POSTGRES) {
    const { rows } = await pool.query(
      `INSERT INTO suppliers (name, cuit, phone, email, address, payment_terms, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [payload.name, payload.cuit, payload.phone, payload.email, payload.address, payload.payment_terms, payload.notes]
    );
    return rows[0];
  }
  const row = { id: nextLocalId(local.suppliers), ...payload, created_at: new Date().toISOString() };
  local.suppliers.push(row);
  saveLocal();
  return row;
}

async function updateSupplier(id, data) {
  const payload = {
    name: (data.name || '').trim(),
    cuit: (data.cuit || '').trim(),
    phone: (data.phone || '').trim(),
    email: (data.email || '').trim(),
    address: (data.address || '').trim(),
    payment_terms: (data.payment_terms || '').trim(),
    notes: (data.notes || '').trim()
  };
  if (USE_POSTGRES) {
    const { rows } = await pool.query(
      `UPDATE suppliers SET name=$1, cuit=$2, phone=$3, email=$4, address=$5, payment_terms=$6, notes=$7
       WHERE id=$8 RETURNING *`,
      [payload.name, payload.cuit, payload.phone, payload.email, payload.address, payload.payment_terms, payload.notes, id]
    );
    return rows[0] || null;
  }
  const sup = local.suppliers.find(s => s.id === id);
  if (!sup) return null;
  Object.assign(sup, payload);
  saveLocal();
  return sup;
}

async function supplierHasPurchases(id) {
  if (USE_POSTGRES) {
    const { rows } = await pool.query('SELECT COUNT(*) AS count FROM supplier_purchases WHERE supplier_id = $1', [id]);
    return parseInt(rows[0].count) > 0;
  }
  return local.supplier_purchases.some(p => p.supplier_id === id);
}

async function deleteSupplier(id) {
  if (USE_POSTGRES) {
    await pool.query('DELETE FROM supplier_products WHERE supplier_id = $1', [id]);
    const { rowCount } = await pool.query('DELETE FROM suppliers WHERE id = $1', [id]);
    return rowCount > 0;
  }
  const idx = local.suppliers.findIndex(s => s.id === id);
  if (idx === -1) return false;
  local.suppliers.splice(idx, 1);
  local.supplier_products = local.supplier_products.filter(p => p.supplier_id !== id);
  saveLocal();
  return true;
}

async function listSupplierProducts() {
  if (USE_POSTGRES) {
    const { rows } = await pool.query(`
      SELECT sp.*, s.name AS supplier_name
      FROM supplier_products sp
      JOIN suppliers s ON s.id = sp.supplier_id
      ORDER BY sp.raw_material_id ASC, sp.unit_price ASC
    `);
    return rows.map(r => numify(r, ['unit_price']));
  }
  return local.supplier_products.map(p => {
    const sup = local.suppliers.find(s => s.id === p.supplier_id);
    return { ...p, supplier_name: sup ? sup.name : 'Proveedor eliminado' };
  }).sort((a, b) => (a.raw_material_id - b.raw_material_id) || (a.unit_price - b.unit_price));
}

async function createSupplierProduct(data) {
  const payload = {
    supplier_id: parseInt(data.supplier_id),
    raw_material_id: parseInt(data.raw_material_id),
    product_name: (data.product_name || '').trim(),
    unit_price: parseFloat(data.unit_price),
    code: (data.code || '').trim(),
    availability: data.availability,
    lead_time: (data.lead_time || '').trim()
  };
  if (USE_POSTGRES) {
    const { rows } = await pool.query(
      `INSERT INTO supplier_products (supplier_id, raw_material_id, product_name, unit_price, code, availability, lead_time, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now()) RETURNING *`,
      [payload.supplier_id, payload.raw_material_id, payload.product_name, payload.unit_price, payload.code, payload.availability, payload.lead_time]
    );
    return numify(rows[0], ['unit_price']);
  }
  const row = { id: nextLocalId(local.supplier_products), ...payload, updated_at: new Date().toISOString() };
  local.supplier_products.push(row);
  saveLocal();
  return row;
}

async function updateSupplierProduct(id, data) {
  const payload = {
    supplier_id: parseInt(data.supplier_id),
    raw_material_id: parseInt(data.raw_material_id),
    product_name: (data.product_name || '').trim(),
    unit_price: parseFloat(data.unit_price),
    code: (data.code || '').trim(),
    availability: data.availability,
    lead_time: (data.lead_time || '').trim()
  };
  if (USE_POSTGRES) {
    const { rows } = await pool.query(
      `UPDATE supplier_products SET supplier_id=$1, raw_material_id=$2, product_name=$3, unit_price=$4, code=$5, availability=$6, lead_time=$7, updated_at=now()
       WHERE id=$8 RETURNING *`,
      [payload.supplier_id, payload.raw_material_id, payload.product_name, payload.unit_price, payload.code, payload.availability, payload.lead_time, id]
    );
    return rows[0] ? numify(rows[0], ['unit_price']) : null;
  }
  const sp = local.supplier_products.find(p => p.id === id);
  if (!sp) return null;
  Object.assign(sp, payload, { updated_at: new Date().toISOString() });
  saveLocal();
  return sp;
}

async function deleteSupplierProduct(id) {
  if (USE_POSTGRES) {
    const { rowCount } = await pool.query('DELETE FROM supplier_products WHERE id = $1', [id]);
    return rowCount > 0;
  }
  const idx = local.supplier_products.findIndex(p => p.id === id);
  if (idx === -1) return false;
  local.supplier_products.splice(idx, 1);
  saveLocal();
  return true;
}

async function listSupplierPurchases() {
  if (USE_POSTGRES) {
    const { rows: purchases } = await pool.query('SELECT * FROM supplier_purchases ORDER BY date DESC');
    if (purchases.length === 0) return [];
    const ids = purchases.map(p => p.id);
    const { rows: items } = await pool.query(
      'SELECT * FROM supplier_purchase_items WHERE purchase_id = ANY($1::int[])',
      [ids]
    );
    return purchases.map(p => ({
      ...numify(p, ['total']),
      items: items.filter(it => it.purchase_id === p.id).map(it => numify(it, ['quantity', 'unit_price', 'subtotal']))
    }));
  }
  return [...local.supplier_purchases].sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function getSupplierPurchase(id) {
  if (USE_POSTGRES) {
    const { rows } = await pool.query('SELECT * FROM supplier_purchases WHERE id = $1', [id]);
    if (rows.length === 0) return null;
    const { rows: items } = await pool.query('SELECT * FROM supplier_purchase_items WHERE purchase_id = $1', [id]);
    return { ...numify(rows[0], ['total']), items: items.map(it => numify(it, ['quantity', 'unit_price', 'subtotal'])) };
  }
  return local.supplier_purchases.find(p => p.id === id) || null;
}

async function createSupplierPurchase(data) {
  const status = data.status === 'recibido' ? 'recibido' : 'pendiente';
  if (USE_POSTGRES) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO supplier_purchases (supplier_id, supplier_name, status, total, notes, registered_by, received_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [data.supplier_id, data.supplier_name, status, data.total, data.notes || '', data.registered_by, status === 'recibido' ? new Date().toISOString() : null]
      );
      const purchase = rows[0];
      const insertedItems = [];
      for (const it of data.items) {
        const { rows: itemRows } = await client.query(
          `INSERT INTO supplier_purchase_items (purchase_id, raw_material_id, raw_material_name, unit, quantity, unit_price, subtotal)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [purchase.id, it.raw_material_id, it.raw_material_name, it.unit, it.quantity, it.unit_price, it.subtotal]
        );
        insertedItems.push(numify(itemRows[0], ['quantity', 'unit_price', 'subtotal']));
      }
      await client.query('COMMIT');
      return { ...numify(purchase, ['total']), items: insertedItems };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  const purchase = {
    id: nextLocalId(local.supplier_purchases),
    supplier_id: data.supplier_id,
    supplier_name: data.supplier_name,
    date: new Date().toISOString(),
    status,
    total: data.total,
    notes: data.notes || '',
    registered_by: data.registered_by,
    received_at: status === 'recibido' ? new Date().toISOString() : null,
    items: data.items
  };
  local.supplier_purchases.unshift(purchase);
  saveLocal();
  return purchase;
}

async function markPurchaseReceived(id) {
  if (USE_POSTGRES) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query('SELECT * FROM supplier_purchases WHERE id = $1', [id]);
      const purchase = rows[0];
      if (!purchase) return { error: 'not_found' };
      if (purchase.status === 'recibido') return { error: 'already_received' };
      const { rows: updated } = await client.query(
        `UPDATE supplier_purchases SET status='recibido', received_at=now() WHERE id=$1 RETURNING *`,
        [id]
      );
      const { rows: items } = await client.query('SELECT * FROM supplier_purchase_items WHERE purchase_id = $1', [id]);
      return { purchase: { ...numify(updated[0], ['total']), items: items.map(it => numify(it, ['quantity', 'unit_price', 'subtotal'])) } };
    } finally {
      client.release();
    }
  }
  const purchase = local.supplier_purchases.find(p => p.id === id);
  if (!purchase) return { error: 'not_found' };
  if (purchase.status === 'recibido') return { error: 'already_received' };
  purchase.status = 'recibido';
  purchase.received_at = new Date().toISOString();
  saveLocal();
  return { purchase };
}

module.exports = {
  ready,
  listSuppliers,
  findSupplierByName,
  getSupplier,
  createSupplier,
  updateSupplier,
  supplierHasPurchases,
  deleteSupplier,
  listSupplierProducts,
  createSupplierProduct,
  updateSupplierProduct,
  deleteSupplierProduct,
  listSupplierPurchases,
  getSupplierPurchase,
  createSupplierPurchase,
  markPurchaseReceived
};
