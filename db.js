const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'delivery_store.json');

// Datos iniciales por defecto
const initialData = {
  categories: [
    { id: 1, name: 'Promos y Combos', icon: '🔥', sort_order: 0 },
    { id: 2, name: 'Minutas', icon: '🍳', sort_order: 1 },
    { id: 3, name: 'Hamburguesas', icon: '🍔', sort_order: 2 },
    { id: 4, name: 'Pizzas', icon: '🍕', sort_order: 3 },
    { id: 5, name: 'Empanadas', icon: '🥟', sort_order: 4 },
    { id: 6, name: 'Bebidas', icon: '🥤', sort_order: 5 }
  ],
  products: [
    // Promos y Combos (cat 1)
    { id: 1, category_id: 1, name: 'Promo 2x1 Hamburguesas Clásicas', description: '2 Hamburguesas dobles con queso cheddar y papas fritas familiares.', price: 9500, image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500', available: 1 },
    { id: 2, category_id: 1, name: 'Combo Familiar Pizza + 6 Empanadas', description: '1 Pizza Muzzarella grande + 6 empanadas a elección.', price: 12500, image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500', available: 1 },

    // Minutas (cat 2)
    { id: 3, category_id: 2, name: 'Sándwich de Milanesa Completo', description: 'Milanesa de carne, lechuga, tomate, jamón, queso y huevo frito con papas.', price: 7500, image_url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=500', available: 1 },
    { id: 4, category_id: 2, name: 'Milanesa Napolitana con Papas Fritas', description: 'Milanesa grande cubierta con salsa de tomate casera, muzzarella y orégano.', price: 8200, image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500', available: 1 },
    { id: 5, category_id: 2, name: 'Lomito Completo al Pan', description: 'Lomo vacuno tierno, lechuga, tomate, jamón, queso, huevo frito y papas.', price: 7900, image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500', available: 1 },
    { id: 6, category_id: 2, name: 'Porción de Papas Fritas Cheddar & Bacon', description: 'Papas crocantes bañadas en salsa cheddar caliente y panceta crocante.', price: 4500, image_url: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500', available: 1 },

    // Hamburguesas (cat 3)
    { id: 7, category_id: 3, name: 'Hamburguesa Doble Cheddar & Bacon', description: 'Doble medallón 120g, cheddar, tocino crocante y salsa de la casa.', price: 6200, image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500', available: 1 },
    { id: 8, category_id: 3, name: 'Hamburguesa Veggie de NotBurger', description: 'Medallón vegetal, palta, lechuga, tomate y mayonesa vegana.', price: 5800, image_url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=500', available: 1 },

    // Pizzas (cat 4)
    { id: 9, category_id: 4, name: 'Pizza Muzzarella Especial', description: 'Salsa de tomate casera, 300g muzzarella, aceitunas y orégano.', price: 7200, image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500', available: 1 },
    { id: 10, category_id: 4, name: 'Pizza Napolitana con Jamón', description: 'Muzzarella, rodajas de tomate fresco, ajo, perejil y jamón cocido.', price: 8100, image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500', available: 1 },

    // Empanadas (cat 5)
    { id: 11, category_id: 5, name: 'Empanada de Carne Cortada a Cuchillo', description: 'Relleno jugoso con cebolla, huevo y especias tradicionales.', price: 1100, image_url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500', available: 1 },
    { id: 12, category_id: 5, name: 'Empanada de Jamón y Queso', description: 'Queso tirante y jamón cocido seleccionado.', price: 1000, image_url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500', available: 1 },

    // Bebidas (cat 6)
    { id: 13, category_id: 6, name: 'Coca Cola 1.5L', description: 'Botella 1.5 Litros bien fría.', price: 2500, image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500', available: 1 },
    { id: 14, category_id: 6, name: 'Cerveza Cautiva IPA 473ml', description: 'Lata artesanal bien helada.', price: 2800, image_url: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=500', available: 1 }
  ],
  orders: [],
  settings: {
    restaurant_name: 'La Gran Rotisería',
    whatsapp_phone: '5491112345678',
    delivery_cost: '1200',
    currency_symbol: '$',
    is_open: '1',
    auto_print_epson: '0',
    epson_printer_ip: ''
  }
};

let store = { ...initialData };

function loadStore() {
  try {
    if (fs.existsSync(dbPath)) {
      const content = fs.readFileSync(dbPath, 'utf8');
      store = JSON.parse(content);
      if (!store.categories) store.categories = initialData.categories;
      if (!store.products) store.products = initialData.products;
      if (!store.orders) store.orders = initialData.orders;
      if (!store.settings) store.settings = initialData.settings;
    } else {
      saveStore();
    }
  } catch (e) {
    console.error('Error al cargar store JSON:', e);
    store = { ...initialData };
  }
}

function saveStore() {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.error('Error al guardar store JSON:', e);
  }
}

loadStore();

// Adaptador SQL liviano y ultrarrápido (100% Nube y Cero Bloqueos)
const db = {
  prepare(sql) {
    return {
      all(...params) {
        const query = sql.toLowerCase();
        
        // GET CATEGORIES
        if (query.includes('from categories')) {
          return [...store.categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        }

        // GET PRODUCTS FOR ADMIN
        if (query.includes('from products p') || query.includes('left join categories')) {
          return store.products.map(p => {
            const cat = store.categories.find(c => c.id === p.category_id);
            return {
              ...p,
              category_name: cat ? cat.name : 'Sin categoría',
              category_icon: cat ? cat.icon : '🍽️'
            };
          });
        }

        // GET PRODUCTS
        if (query.includes('from products')) {
          return [...store.products];
        }

        // GET ORDERS BY STATUS
        if (query.includes('from orders where status = ?')) {
          const status = params[0];
          return store.orders
            .filter(o => o.status === status)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map(o => ({ ...o, items: typeof o.items === 'string' ? o.items : JSON.stringify(o.items) }));
        }

        // GET ORDERS ALL
        if (query.includes('from orders')) {
          return store.orders
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map(o => ({ ...o, items: typeof o.items === 'string' ? o.items : JSON.stringify(o.items) }));
        }

        // GET SETTINGS
        if (query.includes('from settings')) {
          return Object.entries(store.settings).map(([key, value]) => ({ key, value }));
        }

        return [];
      },

      get(...params) {
        const query = sql.toLowerCase();

        if (query.includes('count(*) as count from categories')) {
          return { count: store.categories.length };
        }

        if (query.includes('count(*) as count from products')) {
          return { count: store.products.length };
        }

        if (query.includes('count(*) as count from orders')) {
          return { count: store.orders.length };
        }

        if (query.includes('from orders where id = ?')) {
          const id = parseInt(params[0]);
          const order = store.orders.find(o => o.id === id);
          if (!order) return null;
          return {
            ...order,
            items: typeof order.items === 'string' ? order.items : JSON.stringify(order.items)
          };
        }

        if (query.includes('from categories where name like')) {
          const namePart = String(params[0] || '').replace(/%/g, '').toLowerCase();
          return store.categories.find(c => c.name.toLowerCase().includes(namePart)) || null;
        }

        return null;
      },

      run(...params) {
        const query = sql.toLowerCase();

        // INSERT ORDER
        if (query.includes('insert into orders')) {
          const [order_number, customer_name, customer_phone, address, delivery_type, payment_method, payment_note, notes, items, total, status, paid] = params;
          const nextId = store.orders.length > 0 ? Math.max(...store.orders.map(o => o.id)) + 1 : 1;
          
          const newOrder = {
            id: nextId,
            order_number,
            customer_name,
            customer_phone,
            address,
            delivery_type: delivery_type || 'delivery',
            payment_method: payment_method || 'Efectivo',
            payment_note: payment_note || '',
            notes: notes || '',
            items: typeof items === 'string' ? items : JSON.stringify(items),
            total: parseFloat(total),
            status: status || 'nuevo',
            paid: paid ? 1 : 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          store.orders.unshift(newOrder);
          saveStore();
          return { lastInsertRowid: nextId };
        }

        // UPDATE ORDER STATUS
        if (query.includes('update orders set status =')) {
          const status = params[0];
          const id = parseInt(params[1]);
          const order = store.orders.find(o => o.id === id);
          if (order) {
            order.status = status;
            order.updated_at = new Date().toISOString();
            saveStore();
          }
          return { changes: 1 };
        }

        // UPDATE ORDER PAID
        if (query.includes('update orders set paid =')) {
          const paid = params[0];
          const id = parseInt(params[1]);
          const order = store.orders.find(o => o.id === id);
          if (order) {
            order.paid = paid ? 1 : 0;
            order.updated_at = new Date().toISOString();
            saveStore();
          }
          return { changes: 1 };
        }

        // INSERT/UPDATE PRODUCT
        if (query.includes('insert into products')) {
          const [category_id, name, description, price, image_url, available] = params;
          const nextId = store.products.length > 0 ? Math.max(...store.products.map(p => p.id)) + 1 : 1;
          store.products.push({
            id: nextId,
            category_id: parseInt(category_id),
            name,
            description,
            price: parseFloat(price),
            image_url,
            available: available ? 1 : 0
          });
          saveStore();
          return { lastInsertRowid: nextId };
        }

        if (query.includes('update products set category_id =')) {
          const [category_id, name, description, price, image_url, available, id] = params;
          const prod = store.products.find(p => p.id === parseInt(id));
          if (prod) {
            prod.category_id = parseInt(category_id);
            prod.name = name;
            prod.description = description;
            prod.price = parseFloat(price);
            prod.image_url = image_url;
            prod.available = available ? 1 : 0;
            saveStore();
          }
          return { changes: 1 };
        }

        // TOGGLE PRODUCT AVAILABILITY
        if (query.includes('update products set available = case when available = 1')) {
          const id = parseInt(params[0]);
          const prod = store.products.find(p => p.id === id);
          if (prod) {
            prod.available = prod.available === 1 ? 0 : 1;
            saveStore();
          }
          return { changes: 1 };
        }

        // DELETE PRODUCT
        if (query.includes('delete from products where id =')) {
          const id = parseInt(params[0]);
          store.products = store.products.filter(p => p.id !== id);
          saveStore();
          return { changes: 1 };
        }

        // INSERT CATEGORY
        if (query.includes('insert into categories')) {
          const [name, icon, sort_order] = params;
          const nextId = store.categories.length > 0 ? Math.max(...store.categories.map(c => c.id)) + 1 : 1;
          store.categories.push({ id: nextId, name, icon: icon || '🍽️', sort_order: parseInt(sort_order || 10) });
          saveStore();
          return { lastInsertRowid: nextId };
        }

        // INSERT/REPLACE SETTINGS
        if (query.includes('insert or replace into settings') || query.includes('settings')) {
          const [key, value] = params;
          store.settings[key] = String(value);
          saveStore();
          return { changes: 1 };
        }

        return { changes: 0 };
      }
    };
  }
};

module.exports = db;
