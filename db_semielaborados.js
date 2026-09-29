// ==========================================================================
// BASE DE DATOS SEPARADA: Pre-Armados / Semielaborados de Producción
// ==========================================================================
// Mismo criterio que db_suppliers.js (Proveedores, Precios & Compras): esto
// es una base APARTE, con sus propias tablas SQL reales (o su propio archivo
// separado si no hay Postgres), y NO vive adentro del "store" general de
// db.js. Es el siguiente paso de ir descentralizando de a poco las bases,
// tal cual se pidió.
//
// Qué guarda:
//  - semi_elaborados: el catálogo de pre-armados (salsas, rellenos, jarabes,
//    mezclas base, etc.) con su propio stock y su costo real calculado.
//  - semi_elaborado_recipe_items: la Ficha Técnica de CADA pre-armado (de
//    qué insumos genéricos está hecho, y en qué cantidad por unidad).
//  - semi_production_entries: el historial de cada tanda de producción de
//    un pre-armado (cuánto se preparó, qué insumos descontó y a qué costo).
//
// Lo único que comparte con el resto del sistema es el ID del insumo
// genérico (raw_material_id) al que se vincula cada ingrediente de la
// receta - esa vinculación se resuelve en server.js consultando ambas
// bases, nunca mezclando los datos en un solo lugar.
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
    console.error('⚠️ [Pre-Armados] Conexión inactiva del pool cortada por el proveedor (recuperado sin caerse):', err.message);
  });
}

// ----- Modo archivo local separado (semielaborados_store.json) -----
// Archivo DISTINTO a delivery_store.json y a proveedores_store.json, a
// propósito, para que corriendo sin Postgres en esta PC los pre-armados
// sigan en su propia base separada.
const localPath = path.join(__dirname, 'semielaborados_store.json');
let local = {
  semi_elaborados: [],
  semi_elaborado_recipe_items: [],
  semi_production_entries: []
};

function loadLocal() {
  try {
    if (fs.existsSync(localPath)) {
      local = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      if (!local.semi_elaborados) local.semi_elaborados = [];
      if (!local.semi_elaborado_recipe_items) local.semi_elaborado_recipe_items = [];
      if (!local.semi_production_entries) local.semi_production_entries = [];
    } else {
      saveLocal();
    }
  } catch (e) {
    console.error('Error al cargar semielaborados_store.json:', e);
  }
}

function saveLocal() {
  try {
    fs.writeFileSync(localPath, JSON.stringify(local, null, 2), 'utf8');
  } catch (e) {
    console.error('Error al guardar semielaborados_store.json:', e);
  }
}

