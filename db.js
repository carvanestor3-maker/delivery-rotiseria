const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'delivery_store.json');

// Datos iniciales por defecto
const initialData = {
  settings: {
    restaurant_name: 'La Gran Rotisería',
    whatsapp_phone: '5491112345678',
    delivery_cost: '1200',
    currency_symbol: '$',
    is_open: '1',
    auto_print_epson: '0',
    epson_printer_ip: '',
    welcome_points: 1000,
    referral_points: 500,
    points_per_100_currency: 3,
    encargado_pin: '2222', // PIN Nivel 2 por defecto
    admin_pin: '9999'      // PIN Nivel 3 por defecto
  },
  customers: [],
  users: [
    { id: 1, name: 'Gerente General / Dueño', pin: '9999', level: 3, active: 1 },
    { id: 2, name: 'Encargado de Turno Mañana', pin: '2222', level: 2, active: 1 },
    { id: 3, name: 'Encargado de Turno Noche', pin: '3333', level: 2, active: 1 },
    { id: 4, name: 'Cajero / Operativo 1', pin: '1111', level: 1, active: 1 }
  ],
  categories: [
    { id: 1, name: 'Promos y Combos', icon: '🔥', sort_order: 0 },
    { id: 2, name: 'Minutas', icon: '🍳', sort_order: 1 },
    { id: 3, name: 'Hamburguesas', icon: '🍔', sort_order: 2 },
    { id: 4, name: 'Pizzas', icon: '🍕', sort_order: 3 },
    { id: 5, name: 'Empanadas', icon: '🥟', sort_order: 4 },
    { id: 6, name: 'Bebidas', icon: '🥤', sort_order: 5 }
  ],
  products: [
    { id: 1, category_id: 1, name: 'Promo 2x1 Hamburguesas Clásicas', description: '2 Hamburguesas dobles con queso cheddar y papas fritas familiares.', price: 9500, image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500', available: 1 },
    { id: 2, category_id: 1, name: 'Combo Familiar Pizza + 6 Empanadas', description: '1 Pizza Muzzarella grande + 6 empanadas a elección.', price: 12500, image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500', available: 1 },
    { id: 3, category_id: 2, name: 'Sándwich de Milanesa Completo', description: 'Milanesa de carne, lechuga, tomate, jamón, queso y huevo frito con papas.', price: 7500, image_url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=500', available: 1 },
    { id: 4, category_id: 2, name: 'Milanesa Napolitana con Papas Fritas', description: 'Milanesa grande cubierta con salsa de tomate casera, muzzarella y orégano.', price: 8200, image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500', available: 1 },
    { id: 5, category_id: 2, name: 'Lomito Completo al Pan', description: 'Lomo vacuno tierno, lechuga, tomate, jamón, queso, huevo frito y papas.', price: 7900, image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500', available: 1 },
    { id: 6, category_id: 2, name: 'Porción de Papas Fritas Cheddar & Bacon', description: 'Papas crocantes bañadas en salsa cheddar caliente y panceta crocante.', price: 4500, image_url: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500', available: 1 },
    { id: 7, category_id: 3, name: 'Hamburguesa Doble Cheddar & Bacon', description: 'Doble medallón 120g, cheddar, tocino crocante y salsa de la casa.', price: 6200, image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500', available: 1 },
    { id: 8, category_id: 3, name: 'Hamburguesa Veggie de NotBurger', description: 'Medallón vegetal, palta, lechuga, tomate y mayonesa vegana.', price: 5800, image_url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=500', available: 1 },
    { id: 9, category_id: 4, name: 'Pizza Muzzarella Especial', description: 'Salsa de tomate casera, 300g muzzarella, aceitunas y orégano.', price: 7200, image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500', available: 1 },
    { id: 10, category_id: 4, name: 'Pizza Napolitana con Jamón', description: 'Muzzarella, rodajas de tomate fresco, ajo, perejil y jamón cocido.', price: 8100, image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500', available: 1 },
    { id: 11, category_id: 5, name: 'Empanada de Carne Cortada a Cuchillo', description: 'Relleno jugoso con cebolla, huevo y especias tradicionales.', price: 1100, image_url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500', available: 1 },
    { id: 12, category_id: 5, name: 'Empanada de Jamón y Queso', description: 'Queso tirante y jamón cocido seleccionado.', price: 1000, image_url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500', available: 1 },
    { id: 13, category_id: 6, name: 'Coca Cola 1.5L', description: 'Botella 1.5 Litros bien fría.', price: 2500, image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500', available: 1 },
    { id: 14, category_id: 6, name: 'Cerveza Cautiva IPA 473ml', description: 'Lata artesanal bien helada.', price: 2800, image_url: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=500', available: 1 }
  ],
  suppliers: [
    { id: 1, name: 'Frigorífico Central', phone: '3794123456', address: 'Av. Cazadores Correntinos 2100' },
    { id: 2, name: 'Distribuidora Don Pedro', phone: '3794987654', address: 'Calle Junín 850' }
  ],
  raw_materials: [
    { id: 1, name: 'Carne Vacuna para Milanesas', unit: 'kg', current_stock: 45.0, min_stock: 10.0 },
    { id: 2, name: 'Papas para Fritar', unit: 'kg', current_stock: 80.0, min_stock: 15.0 },
    { id: 3, name: 'Queso Muzzarella', unit: 'kg', current_stock: 30.0, min_stock: 5.0 },
    { id: 4, name: 'Pan de Sándwich', unit: 'unidades', current_stock: 120.0, min_stock: 20.0 }
  ],
  product_recipes: [
    { product_id: 3, raw_material_id: 1, qty_per_portion: 0.25 },
    { product_id: 3, raw_material_id: 2, qty_per_portion: 0.20 },
    { product_id: 3, raw_material_id: 4, qty_per_portion: 1.00 },
    { product_id: 4, raw_material_id: 1, qty_per_portion: 0.30 },
    { product_id: 4, raw_material_id: 2, qty_per_portion: 0.25 },
    { product_id: 4, raw_material_id: 3, qty_per_portion: 0.15 }
  ],
  stock_entries: [],
  stock_adjustments: [],
  cash_shifts: [
    {
      id: 1,
      opened_at: new Date().toISOString(),
      closed_at: null,
      initial_cash: 10000,
      final_cash: null,
      status: 'open',
      opened_by: 'Encargado de Turno Mañana (Nivel 2)'
    }
  ],
  orders: [],
  customer_accounts: [
    {
      id: 1,
      name: "Carlos Rodríguez",
      dni: "32456789",
      phone: "5493794112233",
      address: "Av. San Martín 450",
      payment_term: "quincenal",
      credit_limit: 25000,
      balance: 0,
      status: "active",
      created_at: new Date().toISOString()
    }
  ],
  account_payments: []
};

let store = { ...initialData };

function loadStore() {
  try {
    if (fs.existsSync(dbPath)) {
      const content = fs.readFileSync(dbPath, 'utf8');
      store = JSON.parse(content);
      if (!store.users) store.users = initialData.users;
      if (!store.categories) store.categories = initialData.categories;
      if (!store.products) store.products = initialData.products;
      if (!store.orders) store.orders = initialData.orders;
      if (!store.customer_accounts) store.customer_accounts = initialData.customer_accounts;
      if (!store.account_payments) store.account_payments = [];
      if (!store.suppliers) store.suppliers = initialData.suppliers;
      if (!store.raw_materials) store.raw_materials = initialData.raw_materials;
      if (!store.product_recipes) store.product_recipes = initialData.product_recipes;
      if (!store.stock_entries) store.stock_entries = [];
      if (!store.stock_adjustments) store.stock_adjustments = [];
      if (!store.cash_shifts) store.cash_shifts = initialData.cash_shifts;
      if (!store.settings.admin_pin) store.settings.admin_pin = '9999';
      if (!store.settings.encargado_pin) store.settings.encargado_pin = '2222';
      if (!store.club_customers) store.club_customers = [];
      if (!store.points_history) store.points_history = [];
      if (!store.coupons) store.coupons = [
        {
          id: 1,
          code: 'PROMO-BIENVENIDA',
          title: '20% OFF en tu Primera Compra',
          description: 'Válido para cualquier combo o minuta del menú.',
          discount_percent: 20,
          status: 'available', // available, used, expired
          valid_until: '2026-12-31'
        },
        {
          id: 2,
          code: 'PROMO-PIZZA',
          title: '$1.500 Descuento en Pizzas Especiales',
          description: 'Aplica en Pizzas Muzzarella o Napolitana.',
          discount_fixed: 1500,
          status: 'available',
          valid_until: '2026-12-31'
        }
      ];
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

// Adaptador SQL y Gestión del Store
const db = {
  getStore() {
    return store;
  },
  saveStore() {
    saveStore();
  },
  prepare(sql) {
    return {
      all(...params) {
        const query = sql.toLowerCase();

        if (query.includes('from users')) {
          return [...store.users];
        }

        if (query.includes('from categories')) {
          return [...store.categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        }

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

        if (query.includes('from products')) {
          return [...store.products];
        }

        if (query.includes('from orders where status = ?')) {
          const status = params[0];
          return store.orders
            .filter(o => o.status === status)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map(o => ({ ...o, items: typeof o.items === 'string' ? o.items : JSON.stringify(o.items) }));
        }

        if (query.includes('from orders')) {
          return store.orders
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map(o => ({ ...o, items: typeof o.items === 'string' ? o.items : JSON.stringify(o.items) }));
        }

        if (query.includes('from customer_accounts')) {
          return [...store.customer_accounts].sort((a, b) => a.name.localeCompare(b.name));
        }

        if (query.includes('from suppliers')) {
          return [...store.suppliers];
        }

        if (query.includes('from raw_materials')) {
          return [...store.raw_materials];
        }

        if (query.includes('from stock_entries')) {
          return [...store.stock_entries].sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        if (query.includes('from stock_adjustments')) {
          return [...store.stock_adjustments].sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        if (query.includes('from cash_shifts')) {
          return [...store.cash_shifts].sort((a, b) => new Date(b.opened_at) - new Date(a.opened_at));
        }

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

        if (query.includes('from customer_accounts where id = ?')) {
          const id = parseInt(params[0]);
          return store.customer_accounts.find(a => a.id === id) || null;
        }

        return null;
      },

      run(...params) {
        return { changes: 1 };
      }
    };
  }
};

module.exports = db;
