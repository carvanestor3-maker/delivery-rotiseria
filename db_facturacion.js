// ==========================================================================
// BASE DE DATOS SEPARADA: Comprobantes Fiscales Emitidos (Facturación ARCA)
// ==========================================================================
// Igual que db_suppliers.js, esta es una base de datos APARTE con su propia
// tabla SQL real (o su propio archivo separado si no hay Postgres) - guarda
// el historial de comprobantes que efectivamente se emitieron contra ARCA
// (CAE, vencimiento, número, etc.), independiente del registro único del
// resto del sistema. Es el segundo paso de la descentralización gradual.
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
    console.error('⚠️ [Facturación] Conexión inactiva del pool cortada por el proveedor (recuperado sin caerse):', err.message);
  });
}

const localPath = path.join(__dirname, 'facturacion_store.json');
let local = { facturas: [] };

function loadLocal() {
  try {
    if (fs.existsSync(localPath)) {
      local = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      if (!local.facturas) local.facturas = [];
    } else {
      saveLocal();
    }
  } catch (e) {
    console.error('Error al cargar facturacion_store.json:', e);
  }
}

function saveLocal() {
  try {
    fs.writeFileSync(localPath, JSON.stringify(local, null, 2), 'utf8');
  } catch (e) {
    console.error('Error al guardar facturacion_store.json:', e);
  }
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS facturas_emitidas (
      id SERIAL PRIMARY KEY,
      order_id INTEGER,
      order_number TEXT,
      tipo_comprobante_nombre TEXT NOT NULL,
      tipo_comprobante_id INTEGER NOT NULL,
      punto_venta INTEGER NOT NULL,
      numero_comprobante INTEGER NOT NULL,
      fecha_emision TEXT NOT NULL,
      doc_tipo INTEGER,
      doc_nro BIGINT,
      cliente_nombre TEXT,
      importe_total NUMERIC NOT NULL,
      cae TEXT NOT NULL,
      cae_vencimiento TEXT,
      cuit_emisor BIGINT,
      condicion_iva_emisor TEXT,
      homologacion BOOLEAN NOT NULL DEFAULT true,
      items JSONB,
      registered_by TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_facturas_order_id ON facturas_emitidas(order_id);`);
}

const ready = USE_POSTGRES
  ? ensureTables().catch(err => {
      console.error('⚠️ [Facturación] No se pudo conectar a Postgres, uso archivo local separado como respaldo:', err.message);
      loadLocal();
    })
  : Promise.resolve(loadLocal());

function nextLocalId(arr) {
  return arr.length > 0 ? Math.max(...arr.map(x => x.id)) + 1 : 1;
}

function numify(row, fields) {
  if (!row) return row;
  fields.forEach(f => {
    if (row[f] !== null && row[f] !== undefined) row[f] = parseFloat(row[f]);
  });
  return row;
}

async function findByOrderId(orderId) {
  if (USE_POSTGRES) {
    const { rows } = await pool.query('SELECT * FROM facturas_emitidas WHERE order_id = $1 ORDER BY id DESC LIMIT 1', [orderId]);
    return rows[0] ? numify(rows[0], ['importe_total']) : null;
  }
  const matches = local.facturas.filter(f => f.order_id === orderId);
  return matches.length ? matches[matches.length - 1] : null;
}

async function getById(id) {
  if (USE_POSTGRES) {
    const { rows } = await pool.query('SELECT * FROM facturas_emitidas WHERE id = $1', [id]);
    return rows[0] ? numify(rows[0], ['importe_total']) : null;
  }
  return local.facturas.find(f => f.id === id) || null;
}

async function listFacturas() {
  if (USE_POSTGRES) {
    const { rows } = await pool.query('SELECT * FROM facturas_emitidas ORDER BY id DESC LIMIT 200');
    return rows.map(r => numify(r, ['importe_total']));
  }
  return [...local.facturas].sort((a, b) => b.id - a.id).slice(0, 200);
}

async function crearFactura(data) {
  const payload = {
    order_id: data.order_id || null,
    order_number: data.order_number || null,
    tipo_comprobante_nombre: data.tipo_comprobante_nombre,
    tipo_comprobante_id: data.tipo_comprobante_id,
    punto_venta: data.punto_venta,
    numero_comprobante: data.numero_comprobante,
    fecha_emision: data.fecha_emision,
    doc_tipo: data.doc_tipo,
    doc_nro: data.doc_nro,
    cliente_nombre: data.cliente_nombre || '',
    importe_total: data.importe_total,
    cae: data.cae,
    cae_vencimiento: data.cae_vencimiento,
    cuit_emisor: data.cuit_emisor,
    condicion_iva_emisor: data.condicion_iva_emisor,
    homologacion: !!data.homologacion,
    items: data.items || [],
    registered_by: data.registered_by || ''
  };
  if (USE_POSTGRES) {
    const { rows } = await pool.query(
      `INSERT INTO facturas_emitidas
        (order_id, order_number, tipo_comprobante_nombre, tipo_comprobante_id, punto_venta, numero_comprobante,
         fecha_emision, doc_tipo, doc_nro, cliente_nombre, importe_total, cae, cae_vencimiento, cuit_emisor,
         condicion_iva_emisor, homologacion, items, registered_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [payload.order_id, payload.order_number, payload.tipo_comprobante_nombre, payload.tipo_comprobante_id,
       payload.punto_venta, payload.numero_comprobante, payload.fecha_emision, payload.doc_tipo, payload.doc_nro,
       payload.cliente_nombre, payload.importe_total, payload.cae, payload.cae_vencimiento, payload.cuit_emisor,
       payload.condicion_iva_emisor, payload.homologacion, JSON.stringify(payload.items), payload.registered_by]
    );
    return numify(rows[0], ['importe_total']);
  }
  const row = { id: nextLocalId(local.facturas), ...payload, created_at: new Date().toISOString() };
  local.facturas.push(row);
  saveLocal();
  return row;
}

module.exports = {
  ready,
  findByOrderId,
  getById,
  listFacturas,
  crearFactura
};
