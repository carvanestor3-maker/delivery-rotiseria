const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, 'delivery.db');
const db = new DatabaseSync(dbPath);

// Habilitar WAL mode para mejor rendimiento
db.exec('PRAGMA journal_mode = WAL;');

// Inicialización de Tablas
function initDb() {
  // Tabla de Categorías
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '🍽️',
      sort_order INTEGER DEFAULT 0
    );
  `);

  // Tabla de Productos
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES categories(id),
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      image_url TEXT,
      available INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Tabla de Pedidos (con campo 'paid' para control de caja)
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      address TEXT,
      delivery_type TEXT DEFAULT 'delivery',
      payment_method TEXT DEFAULT 'Efectivo',
      payment_note TEXT,
      notes TEXT,
      items TEXT NOT NULL,
      total REAL NOT NULL,
      status TEXT DEFAULT 'nuevo',
      paid INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Asegurar que la columna 'paid' exista si la tabla ya había sido creada anteriormente
  try {
    db.exec('ALTER TABLE orders ADD COLUMN paid INTEGER DEFAULT 0;');
  } catch (e) {
    // Si la columna ya existe, SQLite ignorará la alteración
  }

  // Tabla de Configuraciones
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Asegurar categoría 'Promos y Combos'
  const updatePromos = db.prepare("UPDATE categories SET name = 'Promos y Combos', icon = '🔥', sort_order = 0 WHERE name LIKE '%Promo%'");
  updatePromos.run();

  // Verificar si existe la categoría 'Minutas'
  const minutaCheck = db.prepare("SELECT id FROM categories WHERE name LIKE '%Minuta%'").get();
  let minutasCatId;
  if (!minutaCheck) {
    const insertMinutaCat = db.prepare("INSERT INTO categories (name, icon, sort_order) VALUES ('Minutas', '🍳', 1)");
    const info = insertMinutaCat.run();
    minutasCatId = info.lastInsertRowid;
  } else {
    minutasCatId = minutaCheck.id;
  }

  // Poblar productos de Minutas si no están agregados aún
  const minutaProdCheck = db.prepare("SELECT COUNT(*) as count FROM products WHERE category_id = ?").get(minutasCatId).count;
  if (minutaProdCheck === 0) {
    const insertProd = db.prepare("INSERT INTO products (category_id, name, description, price, image_url, available) VALUES (?, ?, ?, ?, ?, 1)");
    insertProd.run(minutasCatId, 'Sándwich de Milanesa Completo', 'Milanesa de carne, lechuga, tomate, jamón, queso y huevo frito con papas fritas.', 7500, 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=500');
    insertProd.run(minutasCatId, 'Milanesa Napolitana con Papas Fritas', 'Milanesa grande cubierta con salsa de tomate casera, muzzarella y orégano.', 8200, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500');
    insertProd.run(minutasCatId, 'Lomito Completo al Pan', 'Lomo vacuno tierno, lechuga, tomate, jamón, queso, huevo frito y papas fritas.', 7900, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500');
    insertProd.run(minutasCatId, 'Porción de Papas Fritas Cheddar & Bacon', 'Papas crocantes bañadas en abundante salsa cheddar caliente y trozos de bacon.', 4500, 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500');
  }

  // Configuraciones iniciales
  const setInsert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  setInsert.run('restaurant_name', 'La Gran Rotisería');
  setInsert.run('whatsapp_phone', '5491112345678');
  setInsert.run('delivery_cost', '1200');
  setInsert.run('currency_symbol', '$');
  setInsert.run('is_open', '1');
}

initDb();

module.exports = db;