// ----- Modo Postgres: tablas propias, separadas de app_store -----
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS semi_elaborados (
      id SERIAL PRIMARY KEY,
      code TEXT DEFAULT '',
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'kg',
      current_stock NUMERIC NOT NULL DEFAULT 0,
      min_stock NUMERIC NOT NULL DEFAULT 0,
      cost_per_unit NUMERIC NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS semi_elaborado_recipe_items (
      id SERIAL PRIMARY KEY,
      semi_elaborado_id INTEGER NOT NULL REFERENCES semi_elaborados(id) ON DELETE CASCADE,
      raw_material_id INTEGER NOT NULL,
      qty_per_unit NUMERIC NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS semi_production_entries (
      id SERIAL PRIMARY KEY,
      date TIMESTAMPTZ DEFAULT now(),
      semi_elaborado_id INTEGER NOT NULL,
      semi_elaborado_name TEXT,
      unit TEXT,
      quantity NUMERIC NOT NULL,
      deducted_materials JSONB DEFAULT '[]',
      raw_material_cost_total NUMERIC NOT NULL DEFAULT 0,
      cost_per_unit_result NUMERIC NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      operator_name TEXT,
      registered_by TEXT
    );
  `);
}

const ready = USE_POSTGRES
  ? ensureTables().catch(err => {
      console.error('⚠️ [Pre-Armados] No se pudo conectar a Postgres, uso archivo local separado como respaldo:', err.message);
      loadLocal();
    })
  : Promise.resolve(loadLocal());

function nextLocalId(arr) {
  return arr.length > 0 ? Math.max(...arr.map(x => x.id)) + 1 : 1;
}

// node-pg devuelve NUMERIC como string (para no perder precisión) - se
// convierten a número para que el front pueda usarlas directo en cuentas.
function numify(row, fields) {
  if (!row) return row;
  fields.forEach(f => {
    if (row[f] !== null && row[f] !== undefined) row[f] = parseFloat(row[f]);
  });
  return row;
}

// ==========================================================================
// CATÁLOGO DE PRE-ARMADOS / SEMIELABORADOS
// ==========================================================================

async function listSemiElaborados() {
  if (USE_POSTGRES) {
    const { rows } = await pool.query('SELECT * FROM semi_elaborados ORDER BY name ASC');
    return rows.map(r => numify(r, ['current_stock', 'min_stock', 'cost_per_unit']));
  }
  return [...local.semi_elaborados].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}

async function getSemiElaborado(id) {
  if (USE_POSTGRES) {
    const { rows } = await pool.query('SELECT * FROM semi_elaborados WHERE id = $1', [id]);
    return rows[0] ? numify(rows[0], ['current_stock', 'min_stock', 'cost_per_unit']) : null;
  }
  return local.semi_elaborados.find(s => s.id === id) || null;
}

async function findSemiElaboradoByCode(code, excludeId) {
  const list = await listSemiElaborados();
  const strCode = (code || '').trim().toUpperCase();
  return list.find(s => s.code && s.code.toUpperCase() === strCode && s.id !== excludeId) || null;
}

async function findSemiElaboradoByName(name, excludeId) {
  const list = await listSemiElaborados();
  const strName = (name || '').trim().toLowerCase();
  return list.find(s => s.name && s.name.trim().toLowerCase() === strName && s.id !== excludeId) || null;
}

async function createSemiElaborado(data) {
  const payload = {
    code: (data.code || '').trim().toUpperCase(),
    name: (data.name || '').trim(),
    unit: data.unit || 'kg',
    current_stock: parseFloat(data.current_stock || 0),
    min_stock: parseFloat(data.min_stock || 0),
    cost_per_unit: 0
  };
  if (USE_POSTGRES) {
    const { rows } = await pool.query(
      `INSERT INTO semi_elaborados (code, name, unit, current_stock, min_stock, cost_per_unit)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [payload.code, payload.name, payload.unit, payload.current_stock, payload.min_stock, payload.cost_per_unit]
    );
    return numify(rows[0], ['current_stock', 'min_stock', 'cost_per_unit']);
  }
  const row = { id: nextLocalId(local.semi_elaborados), ...payload, created_at: new Date().toISOString() };
  local.semi_elaborados.push(row);
  saveLocal();
  return row;
}

async function updateSemiElaborado(id, data) {
  if (USE_POSTGRES) {
    const current = await getSemiElaborado(id);
    if (!current) return null;
    const payload = {
      code: (data.code || '').trim().toUpperCase(),
      name: (data.name || '').trim(),
      unit: data.unit || 'kg',
      min_stock: parseFloat(data.min_stock || 0),
      current_stock: data.current_stock !== undefined && data.current_stock !== '' ? parseFloat(data.current_stock) : current.current_stock
    };
    const { rows } = await pool.query(
      `UPDATE semi_elaborados SET code=$1, name=$2, unit=$3, min_stock=$4, current_stock=$5
       WHERE id=$6 RETURNING *`,
      [payload.code, payload.name, payload.unit, payload.min_stock, payload.current_stock, id]
    );
    return rows[0] ? numify(rows[0], ['current_stock', 'min_stock', 'cost_per_unit']) : null;
  }
  const semi = local.semi_elaborados.find(s => s.id === id);
  if (!semi) return null;
  semi.code = (data.code || '').trim().toUpperCase();
  semi.name = (data.name || '').trim();
  semi.unit = data.unit || 'kg';
  semi.min_stock = parseFloat(data.min_stock || 0);
  if (data.current_stock !== undefined && data.current_stock !== '') semi.current_stock = parseFloat(data.current_stock);
  saveLocal();
  return semi;
}

