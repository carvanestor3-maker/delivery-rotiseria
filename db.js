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
    { id: 1,  name: 'Promos y Combos',              icon: '🔥', sort_order: 0  },
    { id: 2,  name: 'Minutas',                       icon: '🍳', sort_order: 1  },
    { id: 3,  name: 'Hamburguesas',                  icon: '🍔', sort_order: 2  },
    { id: 4,  name: 'Pizzas',                        icon: '🍕', sort_order: 3  },
    { id: 5,  name: 'Empanadas',                     icon: '🥟', sort_order: 4  },
    { id: 6,  name: 'Bebidas & Tragos',              icon: '🍺', sort_order: 5  },
    { id: 7,  name: 'Cafetería & Infusiones',        icon: '☕', sort_order: 6  },
    { id: 8,  name: 'Sándwiches de Lomo',            icon: '🥩', sort_order: 7  },
    { id: 9,  name: 'Sándwiches de Milanesa',        icon: '🥪', sort_order: 8  },
    { id: 10, name: 'Guarniciones & Porciones',      icon: '🥗', sort_order: 9  },
    { id: 11, name: 'Sándwiches Especiales / Miga',  icon: '🥪', sort_order: 10 },
    { id: 12, name: 'Combos Cafetería',              icon: '🫔', sort_order: 11 },
    { id: 13, name: 'Chipás & Panificados',          icon: '🧇', sort_order: 12 },
    { id: 14, name: 'Licuados',                      icon: '🥤', sort_order: 13 }
  ],
  products: [
    // 🍕 PIZZAS
    { id:1,  code:'PIZ-MUZ-001', category_id:4,  name:'Pizza Muzzarella Especial (Grande)',       description:'Salsa de tomate casera, 300g muzzarella, aceitunas y orégano.',                          price:25200, image_url:'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500', video_url:'https://www.youtube.com/watch?v=UoYmgMO-ZZE', available:1, unit_type:'unidad' },
    { id:2,  code:'PIZ-NAP-001', category_id:4,  name:'Pizza Napolitana (Grande)',                description:'Muzzarella, tomate en rodajas, ajo y albahaca fresca.',                                  price:27900, image_url:'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500', video_url:'https://www.youtube.com/watch?v=l3KJZ8smGIE', available:1, unit_type:'unidad' },
    { id:3,  code:'PIZ-FUG-001', category_id:4,  name:'Pizza Fugazzeta Rellena (Grande)',         description:'Doble masa rellena de muzzarella y cebolla caramelizada encima.',                        price:28900, image_url:'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500', video_url:'https://www.youtube.com/watch?v=mGjx1KpRxM4', available:1, unit_type:'unidad' },
    { id:4,  code:'PIZ-CAL-001', category_id:4,  name:'Pizza Calabresa con Pimiento (Grande)',    description:'Salami calabresa, morrón rojo y verde, aceitunas negras.',                               price:29700, image_url:'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=500', video_url:'https://www.youtube.com/watch?v=G-XZhKOKBJ0', available:1, unit_type:'unidad' },
    { id:5,  code:'PIZ-4QS-001', category_id:4,  name:'Pizza Cuatro Quesos (Grande)',             description:'Muzzarella, roquefort, parmesano y provolone gratinados.',                               price:32400, image_url:'https://images.unsplash.com/photo-1528137871618-79d2761e3fd5?w=500', video_url:'https://www.youtube.com/watch?v=8g_WXWF3HoE', available:1, unit_type:'unidad' },
    { id:6,  code:'PIZ-ESP-001', category_id:4,  name:'Pizza Especial (Jamón, Morrón y Huevo)',  description:'Jamón cocido, morrón asado, huevo, muzzarella y salsa.',                                 price:31500, image_url:'https://images.unsplash.com/photo-1590947132387-155cc02f3212?w=500', video_url:'https://www.youtube.com/watch?v=W5hBVUFlwAY', available:1, unit_type:'unidad' },
    { id:7,  code:'PIZ-BBQ-001', category_id:4,  name:'Pizza Pollo & BBQ (Grande)',              description:'Pollo desmenuzado, salsa BBQ ahumada, cebolla morada y muzzarella.',                     price:31450, image_url:'https://images.unsplash.com/photo-1601924582970-9238bcb495d6?w=500', video_url:'https://www.youtube.com/watch?v=7_b2LRv1h68', available:1, unit_type:'unidad' },
    { id:8,  code:'PIZ-VER-001', category_id:4,  name:'Pizza Verdura (Espinaca y Ricotta)',      description:'Espinaca salteada, ricotta cremosa, ajo y muzzarella gratinada.',                        price:27000, image_url:'https://images.unsplash.com/photo-1604917877934-07d8d248d396?w=500', video_url:'https://www.youtube.com/watch?v=3KZpRK7lBag', available:1, unit_type:'unidad' },
    { id:9,  code:'PIZ-POR-001', category_id:4,  name:'Porción de Pizza (2 porciones)',          description:'Porción doble de pizza del día (consultar disponibilidad).',                             price:8500,  image_url:'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=500', video_url:'https://www.youtube.com/results?search_query=pizza+porcion+argentina', available:1, unit_type:'unidad' },
    { id:10, code:'PIZ-FAI-001', category_id:4,  name:'Fainá (Grande)',                          description:'Torta de harina de garbanzo al horno, dorada y crocante.',                              price:7500,  image_url:'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=500', video_url:'https://www.youtube.com/watch?v=kOPgG_VpqHw', available:1, unit_type:'unidad' },
    // 🍔 HAMBURGUESAS
    { id:11, code:'HAM-CLA-001', category_id:3,  name:'Hamburguesa Clásica con Papas',           description:'Medallón 150g, lechuga, tomate, cebolla, ketchup y mayonesa.',                         price:8550,  image_url:'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500', video_url:'https://www.youtube.com/watch?v=hRLqRzFRQXU', available:1, unit_type:'unidad' },
    { id:12, code:'HAM-DOB-001', category_id:3,  name:'Hamburguesa Doble Cheddar & Bacon',       description:'Doble medallón 120g c/u, cheddar fundido, panceta crocante y salsa de la casa.',       price:12150, image_url:'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=500', video_url:'https://www.youtube.com/watch?v=7cfHbvw3GtY', available:1, unit_type:'unidad' },
    { id:13, code:'HAM-BBQ-001', category_id:3,  name:'Hamburguesa BBQ Caramelizada',            description:'Medallón 150g, cebolla caramelizada, salsa BBQ ahumada y cheddar.',                    price:10800, image_url:'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=500', video_url:'https://www.youtube.com/watch?v=Z_3kN6aBdNk', available:1, unit_type:'unidad' },
    { id:14, code:'HAM-CRI-001', category_id:3,  name:'Hamburguesa Crispy de Pollo',             description:'Pechuga de pollo empanada crocante, lechuga, tomate y mayo de ajo.',                   price:9775,  image_url:'https://images.unsplash.com/photo-1562802378-063ec186a863?w=500', video_url:'https://www.youtube.com/watch?v=3AOJUuSGplI', available:1, unit_type:'unidad' },
    { id:15, code:'HAM-HUE-001', category_id:3,  name:'Hamburguesa con Huevo Frito y Jamón',     description:'Medallón 150g, huevo frito, jamón cocido, queso y condimentos.',                       price:9900,  image_url:'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=500', video_url:'https://www.youtube.com/results?search_query=hamburguesa+con+huevo+receta', available:1, unit_type:'unidad' },
    { id:16, code:'HAM-TRI-001', category_id:3,  name:'Hamburguesa Triple Especial de la Casa',  description:'Triple medallón 100g c/u, cheddar, bacon, cebolla crispy y salsa especial.',           price:14025, image_url:'https://images.unsplash.com/photo-1607013251379-e6eecfffe234?w=500', video_url:'https://www.youtube.com/watch?v=PBj0e0s3tFg', available:1, unit_type:'unidad' },
    // 🥩 LOMOS
    { id:17, code:'LOM-COM-001', category_id:8,  name:'Lomito Completo al Pan',                  description:'Lomo vacuno tierno, lechuga, tomate, jamón, queso, huevo frito y papas.',              price:13050, image_url:'https://images.unsplash.com/photo-1481070555726-e2fe8357725c?w=500', video_url:'https://www.youtube.com/watch?v=FP0X6IQoRwE', available:1, unit_type:'unidad' },
    { id:18, code:'LOM-NAP-001', category_id:8,  name:'Lomito Napolitano',                       description:'Lomo al pan con salsa de tomate, muzzarella gratinada y orégano.',                     price:13950, image_url:'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=500', video_url:'https://www.youtube.com/results?search_query=lomito+napolitano+receta', available:1, unit_type:'unidad' },
    { id:19, code:'LOM-VER-001', category_id:8,  name:'Lomito al Verdeo con Champiñones',        description:'Lomo vacuno con salsa de cebollita de verdeo, champiñones salteados y queso.',         price:14400, image_url:'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500', video_url:'https://www.youtube.com/results?search_query=lomito+verdeo+champinones', available:1, unit_type:'unidad' },
    { id:20, code:'LOM-ESP-001', category_id:8,  name:'Lomito Especial con Panceta y Cheddar',   description:'Lomo, panceta crocante, queso cheddar, cebolla crispy y BBQ.',                         price:14450, image_url:'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500', video_url:'https://www.youtube.com/results?search_query=lomito+especial+argentina', available:1, unit_type:'unidad' },
    // 🥪 MILANESAS SÁNDWICH
    { id:21, code:'MIL-VAC-001', category_id:9,  name:'Sándwich de Milanesa de Carne Vacuna Completo', description:'Milanesa de carne, lechuga, tomate, jamón, queso y huevo frito.',           price:11250, image_url:'https://images.unsplash.com/photo-1550547660-d9450f859349?w=500', video_url:'https://www.youtube.com/watch?v=l3KJZ8smGIE', available:1, unit_type:'unidad' },
    { id:22, code:'MIL-POL-001', category_id:9,  name:'Sándwich de Milanesa de Pollo Completo',  description:'Milanesa de pechuga de pollo, lechuga, tomate, mayo de ajo y queso.',                 price:10800, image_url:'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=500', video_url:'https://www.youtube.com/results?search_query=sanduche+milanesa+pollo+receta', available:1, unit_type:'unidad' },
    { id:23, code:'MIL-CER-001', category_id:9,  name:'Sándwich de Milanesa de Cerdo Completo',  description:'Milanesa de cerdo jugosa, lechuga, tomate, mostaza y queso.',                          price:10350, image_url:'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=500', video_url:'https://www.youtube.com/results?search_query=milanesa+cerdo+sanduche', available:1, unit_type:'unidad' },
    { id:24, code:'MIL-NAP-001', category_id:9,  name:'Sándwich de Milanesa Napolitana',          description:'Milanesa al pan con salsa de tomate, jamón, muzzarella y orégano.',                   price:12600, image_url:'https://images.unsplash.com/photo-1544025162-d76694265947?w=500', video_url:'https://www.youtube.com/watch?v=E_QQQeHa0tg', available:1, unit_type:'unidad' },
    // 🍳 MINUTAS
    { id:25, code:'MIN-VAC-001', category_id:2,  name:'Milanesa de Carne Vacuna con Papas Fritas', description:'Milanesa grande de nalga rebozada, papas fritas crocantes.',                        price:14850, image_url:'https://images.unsplash.com/photo-1544025162-d76694265947?w=500', video_url:'https://www.youtube.com/watch?v=PgWy1Ylh5Us', available:1, unit_type:'unidad' },
    { id:26, code:'MIN-CAB-001', category_id:2,  name:'Milanesa de Carne Vacuna a Caballo',       description:'Milanesa de carne con dos huevos fritos encima y papas fritas.',                      price:16200, image_url:'https://images.unsplash.com/photo-1559847844-5315695dadae?w=500', video_url:'https://www.youtube.com/watch?v=EH0WLBJSwKo', available:1, unit_type:'unidad' },
    { id:27, code:'MIN-NAP-001', category_id:2,  name:'Milanesa Napolitana con Papas Fritas',     description:'Milanesa cubierta con salsa de tomate, jamón, muzzarella y orégano.',                 price:17100, image_url:'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=500', video_url:'https://www.youtube.com/watch?v=UoYmgMO-ZZE', available:1, unit_type:'unidad' },
    { id:28, code:'MIN-POL-001', category_id:2,  name:'Milanesa de Pollo con Papas Fritas',       description:'Pechuga de pollo empanada, papas fritas y ensalada mixta.',                           price:13950, image_url:'https://images.unsplash.com/photo-1619221882220-947b3d3c8861?w=500', video_url:'https://www.youtube.com/results?search_query=milanesa+pollo+papas+fritas', available:1, unit_type:'unidad' },
    { id:29, code:'MIN-CER-001', category_id:2,  name:'Milanesa de Cerdo con Papas Fritas',       description:'Milanesa de cerdo dorada, papas fritas y limón.',                                     price:13500, image_url:'https://images.unsplash.com/photo-1580476262798-bddd9f4b7369?w=500', video_url:'https://www.youtube.com/results?search_query=milanesa+cerdo+papas', available:1, unit_type:'unidad' },
    { id:30, code:'MIN-LOM-001', category_id:2,  name:'Bife de Lomo a la Plancha con Papas',      description:'Bife de lomo vacuno a la plancha jugoso, papas fritas y ensalada.',                   price:19800, image_url:'https://images.unsplash.com/photo-1529694157872-4e0c0f3b238b?w=500', video_url:'https://www.youtube.com/results?search_query=bife+lomo+plancha+argentina', available:1, unit_type:'unidad' },
    { id:31, code:'MIN-CHO-001', category_id:2,  name:'Bife de Chorizo con Papas y Ensalada',     description:'Bife de chorizo tierno a la plancha, papas fritas y ensalada completa.',              price:21600, image_url:'https://images.unsplash.com/photo-1594041680534-e8c8cdebd659?w=500', video_url:'https://www.youtube.com/results?search_query=bife+chorizo+plancha', available:1, unit_type:'unidad' },
    { id:32, code:'MIN-GRA-001', category_id:2,  name:'Revuelto Gramajo',                          description:'Huevos revueltos con papas paja crocantes, jamón y arvejas.',                        price:10800, image_url:'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=500', video_url:'https://www.youtube.com/watch?v=AigjjS0NLGI', available:1, unit_type:'unidad' },
    // 🥟 EMPANADAS
    { id:33, code:'EMP-CUC-001', category_id:5,  name:'Empanada de Carne Cortada a Cuchillo',     description:'Carne vacuna picada a cuchillo, cebolla, huevo duro y aceitunas.',                    price:2800,  image_url:'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500', video_url:'https://www.youtube.com/watch?v=hGkbgJFH0qA', available:1, unit_type:'unidad' },
    { id:34, code:'EMP-MOL-001', category_id:5,  name:'Empanada de Carne Molida Vacuna (Huevo, Morrón y Cebolla)', description:'Carne molida vacuna, cebolla, morrón, huevo duro y condimentos.', price:2600, image_url:'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500', video_url:'https://www.youtube.com/watch?v=hGkbgJFH0qA', available:1, unit_type:'unidad' },
    { id:35, code:'EMP-POL-001', category_id:5,  name:'Empanada de Pollo con Verduras',           description:'Pollo desmenuzado con cebolla, morrón, aceitunas y especias.',                        price:2700,  image_url:'https://images.unsplash.com/photo-1607198179219-d0b74484b2de?w=500', video_url:'https://www.youtube.com/watch?v=cxK4VCfOBV4', available:1, unit_type:'unidad' },
    { id:36, code:'EMP-BON-001', category_id:5,  name:'Empanada de Bondiolita de Cerdo',          description:'Bondiolita de cerdo desmenuzada, cebolla y especias criollas.',                       price:3000,  image_url:'https://images.unsplash.com/photo-1571167530149-c1105da4c2c0?w=500', video_url:'https://www.youtube.com/results?search_query=empanada+bondiolita+cerdo', available:1, unit_type:'unidad' },
    { id:37, code:'EMP-JYQ-001', category_id:5,  name:'Empanada de Jamón y Queso',                description:'Jamón cocido seleccionado y queso tirante cremoso.',                                   price:2500,  image_url:'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500', video_url:'https://www.youtube.com/results?search_query=empanada+jamon+queso+receta', available:1, unit_type:'unidad' },
    { id:38, code:'EMP-CAP-001', category_id:5,  name:'Empanada Caprese (Tomate y Mozzarella)',   description:'Tomate fresco, muzzarella, albahaca y aceite de oliva.',                               price:2600,  image_url:'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500', video_url:'https://www.youtube.com/results?search_query=empanada+caprese+italiana', available:1, unit_type:'unidad' },
    { id:39, code:'EMP-ROQ-001', category_id:5,  name:'Empanada de Roquefort y Cebolla',          description:'Queso roquefort cremoso con cebolla caramelizada.',                                    price:2900,  image_url:'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=500', video_url:'https://www.youtube.com/results?search_query=empanada+roquefort+cebolla', available:1, unit_type:'unidad' },
    { id:40, code:'EMP-CHO-001', category_id:5,  name:'Empanada de Choclo y Queso',               description:'Choclo cremoso, queso fresco y una pizca de azúcar.',                                 price:2500,  image_url:'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?w=500', video_url:'https://www.youtube.com/results?search_query=empanada+choclo+queso', available:1, unit_type:'unidad' },
    { id:41, code:'EMP-ESP-001', category_id:5,  name:'Empanada de Verdura (Espinaca y Ricotta)', description:'Espinaca salteada, ricotta, nuez moscada y queso rallado.',                           price:2500,  image_url:'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=500', video_url:'https://www.youtube.com/results?search_query=empanada+espinaca+ricotta', available:1, unit_type:'unidad' },
    { id:42, code:'EMP-HUM-001', category_id:5,  name:'Empanada de Humita',                       description:'Maíz cremoso tradicional con leche, cebolla y queso.',                                price:2500,  image_url:'https://images.unsplash.com/photo-1624374055843-f30d553e6b37?w=500', video_url:'https://www.youtube.com/watch?v=kOPgG_VpqHw', available:1, unit_type:'unidad' },
    { id:43, code:'EMP-ATU-001', category_id:5,  name:'Empanada de Atún',                          description:'Atún en aceite, cebolla, aceitunas y huevo duro.',                                    price:2700,  image_url:'https://images.unsplash.com/photo-1563612116625-3012372fccce?w=500', video_url:'https://www.youtube.com/results?search_query=empanada+atun+receta', available:1, unit_type:'unidad' },
    { id:44, code:'EMP-DOC-001', category_id:5,  name:'Docena de Empanadas Mixtas',               description:'Docena de empanadas a elección (carne, pollo, jamón y queso, etc.).',                price:23800, image_url:'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500', video_url:'https://www.youtube.com/results?search_query=empanadas+surtidas+argentina', available:1, unit_type:'unidad' },
    // 🥗 GUARNICIONES
    { id:45, code:'GUA-PAP-001', category_id:10, name:'Porción de Papas Fritas Simples',           description:'Papas frescas cortadas y fritas en aceite de girasol, con sal.',                      price:4500,  image_url:'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500', video_url:'https://www.youtube.com/results?search_query=papas+fritas+perfectas+receta', available:1, unit_type:'unidad' },
    { id:46, code:'GUA-CHE-001', category_id:10, name:'Porción de Papas Fritas Cheddar & Bacon',   description:'Papas crocantes bañadas en salsa cheddar caliente y panceta crocante.',               price:5850,  image_url:'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500', video_url:'https://www.youtube.com/results?search_query=papas+loaded+cheddar+bacon', available:1, unit_type:'unidad' },
    { id:47, code:'GUA-RUS-001', category_id:10, name:'Papas Rústicas al Horno con Hierbas',       description:'Papas en gajos con romero, ajo, pimentón y aceite de oliva.',                         price:5500,  image_url:'https://images.unsplash.com/photo-1518013431117-eb1465fa5752?w=500', video_url:'https://www.youtube.com/results?search_query=papas+rusticas+horno', available:1, unit_type:'unidad' },
    { id:48, code:'GUA-PUR-001', category_id:10, name:'Puré de Papas Cremoso',                     description:'Puré casero con manteca, leche caliente y nuez moscada.',                             price:4000,  image_url:'https://images.unsplash.com/photo-1574484284002-952d92456975?w=500', video_url:'https://www.youtube.com/results?search_query=pure+papas+cremoso+receta', available:1, unit_type:'unidad' },
    { id:49, code:'GUA-ENS-001', category_id:10, name:'Ensalada Mixta (Lechuga y Tomate)',          description:'Lechuga, tomate, cebolla morada y aderezo a elección.',                               price:4000,  image_url:'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500', video_url:'https://www.youtube.com/results?search_query=ensalada+mixta+basica', available:1, unit_type:'unidad' },
    { id:50, code:'GUA-ECH-001', category_id:10, name:'Ensalada Completa del Chef',                 description:'Lechuga, tomate, zanahoria, huevo duro, aceitunas y choclo.',                         price:6000,  image_url:'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500', video_url:'https://www.youtube.com/results?search_query=ensalada+completa+chef', available:1, unit_type:'unidad' },
    { id:51, code:'GUA-ARR-001', category_id:10, name:'Arroz Blanco Mantequillado',                 description:'Arroz largo fino, manteca, sal y hierbas frescas.',                                   price:3500,  image_url:'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500', video_url:'https://www.youtube.com/results?search_query=arroz+blanco+perfecto', available:1, unit_type:'unidad' },
    // 🥪 SÁNDWICHES ESPECIALES
    { id:52, code:'SAN-TOS-001', category_id:11, name:'Tostado Mixto Jamón y Queso (Pan de Miga)', description:'Pan de miga tostado, jamón cocido y queso cremoso derretido.',                       price:4500,  image_url:'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=500', video_url:'https://www.youtube.com/results?search_query=tostado+miga+jamon+queso', available:1, unit_type:'unidad' },
    { id:53, code:'SAN-TRI-001', category_id:11, name:'Sándwich Triple de Pan de Miga',            description:'Triple de jamón, queso, tomate, lechuga y huevo duro en pan de miga.',               price:6500,  image_url:'https://images.unsplash.com/photo-1622542796254-5b9c46ab0d2f?w=500', video_url:'https://www.youtube.com/results?search_query=sandwich+triple+miga', available:1, unit_type:'unidad' },
    { id:54, code:'SAN-CLU-001', category_id:11, name:'Club Sándwich de Pollo',                    description:'Pollo a la plancha, bacon, lechuga, tomate, queso y mayo.',                           price:7650,  image_url:'https://images.unsplash.com/photo-1567234669003-dce7a7a88821?w=500', video_url:'https://www.youtube.com/watch?v=kWEJCA5b3-E', available:1, unit_type:'unidad' },
    { id:55, code:'SAN-MED-001', category_id:11, name:'Medialunas con Jamón y Queso (x2)',         description:'Dos medialunas de manteca rellenas con jamón y queso brie.',                          price:5500,  image_url:'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500', video_url:'https://www.youtube.com/results?search_query=medialunas+jamon+queso', available:1, unit_type:'unidad' },
    { id:56, code:'SAN-ENR-001', category_id:11, name:'Sándwich Enrollado de Pan de Miga',         description:'Pan de miga enrollado con queso crema, jamón, lechuga y zanahoria.',                  price:5000,  image_url:'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=500', video_url:'https://www.youtube.com/results?search_query=sandwich+enrollado+miga', available:1, unit_type:'unidad' },
    // ☕ CAFETERÍA
    { id:57, code:'CAF-ESP-001', category_id:7,  name:'Café Espresso',                             description:'Café espresso intenso servido en taza pequeña.',                                      price:2000,  image_url:'https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?w=500', video_url:'https://www.youtube.com/watch?v=xHrc-BQwHOo', available:1, unit_type:'unidad' },
    { id:58, code:'CAF-CLO-001', category_id:7,  name:'Café con Leche',                            description:'Espresso con leche caliente o fría al gusto (250cc).',                               price:2800,  image_url:'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=500', video_url:'https://www.youtube.com/results?search_query=cafe+con+leche+perfecto', available:1, unit_type:'unidad' },
    { id:59, code:'CAF-COR-001', category_id:7,  name:'Cortado',                                   description:'Espresso con un toque de leche caliente vaporizada.',                                 price:2200,  image_url:'https://images.unsplash.com/photo-1515442261605-65987783cb6a?w=500', video_url:'https://www.youtube.com/results?search_query=cortado+cafe+receta', available:1, unit_type:'unidad' },
    { id:60, code:'CAF-CAP-001', category_id:7,  name:'Capuchino',                                 description:'Espresso, leche vaporizada y espuma de leche cremosa.',                              price:3500,  image_url:'https://images.unsplash.com/photo-1534778101976-62847782c213?w=500', video_url:'https://www.youtube.com/watch?v=9f8mOfkFzQM', available:1, unit_type:'unidad' },
    { id:61, code:'CAF-TE-001',  category_id:7,  name:'Té (Limón, Menta o Frutos Rojos)',          description:'Té en saquito a elección servido con limón o leche.',                                price:1800,  image_url:'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500', video_url:'https://www.youtube.com/results?search_query=te+infusion+preparacion', available:1, unit_type:'unidad' },
    { id:62, code:'CAF-MAT-001', category_id:7,  name:'Mate Cocido con Leche',                     description:'Mate cocido tradicional con leche caliente y azúcar.',                               price:1800,  image_url:'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=500', video_url:'https://www.youtube.com/results?search_query=mate+cocido+leche', available:1, unit_type:'unidad' },
    { id:63, code:'CAF-CHO-001', category_id:7,  name:'Chocolate Caliente',                        description:'Chocolate artesanal espeso servido con crema y cacao en polvo.',                     price:3200,  image_url:'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=500', video_url:'https://www.youtube.com/results?search_query=chocolate+caliente+espeso', available:1, unit_type:'unidad' },
    { id:64, code:'CAF-AME-001', category_id:7,  name:'Café Americano (Grande)',                   description:'Espresso alargado con agua caliente (300cc), suave y aromático.',                    price:2500,  image_url:'https://images.unsplash.com/photo-1497515114629-f71d768fd07c?w=500', video_url:'https://www.youtube.com/results?search_query=cafe+americano+preparacion', available:1, unit_type:'unidad' },
    // 🫔 COMBOS CAFETERÍA
    { id:65, code:'COM-CHI-001', category_id:12, name:'Combo: Café + Chipá (x2)',                  description:'Café espresso o con leche acompañado de 2 chipás calientes.',                        price:4080,  image_url:'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500', video_url:'https://www.youtube.com/results?search_query=chipa+cafe+desayuno+misionero', available:1, unit_type:'unidad' },
    { id:66, code:'COM-FAC-001', category_id:12, name:'Combo: Café + Factura (Medialuna)',          description:'Café a elección con medialuna de manteca o grasa.',                                  price:3825,  image_url:'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500', video_url:'https://www.youtube.com/results?search_query=medialunas+manteca+argentina', available:1, unit_type:'unidad' },
    { id:67, code:'COM-TOS-001', category_id:12, name:'Combo: Café con Leche + Tostado',           description:'Café con leche grande y tostado mixto de jamón y queso.',                            price:5950,  image_url:'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500', video_url:'https://www.youtube.com/results?search_query=desayuno+cafe+tostado+argentina', available:1, unit_type:'unidad' },
    { id:68, code:'COM-TEC-001', category_id:12, name:'Combo: Té + Chipás (x3)',                   description:'Té a elección con tres chipás recién salidos del horno.',                             price:4080,  image_url:'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500', video_url:'https://www.youtube.com/results?search_query=chipa+te+merienda', available:1, unit_type:'unidad' },
    { id:69, code:'COM-CAP-001', category_id:12, name:'Combo: Capuchino + Croissant de Manteca',   description:'Capuchino cremoso con croissant de manteca artesanal.',                               price:5525,  image_url:'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500', video_url:'https://www.youtube.com/results?search_query=capuchino+croissant+desayuno', available:1, unit_type:'unidad' },
    // 🧇 CHIPÁS Y PANIFICADOS
    { id:70, code:'PAN-CHI-001', category_id:13, name:'Chipá (Unidad)',                            description:'Rosquita de harina de mandioca y queso, recién horneada.',                           price:1200,  image_url:'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500', video_url:'https://www.youtube.com/watch?v=AvV5UhMTLMY', available:1, unit_type:'unidad' },
    { id:71, code:'PAN-CHD-001', category_id:13, name:'Chipás (Docena)',                           description:'Docena de chipás artesanales de queso, recién horneadas.',                           price:10800, image_url:'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500', video_url:'https://www.youtube.com/watch?v=AvV5UhMTLMY', available:1, unit_type:'unidad' },
    { id:72, code:'PAN-MAN-001', category_id:13, name:'Medialuna de Manteca',                      description:'Medialuna artesanal de manteca, dorada y hojaldrada.',                               price:1800,  image_url:'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500', video_url:'https://www.youtube.com/watch?v=A_tLLv1GKKU', available:1, unit_type:'unidad' },
    { id:73, code:'PAN-GRA-001', category_id:13, name:'Medialuna de Grasa',                        description:'Medialuna de grasa tradicional, suave y sabrosa.',                                   price:1600,  image_url:'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500', video_url:'https://www.youtube.com/results?search_query=medialunas+grasa+argentina', available:1, unit_type:'unidad' },
    { id:74, code:'PAN-FAC-001', category_id:13, name:'Facturas Variadas (x3)',                    description:'Tres facturas a elección: vigilante, bomba, berlinesa o cañón.',                    price:5500,  image_url:'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500', video_url:'https://www.youtube.com/results?search_query=facturas+argentinas+panaderia', available:1, unit_type:'unidad' },
    { id:75, code:'PAN-CRO-001', category_id:13, name:'Croissant de Manteca con Mermelada',        description:'Croissant artesanal de manteca servido con mermelada de ciruela.',                   price:3500,  image_url:'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500', video_url:'https://www.youtube.com/results?search_query=croissant+manteca+casero', available:1, unit_type:'unidad' },
    // 🥤 LICUADOS
    { id:76, code:'LIC-BAN-001', category_id:14, name:'Licuado de Banana (500cc)',                 description:'Banana fresca, leche entera, azúcar y una pizca de vainilla.',                       price:4500,  image_url:'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500', video_url:'https://www.youtube.com/results?search_query=licuado+banana+leche+casero', available:1, unit_type:'unidad' },
    { id:77, code:'LIC-FRU-001', category_id:14, name:'Licuado de Frutilla (500cc)',               description:'Frutillas frescas de temporada, leche y azúcar al gusto.',                          price:4800,  image_url:'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500', video_url:'https://www.youtube.com/results?search_query=licuado+frutilla+casero', available:1, unit_type:'unidad' },
    { id:78, code:'LIC-MAN-001', category_id:14, name:'Licuado de Mango y Maracuyá (500cc)',       description:'Mango maduro con maracuyá, leche y jugo de naranja.',                                price:5200,  image_url:'https://images.unsplash.com/photo-1622597467836-f3e6a1bf90fd?w=500', video_url:'https://www.youtube.com/results?search_query=licuado+mango+maracuya', available:1, unit_type:'unidad' },
    { id:79, code:'LIC-DUR-001', category_id:14, name:'Licuado de Durazno (500cc)',                description:'Durazno en almíbar o fresco, leche y azúcar.',                                       price:4500,  image_url:'https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=500', video_url:'https://www.youtube.com/results?search_query=licuado+durazno+receta', available:1, unit_type:'unidad' },
    { id:80, code:'LIC-MIX-001', category_id:14, name:'Licuado de Frutas Mixtas (500cc)',          description:'Combinación de frutas de temporada, leche y miel.',                                  price:5000,  image_url:'https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=500', video_url:'https://www.youtube.com/results?search_query=licuado+frutas+mixtas', available:1, unit_type:'unidad' },
    // 🍺 BEBIDAS Y TRAGOS
    { id:81, code:'BEB-COC-001', category_id:6,  name:'Coca Cola 1.5L',                            description:'Botella 1.5 Litros bien fría.',                                                       price:3500,  image_url:'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500', video_url:'https://www.youtube.com/results?search_query=coca+cola+botella', available:1, unit_type:'unidad' },
    { id:82, code:'BEB-C5L-001', category_id:6,  name:'Coca Cola 500ml',                           description:'Botella personal 500ml bien fría.',                                                   price:2000,  image_url:'https://images.unsplash.com/photo-1559839914-17aae19cec71?w=500', video_url:'https://www.youtube.com/results?search_query=coca+cola+personal', available:1, unit_type:'unidad' },
    { id:83, code:'BEB-AGU-001', category_id:6,  name:'Agua Mineral sin Gas 500ml',                description:'Agua mineral natural sin gas, bien fría.',                                            price:1500,  image_url:'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=500', video_url:'https://www.youtube.com/results?search_query=agua+mineral+natural', available:1, unit_type:'unidad' },
    { id:84, code:'BEB-JUG-001', category_id:6,  name:'Jugo de Naranja Natural (400cc)',           description:'Naranjas exprimidas al momento, fresco y vitamínico.',                                price:3500,  image_url:'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=500', video_url:'https://www.youtube.com/results?search_query=jugo+naranja+natural+exprimido', available:1, unit_type:'unidad' },
    { id:85, code:'BEB-GAS-001', category_id:6,  name:'Gaseosa Variada 500ml (Fanta/Sprite/7UP)',  description:'Gaseosa en botella personal a elección, bien fría.',                                  price:2000,  image_url:'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500', video_url:'https://www.youtube.com/results?search_query=gaseosa+variada+argentina', available:1, unit_type:'unidad' },
    { id:86, code:'BEB-CER-001', category_id:6,  name:'Cerveza Lata 473ml',                        description:'Lata de cerveza rubia 473ml, bien fría.',                                             price:3500,  image_url:'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=500', video_url:'https://www.youtube.com/results?search_query=cerveza+lata+fria', available:1, unit_type:'unidad' },
    { id:87, code:'BEB-IPA-001', category_id:6,  name:'Cerveza Artesanal IPA 473ml',               description:'Cerveza artesanal India Pale Ale, bien fría y aromática.',                           price:4500,  image_url:'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=500', video_url:'https://www.youtube.com/results?search_query=cerveza+artesanal+IPA', available:1, unit_type:'unidad' },
    { id:88, code:'BEB-FER-001', category_id:6,  name:'Fernet con Coca (Copa)',                    description:'Fernet Branca con Coca Cola, hielo y rodaja de limón.',                              price:5500,  image_url:'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=500', video_url:'https://www.youtube.com/results?search_query=fernet+con+coca+argentina', available:1, unit_type:'unidad' },
    { id:89, code:'BEB-APE-001', category_id:6,  name:'Aperol Spritz',                             description:'Aperol, prosecco y agua con gas, servido con rodaja de naranja.',                    price:7500,  image_url:'https://images.unsplash.com/photo-1558642891-54be180ea339?w=500', video_url:'https://www.youtube.com/watch?v=1tBegk9YfnM', available:1, unit_type:'unidad' },
    { id:90, code:'BEB-TON-001', category_id:6,  name:'Agua Tónica con Limón',                     description:'Agua tónica, jugo de limón fresco y hielo.',                                         price:3000,  image_url:'https://images.unsplash.com/photo-1560508179-b2c9a3555b3e?w=500', video_url:'https://www.youtube.com/results?search_query=agua+tonica+limon+trago', available:1, unit_type:'unidad' }
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