// ==========================================================================
// FICHA TÉCNICA (RECETA) DE CADA PRE-ARMADO - hecha de Insumos Genéricos
// ==========================================================================

async function listAllSemiElaboradoRecipes() {
  if (USE_POSTGRES) {
    const { rows } = await pool.query('SELECT * FROM semi_elaborado_recipe_items');
    return rows.map(r => numify(r, ['qty_per_unit']));
  }
  return [...local.semi_elaborado_recipe_items];
}

async function saveSemiElaboradoRecipe(semiElaboradoId, ingredients) {
  const cleanIngredients = (Array.isArray(ingredients) ? ingredients : [])
    .map(ing => ({
      raw_material_id: parseInt(ing.raw_material_id),
      qty_per_unit: parseFloat(ing.qty_per_unit || 0)
    }))
    .filter(ing => ing.raw_material_id && ing.qty_per_unit > 0);

  if (USE_POSTGRES) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM semi_elaborado_recipe_items WHERE semi_elaborado_id = $1', [semiElaboradoId]);
      for (const ing of cleanIngredients) {
        await client.query(
          `INSERT INTO semi_elaborado_recipe_items (semi_elaborado_id, raw_material_id, qty_per_unit) VALUES ($1,$2,$3)`,
          [semiElaboradoId, ing.raw_material_id, ing.qty_per_unit]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return cleanIngredients;
  }

  local.semi_elaborado_recipe_items = local.semi_elaborado_recipe_items.filter(r => r.semi_elaborado_id !== semiElaboradoId);
  cleanIngredients.forEach(ing => {
    local.semi_elaborado_recipe_items.push({ semi_elaborado_id: semiElaboradoId, ...ing });
  });
  saveLocal();
  return cleanIngredients;
}

// ==========================================================================
// PRODUCCIÓN DE UNA TANDA DE PRE-ARMADO: descuenta insumos (la llamada
// resuelve esa parte en server.js, consultando raw_materials de la base
// principal) y acá adentro se registra el resultado: suma stock al
// pre-armado, recalcula su costo real por promedio ponderado, y deja el
// registro en el historial - todo en una sola operación.
// ==========================================================================

async function registerProduction({ semiElaboradoId, quantity, deductedMaterials, rawMaterialCostTotal, notes, operatorName, registeredBy }) {
  const semi = await getSemiElaborado(semiElaboradoId);
  if (!semi) throw new Error('Pre-armado no encontrado');

  const oldStock = semi.current_stock || 0;
  const oldCost = semi.cost_per_unit || 0;
  const newStock = parseFloat((oldStock + quantity).toFixed(4));
  // Costo promedio ponderado: lo que ya había en stock a su costo viejo, más
  // lo que se acaba de producir a su costo real (insumos consumidos ahora).
  const newCostPerUnit = newStock > 0
    ? parseFloat((((oldStock * oldCost) + rawMaterialCostTotal) / newStock).toFixed(4))
    : 0;

  let updatedSemi;
  if (USE_POSTGRES) {
    const { rows } = await pool.query(
      `UPDATE semi_elaborados SET current_stock=$1, cost_per_unit=$2 WHERE id=$3 RETURNING *`,
      [newStock, newCostPerUnit, semiElaboradoId]
    );
    updatedSemi = numify(rows[0], ['current_stock', 'min_stock', 'cost_per_unit']);
  } else {
    semi.current_stock = newStock;
    semi.cost_per_unit = newCostPerUnit;
    saveLocal();
    updatedSemi = semi;
  }

  const entryData = {
    date: new Date().toISOString(),
    semi_elaborado_id: semiElaboradoId,
    semi_elaborado_name: semi.name,
    unit: semi.unit,
    quantity,
    deducted_materials: deductedMaterials || [],
    raw_material_cost_total: rawMaterialCostTotal,
    cost_per_unit_result: newCostPerUnit,
    notes: notes || '',
    operator_name: operatorName || '',
    registered_by: registeredBy || ''
  };

  let entry;
  if (USE_POSTGRES) {
    const { rows } = await pool.query(
      `INSERT INTO semi_production_entries (date, semi_elaborado_id, semi_elaborado_name, unit, quantity, deducted_materials, raw_material_cost_total, cost_per_unit_result, notes, operator_name, registered_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [entryData.date, entryData.semi_elaborado_id, entryData.semi_elaborado_name, entryData.unit, entryData.quantity,
       JSON.stringify(entryData.deducted_materials), entryData.raw_material_cost_total, entryData.cost_per_unit_result,
       entryData.notes, entryData.operator_name, entryData.registered_by]
    );
    entry = numify(rows[0], ['quantity', 'raw_material_cost_total', 'cost_per_unit_result']);
  } else {
    entry = { id: nextLocalId(local.semi_production_entries), ...entryData };
    local.semi_production_entries.unshift(entry);
    saveLocal();
  }

  return { semi: updatedSemi, entry };
}

async function listSemiProductionEntries(limit = 100) {
  if (USE_POSTGRES) {
    const { rows } = await pool.query('SELECT * FROM semi_production_entries ORDER BY date DESC LIMIT $1', [limit]);
    return rows.map(r => numify(r, ['quantity', 'raw_material_cost_total', 'cost_per_unit_result']));
  }
  return local.semi_production_entries.slice(0, limit);
}

// ==========================================================================
// DESCUENTO / REVERSIÓN DE STOCK DE UN PRE-ARMADO CUANDO SE USA COMO
// COMPONENTE DENTRO DE LA FICHA TÉCNICA DE UN PLATO/TRAGO QUE SE VENDE O
// PRODUCE (ver product_recipes en la base principal, campo semi_elaborado_id)
// ==========================================================================

async function deductSemiStock(id, qty) {
  const semi = await getSemiElaborado(id);
  if (!semi) return null;
  const newStock = parseFloat(Math.max(0, (semi.current_stock || 0) - qty).toFixed(4));
  if (USE_POSTGRES) {
    const { rows } = await pool.query('UPDATE semi_elaborados SET current_stock=$1 WHERE id=$2 RETURNING *', [newStock, id]);
    return numify(rows[0], ['current_stock', 'min_stock', 'cost_per_unit']);
  }
  semi.current_stock = newStock;
  saveLocal();
  return semi;
}

async function restoreSemiStock(id, qty) {
  const semi = await getSemiElaborado(id);
  if (!semi) return null;
  const newStock = parseFloat(((semi.current_stock || 0) + qty).toFixed(4));
  if (USE_POSTGRES) {
    const { rows } = await pool.query('UPDATE semi_elaborados SET current_stock=$1 WHERE id=$2 RETURNING *', [newStock, id]);
    return numify(rows[0], ['current_stock', 'min_stock', 'cost_per_unit']);
  }
  semi.current_stock = newStock;
  saveLocal();
  return semi;
}

module.exports = {
  ready,
  listSemiElaborados,
  getSemiElaborado,
  findSemiElaboradoByCode,
  findSemiElaboradoByName,
  createSemiElaborado,
  updateSemiElaborado,
  listAllSemiElaboradoRecipes,
  saveSemiElaboradoRecipe,
  registerProduction,
  listSemiProductionEntries,
  deductSemiStock,
  restoreSemiStock
};
