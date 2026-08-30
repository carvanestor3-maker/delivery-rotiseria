// generar_menu.js
// Genera un Excel completo con el menú de la rotisería
// Ejecutar con: node generar_menu.js

const XLSX = require('xlsx');
const path = require('path');

const FECHA_CREACION = '29/08/2026';

// ─── DATOS DEL MENÚ ──────────────────────────────────────────────────────────
const productos = [

  // ═══════════════════════════════════════════════════════════
  //  🍕 PIZZAS
  // ═══════════════════════════════════════════════════════════
  {
    rubro: '🍕 Pizzas',
    nombre: 'Pizza Muzzarella Especial (Grande)',
    descripcion: 'Salsa de tomate casera, 300g muzzarella, aceitunas y orégano.',
    precio: 28000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500',
    video: 'https://www.youtube.com/watch?v=UoYmgMO-ZZE',
  },
  {
    rubro: '🍕 Pizzas',
    nombre: 'Pizza Napolitana (Grande)',
    descripcion: 'Muzzarella, tomate en rodajas, ajo y albahaca fresca.',
    precio: 31000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500',
    video: 'https://www.youtube.com/watch?v=l3KJZ8smGIE',
  },
  {
    rubro: '🍕 Pizzas',
    nombre: 'Pizza Fugazzeta Rellena (Grande)',
    descripcion: 'Doble masa rellena de muzzarella y cebolla caramelizada encima.',
    precio: 34000,
    descuento_pct: 15,
    foto: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500',
    video: 'https://www.youtube.com/watch?v=mGjx1KpRxM4',
  },
  {
    rubro: '🍕 Pizzas',
    nombre: 'Pizza Calabresa con Pimiento (Grande)',
    descripcion: 'Salami calabresa, morrón rojo y verde, aceitunas negras.',
    precio: 33000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=500',
    video: 'https://www.youtube.com/watch?v=G-XZhKOKBJ0',
  },
  {
    rubro: '🍕 Pizzas',
    nombre: 'Pizza Cuatro Quesos (Grande)',
    descripcion: 'Muzzarella, roquefort, parmesano y provolone gratinados.',
    precio: 36000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1528137871618-79d2761e3fd5?w=500',
    video: 'https://www.youtube.com/watch?v=8g_WXWF3HoE',
  },
  {
    rubro: '🍕 Pizzas',
    nombre: 'Pizza Especial (Jamón, Morrón y Huevo)',
    descripcion: 'Jamón cocido, morrón asado, huevo, muzzarella y salsa.',
    precio: 35000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1590947132387-155cc02f3212?w=500',
    video: 'https://www.youtube.com/watch?v=W5hBVUFlwAY',
  },
  {
    rubro: '🍕 Pizzas',
    nombre: 'Pizza Pollo & BBQ (Grande)',
    descripcion: 'Pollo desmenuzado, salsa BBQ ahumada, cebolla morada y muzzarella.',
    precio: 37000,
    descuento_pct: 15,
    foto: 'https://images.unsplash.com/photo-1601924582970-9238bcb495d6?w=500',
    video: 'https://www.youtube.com/watch?v=7_b2LRv1h68',
  },
  {
    rubro: '🍕 Pizzas',
    nombre: 'Pizza Verdura (Espinaca y Ricotta)',
    descripcion: 'Espinaca salteada, ricotta cremosa, ajo y muzzarella gratinada.',
    precio: 30000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1604917877934-07d8d248d396?w=500',
    video: 'https://www.youtube.com/watch?v=3KZpRK7lBag',
  },
  {
    rubro: '🍕 Pizzas',
    nombre: 'Porción de Pizza (2 porciones)',
    descripcion: 'Porción doble de pizza del día (consultar disponibilidad).',
    precio: 8500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=500',
    video: 'https://www.youtube.com/results?search_query=pizza+porcion+argentina',
  },
  {
    rubro: '🍕 Pizzas',
    nombre: 'Fainá (Grande)',
    descripcion: 'Torta de harina de garbanzo al horno, dorada y crocante.',
    precio: 7500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1624374055843-f30d553e6b37?w=500',
    video: 'https://www.youtube.com/watch?v=kOPgG_VpqHw',
  },

  // ═══════════════════════════════════════════════════════════
  //  🍔 HAMBURGUESAS
  // ═══════════════════════════════════════════════════════════
  {
    rubro: '🍔 Hamburguesas',
    nombre: 'Hamburguesa Clásica con Papas',
    descripcion: 'Medallón 150g, lechuga, tomate, cebolla, ketchup y mayonesa.',
    precio: 9500,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500',
    video: 'https://www.youtube.com/watch?v=hRLqRzFRQXU',
  },
  {
    rubro: '🍔 Hamburguesas',
    nombre: 'Hamburguesa Doble Cheddar & Bacon',
    descripcion: 'Doble medallón 120g c/u, cheddar fundido, panceta crocante y salsa de la casa.',
    precio: 13500,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=500',
    video: 'https://www.youtube.com/watch?v=7cfHbvw3GtY',
  },
  {
    rubro: '🍔 Hamburguesas',
    nombre: 'Hamburguesa BBQ Caramelizada',
    descripcion: 'Medallón 150g, cebolla caramelizada, salsa BBQ ahumada y cheddar.',
    precio: 12000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=500',
    video: 'https://www.youtube.com/watch?v=Z_3kN6aBdNk',
  },
  {
    rubro: '🍔 Hamburguesas',
    nombre: 'Hamburguesa Crispy de Pollo',
    descripcion: 'Pechuga de pollo empanada crocante, lechuga, tomate y mayo de ajo.',
    precio: 11500,
    descuento_pct: 15,
    foto: 'https://images.unsplash.com/photo-1562802378-063ec186a863?w=500',
    video: 'https://www.youtube.com/watch?v=3AOJUuSGplI',
  },
  {
    rubro: '🍔 Hamburguesas',
    nombre: 'Hamburguesa con Huevo Frito y Jamón',
    descripcion: 'Medallón 150g, huevo frito, jamón cocido, queso y condimentos.',
    precio: 11000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=500',
    video: 'https://www.youtube.com/results?search_query=hamburguesa+con+huevo+receta',
  },
  {
    rubro: '🍔 Hamburguesas',
    nombre: 'Hamburguesa Triple Especial de la Casa',
    descripcion: 'Triple medallón 100g c/u, cheddar, bacon, cebolla crispy y salsa especial.',
    precio: 16500,
    descuento_pct: 15,
    foto: 'https://images.unsplash.com/photo-1607013251379-e6eecfffe234?w=500',
    video: 'https://www.youtube.com/watch?v=PBj0e0s3tFg',
  },

  // ═══════════════════════════════════════════════════════════
  //  🥩 SÁNDWICHES DE LOMO
  // ═══════════════════════════════════════════════════════════
  {
    rubro: '🥩 Sándwiches de Lomo',
    nombre: 'Lomito Completo al Pan',
    descripcion: 'Lomo vacuno tierno, lechuga, tomate, jamón, queso, huevo frito y papas.',
    precio: 14500,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1481070555726-e2fe8357725c?w=500',
    video: 'https://www.youtube.com/watch?v=FP0X6IQoRwE',
  },
  {
    rubro: '🥩 Sándwiches de Lomo',
    nombre: 'Lomito Napolitano',
    descripcion: 'Lomo al pan con salsa de tomate, muzzarella gratinada y orégano.',
    precio: 15500,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=500',
    video: 'https://www.youtube.com/results?search_query=lomito+napolitano+receta',
  },
  {
    rubro: '🥩 Sándwiches de Lomo',
    nombre: 'Lomito al Verdeo con Champiñones',
    descripcion: 'Lomo vacuno con salsa de cebollita de verdeo, champiñones salteados y queso.',
    precio: 16000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500',
    video: 'https://www.youtube.com/results?search_query=lomito+verdeo+champinones',
  },
  {
    rubro: '🥩 Sándwiches de Lomo',
    nombre: 'Lomito Especial con Panceta y Cheddar',
    descripcion: 'Lomo, panceta crocante, queso cheddar, cebolla crispy y BBQ.',
    precio: 17000,
    descuento_pct: 15,
    foto: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500',
    video: 'https://www.youtube.com/results?search_query=lomito+especial+argentina',
  },

  // ═══════════════════════════════════════════════════════════
  //  🥩 SÁNDWICHES DE MILANESA
  // ═══════════════════════════════════════════════════════════
  {
    rubro: '🥩 Sándwiches de Milanesa',
    nombre: 'Sándwich de Milanesa de Carne Vacuna Completo',
    descripcion: 'Milanesa de carne, lechuga, tomate, jamón, queso y huevo frito.',
    precio: 12500,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=500',
    video: 'https://www.youtube.com/watch?v=l3KJZ8smGIE',
  },
  {
    rubro: '🥩 Sándwiches de Milanesa',
    nombre: 'Sándwich de Milanesa de Pollo Completo',
    descripcion: 'Milanesa de pechuga de pollo, lechuga, tomate, mayo de ajo y queso.',
    precio: 12000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=500',
    video: 'https://www.youtube.com/results?search_query=sanduche+milanesa+pollo+receta',
  },
  {
    rubro: '🥩 Sándwiches de Milanesa',
    nombre: 'Sándwich de Milanesa de Cerdo Completo',
    descripcion: 'Milanesa de cerdo jugosa, lechuga, tomate, mostaza y queso.',
    precio: 11500,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=500',
    video: 'https://www.youtube.com/results?search_query=milanesa+cerdo+sanduche',
  },
  {
    rubro: '🥩 Sándwiches de Milanesa',
    nombre: 'Sándwich de Milanesa Napolitana',
    descripcion: 'Milanesa al pan con salsa de tomate, jamón, muzzarella y orégano.',
    precio: 14000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500',
    video: 'https://www.youtube.com/watch?v=E_QQQeHa0tg',
  },

  // ═══════════════════════════════════════════════════════════
  //  🍳 MINUTAS
  // ═══════════════════════════════════════════════════════════
  {
    rubro: '🍳 Minutas',
    nombre: 'Milanesa de Carne Vacuna con Papas Fritas',
    descripcion: 'Milanesa grande de nalga rebozada, papas fritas crocantes.',
    precio: 16500,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500',
    video: 'https://www.youtube.com/watch?v=PgWy1Ylh5Us',
  },
  {
    rubro: '🍳 Minutas',
    nombre: 'Milanesa de Carne Vacuna a Caballo',
    descripcion: 'Milanesa de carne con dos huevos fritos encima y papas fritas.',
    precio: 18000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1559847844-5315695dadae?w=500',
    video: 'https://www.youtube.com/watch?v=EH0WLBJSwKo',
  },
  {
    rubro: '🍳 Minutas',
    nombre: 'Milanesa Napolitana con Papas Fritas',
    descripcion: 'Milanesa cubierta con salsa de tomate, jamón, muzzarella y orégano.',
    precio: 19000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=500',
    video: 'https://www.youtube.com/watch?v=UoYmgMO-ZZE',
  },
  {
    rubro: '🍳 Minutas',
    nombre: 'Milanesa de Pollo con Papas Fritas',
    descripcion: 'Pechuga de pollo empanada, papas fritas y ensalada mixta.',
    precio: 15500,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1619221882220-947b3d3c8861?w=500',
    video: 'https://www.youtube.com/results?search_query=milanesa+pollo+papas+fritas',
  },
  {
    rubro: '🍳 Minutas',
    nombre: 'Milanesa de Cerdo con Papas Fritas',
    descripcion: 'Milanesa de cerdo dorada, papas fritas y limón.',
    precio: 15000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1580476262798-bddd9f4b7369?w=500',
    video: 'https://www.youtube.com/results?search_query=milanesa+cerdo+papas',
  },
  {
    rubro: '🍳 Minutas',
    nombre: 'Bife de Lomo a la Plancha con Papas',
    descripcion: 'Bife de lomo vacuno a la plancha jugoso, papas fritas y ensalada.',
    precio: 22000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1529694157872-4e0c0f3b238b?w=500',
    video: 'https://www.youtube.com/results?search_query=bife+lomo+plancha+argentina',
  },
  {
    rubro: '🍳 Minutas',
    nombre: 'Bife de Chorizo con Papas y Ensalada',
    descripcion: 'Bife de chorizo tierno a la plancha, papas fritas y ensalada completa.',
    precio: 24000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1594041680534-e8c8cdebd659?w=500',
    video: 'https://www.youtube.com/results?search_query=bife+chorizo+plancha',
  },
  {
    rubro: '🍳 Minutas',
    nombre: 'Revuelto Gramajo',
    descripcion: 'Huevos revueltos con papas paja crocantes, jamón y arvejas.',
    precio: 12000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=500',
    video: 'https://www.youtube.com/watch?v=AigjjS0NLGI',
  },

  // ═══════════════════════════════════════════════════════════
  //  🥟 EMPANADAS
  // ═══════════════════════════════════════════════════════════
  {
    rubro: '🥟 Empanadas',
    nombre: 'Empanada de Carne Cortada a Cuchillo',
    descripcion: 'Carne vacuna picada a cuchillo, cebolla, huevo duro y aceitunas.',
    precio: 2800,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500',
    video: 'https://www.youtube.com/watch?v=hGkbgJFH0qA',
  },
  {
    rubro: '🥟 Empanadas',
    nombre: 'Empanada de Carne Molida Vacuna (Huevo, Morrón y Cebolla)',
    descripcion: 'Carne molida vacuna, cebolla, morrón, huevo duro y condimentos.',
    precio: 2600,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500',
    video: 'https://www.youtube.com/watch?v=hGkbgJFH0qA',
  },
  {
    rubro: '🥟 Empanadas',
    nombre: 'Empanada de Pollo con Verduras',
    descripcion: 'Pollo desmenuzado con cebolla, morrón, aceitunas y especias.',
    precio: 2700,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1607198179219-d0b74484b2de?w=500',
    video: 'https://www.youtube.com/watch?v=cxK4VCfOBV4',
  },
  {
    rubro: '🥟 Empanadas',
    nombre: 'Empanada de Bondiolita de Cerdo',
    descripcion: 'Bondiolita de cerdo desmenuzada, cebolla y especias criollas.',
    precio: 3000,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1571167530149-c1105da4c2c0?w=500',
    video: 'https://www.youtube.com/results?search_query=empanada+bondiolita+cerdo',
  },
  {
    rubro: '🥟 Empanadas',
    nombre: 'Empanada de Jamón y Queso',
    descripcion: 'Jamón cocido seleccionado y queso tirante cremoso.',
    precio: 2500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500',
    video: 'https://www.youtube.com/results?search_query=empanada+jamon+queso+receta',
  },
  {
    rubro: '🥟 Empanadas',
    nombre: 'Empanada Caprese (Tomate y Mozzarella)',
    descripcion: 'Tomate fresco, muzzarella, albahaca y aceite de oliva.',
    precio: 2600,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500',
    video: 'https://www.youtube.com/results?search_query=empanada+caprese+italiana',
  },
  {
    rubro: '🥟 Empanadas',
    nombre: 'Empanada de Roquefort y Cebolla',
    descripcion: 'Queso roquefort cremoso con cebolla caramelizada.',
    precio: 2900,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=500',
    video: 'https://www.youtube.com/results?search_query=empanada+roquefort+cebolla',
  },
  {
    rubro: '🥟 Empanadas',
    nombre: 'Empanada de Choclo y Queso',
    descripcion: 'Choclo cremoso, queso fresco y una pizca de azúcar.',
    precio: 2500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?w=500',
    video: 'https://www.youtube.com/results?search_query=empanada+choclo+queso',
  },
  {
    rubro: '🥟 Empanadas',
    nombre: 'Empanada de Verdura (Espinaca y Ricotta)',
    descripcion: 'Espinaca salteada, ricotta, nuez moscada y queso rallado.',
    precio: 2500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=500',
    video: 'https://www.youtube.com/results?search_query=empanada+espinaca+ricotta',
  },
  {
    rubro: '🥟 Empanadas',
    nombre: 'Empanada de Humita',
    descripcion: 'Maíz cremoso tradicional con leche, cebolla y queso.',
    precio: 2500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1624374055843-f30d553e6b37?w=500',
    video: 'https://www.youtube.com/watch?v=kOPgG_VpqHw',
  },
  {
    rubro: '🥟 Empanadas',
    nombre: 'Empanada de Atún',
    descripcion: 'Atún en aceite, cebolla, aceitunas y huevo duro.',
    precio: 2700,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1563612116625-3012372fccce?w=500',
    video: 'https://www.youtube.com/results?search_query=empanada+atun+receta',
  },
  {
    rubro: '🥟 Empanadas',
    nombre: 'Docena de Empanadas Mixtas',
    descripcion: 'Docena de empanadas a elección (carne, pollo, jamón y queso, etc.).',
    precio: 28000,
    descuento_pct: 15,
    foto: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500',
    video: 'https://www.youtube.com/results?search_query=empanadas+surtidas+argentina',
  },

  // ═══════════════════════════════════════════════════════════
  //  🥗 GUARNICIONES Y PORCIONES
  // ═══════════════════════════════════════════════════════════
  {
    rubro: '🥗 Guarniciones y Porciones',
    nombre: 'Porción de Papas Fritas Simples',
    descripcion: 'Papas frescas cortadas y fritas en aceite de girasol, con sal.',
    precio: 4500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500',
    video: 'https://www.youtube.com/results?search_query=papas+fritas+perfectas+receta',
  },
  {
    rubro: '🥗 Guarniciones y Porciones',
    nombre: 'Porción de Papas Fritas Cheddar & Bacon',
    descripcion: 'Papas crocantes bañadas en salsa cheddar caliente y panceta crocante.',
    precio: 6500,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500',
    video: 'https://www.youtube.com/results?search_query=papas+loaded+cheddar+bacon',
  },
  {
    rubro: '🥗 Guarniciones y Porciones',
    nombre: 'Papas Rústicas al Horno con Hierbas',
    descripcion: 'Papas en gajos con romero, ajo, pimentón y aceite de oliva.',
    precio: 5500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1518013431117-eb1465fa5752?w=500',
    video: 'https://www.youtube.com/results?search_query=papas+rusticas+horno',
  },
  {
    rubro: '🥗 Guarniciones y Porciones',
    nombre: 'Puré de Papas Cremoso',
    descripcion: 'Puré casero con manteca, leche caliente y nuez moscada.',
    precio: 4000,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=500',
    video: 'https://www.youtube.com/results?search_query=pure+papas+cremoso+receta',
  },
  {
    rubro: '🥗 Guarniciones y Porciones',
    nombre: 'Ensalada Mixta (Lechuga y Tomate)',
    descripcion: 'Lechuga, tomate, cebolla morada y aderezo a elección.',
    precio: 4000,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500',
    video: 'https://www.youtube.com/results?search_query=ensalada+mixta+basica',
  },
  {
    rubro: '🥗 Guarniciones y Porciones',
    nombre: 'Ensalada Completa del Chef',
    descripcion: 'Lechuga, tomate, zanahoria, huevo duro, aceitunas y choclo.',
    precio: 6000,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500',
    video: 'https://www.youtube.com/results?search_query=ensalada+completa+chef',
  },
  {
    rubro: '🥗 Guarniciones y Porciones',
    nombre: 'Arroz Blanco Mantequillado',
    descripcion: 'Arroz largo fino, manteca, sal y hierbas frescas.',
    precio: 3500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500',
    video: 'https://www.youtube.com/results?search_query=arroz+blanco+perfecto',
  },

  // ═══════════════════════════════════════════════════════════
  //  🥪 SÁNDWICHES ESPECIALES Y PAN DE MIGA
  // ═══════════════════════════════════════════════════════════
  {
    rubro: '🥪 Sándwiches Especiales / Pan de Miga',
    nombre: 'Tostado Mixto Jamón y Queso (Pan de Miga)',
    descripcion: 'Pan de miga tostado, jamón cocido y queso cremoso derretido.',
    precio: 4500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=500',
    video: 'https://www.youtube.com/results?search_query=tostado+miga+jamon+queso',
  },
  {
    rubro: '🥪 Sándwiches Especiales / Pan de Miga',
    nombre: 'Sándwich Triple de Pan de Miga',
    descripcion: 'Triple de jamón, queso, tomate, lechuga y huevo duro en pan de miga.',
    precio: 6500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1622542796254-5b9c46ab0d2f?w=500',
    video: 'https://www.youtube.com/results?search_query=sandwich+triple+miga',
  },
  {
    rubro: '🥪 Sándwiches Especiales / Pan de Miga',
    nombre: 'Club Sándwich de Pollo',
    descripcion: 'Pollo a la plancha, bacon, lechuga, tomate, queso y mayo.',
    precio: 8500,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1567234669003-dce7a7a88821?w=500',
    video: 'https://www.youtube.com/watch?v=kWEJCA5b3-E',
  },
  {
    rubro: '🥪 Sándwiches Especiales / Pan de Miga',
    nombre: 'Medialunas con Jamón y Queso (x2)',
    descripcion: 'Dos medialunas de manteca rellenas con jamón y queso brie.',
    precio: 5500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
    video: 'https://www.youtube.com/results?search_query=medialunas+jamon+queso',
  },
  {
    rubro: '🥪 Sándwiches Especiales / Pan de Miga',
    nombre: 'Sándwich Enrollado de Pan de Miga',
    descripcion: 'Pan de miga enrollado con queso crema, jamón, lechuga y zanahoria.',
    precio: 5000,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=500',
    video: 'https://www.youtube.com/results?search_query=sandwich+enrollado+miga',
  },

  // ═══════════════════════════════════════════════════════════
  //  ☕ CAFETERÍA
  // ═══════════════════════════════════════════════════════════
  {
    rubro: '☕ Cafetería',
    nombre: 'Café Espresso',
    descripcion: 'Café espresso intenso servido en taza pequeña.',
    precio: 2000,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?w=500',
    video: 'https://www.youtube.com/watch?v=xHrc-BQwHOo',
  },
  {
    rubro: '☕ Cafetería',
    nombre: 'Café con Leche',
    descripcion: 'Espresso con leche caliente o fría al gusto (250cc).',
    precio: 2800,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=500',
    video: 'https://www.youtube.com/results?search_query=cafe+con+leche+perfecto',
  },
  {
    rubro: '☕ Cafetería',
    nombre: 'Cortado',
    descripcion: 'Espresso con un toque de leche caliente vaporizada.',
    precio: 2200,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1515442261605-65987783cb6a?w=500',
    video: 'https://www.youtube.com/results?search_query=cortado+cafe+receta',
  },
  {
    rubro: '☕ Cafetería',
    nombre: 'Capuchino',
    descripcion: 'Espresso, leche vaporizada y espuma de leche cremosa.',
    precio: 3500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=500',
    video: 'https://www.youtube.com/watch?v=9f8mOfkFzQM',
  },
  {
    rubro: '☕ Cafetería',
    nombre: 'Té (Limón, Menta o Frutos Rojos)',
    descripcion: 'Té en saquito a elección servido con limón o leche.',
    precio: 1800,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500',
    video: 'https://www.youtube.com/results?search_query=te+infusion+preparacion',
  },
  {
    rubro: '☕ Cafetería',
    nombre: 'Mate Cocido con Leche',
    descripcion: 'Mate cocido tradicional con leche caliente y azúcar.',
    precio: 1800,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=500',
    video: 'https://www.youtube.com/results?search_query=mate+cocido+leche',
  },
  {
    rubro: '☕ Cafetería',
    nombre: 'Chocolate Caliente',
    descripcion: 'Chocolate artesanal espeso servido con crema y cacao en polvo.',
    precio: 3200,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=500',
    video: 'https://www.youtube.com/results?search_query=chocolate+caliente+espeso',
  },
  {
    rubro: '☕ Cafetería',
    nombre: 'Café Americano (Grande)',
    descripcion: 'Espresso alargado con agua caliente (300cc), suave y aromático.',
    precio: 2500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1497515114629-f71d768fd07c?w=500',
    video: 'https://www.youtube.com/results?search_query=cafe+americano+preparacion',
  },

  // ═══════════════════════════════════════════════════════════
  //  🫔 COMBOS CAFETERÍA
  // ═══════════════════════════════════════════════════════════
  {
    rubro: '🫔 Combos Cafetería',
    nombre: 'Combo: Café + Chipá (x2)',
    descripcion: 'Café espresso o con leche acompañado de 2 chipás calientes.',
    precio: 4800,
    descuento_pct: 15,
    foto: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500',
    video: 'https://www.youtube.com/results?search_query=chipa+cafe+desayuno+misionero',
  },
  {
    rubro: '🫔 Combos Cafetería',
    nombre: 'Combo: Café + Factura (Medialuna)',
    descripcion: 'Café a elección con medialuna de manteca o grasa.',
    precio: 4500,
    descuento_pct: 15,
    foto: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500',
    video: 'https://www.youtube.com/results?search_query=medialunas+manteca+argentina',
  },
  {
    rubro: '🫔 Combos Cafetería',
    nombre: 'Combo: Café con Leche + Tostado',
    descripcion: 'Café con leche grande y tostado mixto de jamón y queso.',
    precio: 7000,
    descuento_pct: 15,
    foto: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500',
    video: 'https://www.youtube.com/results?search_query=desayuno+cafe+tostado+argentina',
  },
  {
    rubro: '🫔 Combos Cafetería',
    nombre: 'Combo: Té + Chipás (x3)',
    descripcion: 'Té a elección con tres chipás recién salidos del horno.',
    precio: 4800,
    descuento_pct: 15,
    foto: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500',
    video: 'https://www.youtube.com/results?search_query=chipa+te+merienda',
  },
  {
    rubro: '🫔 Combos Cafetería',
    nombre: 'Combo: Capuchino + Croissant de Manteca',
    descripcion: 'Capuchino cremoso con croissant de manteca artesanal.',
    precio: 6500,
    descuento_pct: 15,
    foto: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500',
    video: 'https://www.youtube.com/results?search_query=capuchino+croissant+desayuno',
  },

  // ═══════════════════════════════════════════════════════════
  //  🧇 CHIPÁS Y PANIFICADOS
  // ═══════════════════════════════════════════════════════════
  {
    rubro: '🧇 Chipás y Panificados',
    nombre: 'Chipá (Unidad)',
    descripcion: 'Rosquita de harina de mandioca y queso, recién horneada.',
    precio: 1200,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500',
    video: 'https://www.youtube.com/watch?v=AvV5UhMTLMY',
  },
  {
    rubro: '🧇 Chipás y Panificados',
    nombre: 'Chipás (Docena)',
    descripcion: 'Docena de chipás artesanales de queso, recién horneadas.',
    precio: 12000,
    descuento_pct: 10,
    foto: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500',
    video: 'https://www.youtube.com/watch?v=AvV5UhMTLMY',
  },
  {
    rubro: '🧇 Chipás y Panificados',
    nombre: 'Medialuna de Manteca',
    descripcion: 'Medialuna artesanal de manteca, dorada y hojaldrada.',
    precio: 1800,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
    video: 'https://www.youtube.com/watch?v=A_tLLv1GKKU',
  },
  {
    rubro: '🧇 Chipás y Panificados',
    nombre: 'Medialuna de Grasa',
    descripcion: 'Medialuna de grasa tradicional, suave y sabrosa.',
    precio: 1600,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
    video: 'https://www.youtube.com/results?search_query=medialunas+grasa+argentina',
  },
  {
    rubro: '🧇 Chipás y Panificados',
    nombre: 'Facturas Variadas (x3)',
    descripcion: 'Tres facturas a elección: vigilante, bomba, berlinesa o cañón.',
    precio: 5500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500',
    video: 'https://www.youtube.com/results?search_query=facturas+argentinas+panaderia',
  },
  {
    rubro: '🧇 Chipás y Panificados',
    nombre: 'Croissant de Manteca con Mermelada',
    descripcion: 'Croissant artesanal de manteca servido con mermelada de ciruela.',
    precio: 3500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500',
    video: 'https://www.youtube.com/results?search_query=croissant+manteca+casero',
  },

  // ═══════════════════════════════════════════════════════════
  //  🥤 LICUADOS
  // ═══════════════════════════════════════════════════════════
  {
    rubro: '🥤 Licuados',
    nombre: 'Licuado de Banana (500cc)',
    descripcion: 'Banana fresca, leche entera, azúcar y una pizca de vainilla.',
    precio: 4500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500',
    video: 'https://www.youtube.com/results?search_query=licuado+banana+leche+casero',
  },
  {
    rubro: '🥤 Licuados',
    nombre: 'Licuado de Frutilla (500cc)',
    descripcion: 'Frutillas frescas de temporada, leche y azúcar al gusto.',
    precio: 4800,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500',
    video: 'https://www.youtube.com/results?search_query=licuado+frutilla+casero',
  },
  {
    rubro: '🥤 Licuados',
    nombre: 'Licuado de Mango y Maracuyá (500cc)',
    descripcion: 'Mango maduro con maracuyá, leche y jugo de naranja.',
    precio: 5200,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1622597467836-f3e6a1bf90fd?w=500',
    video: 'https://www.youtube.com/results?search_query=licuado+mango+maracuya',
  },
  {
    rubro: '🥤 Licuados',
    nombre: 'Licuado de Durazno (500cc)',
    descripcion: 'Durazno en almíbar o fresco, leche y azúcar.',
    precio: 4500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=500',
    video: 'https://www.youtube.com/results?search_query=licuado+durazno+receta',
  },
  {
    rubro: '🥤 Licuados',
    nombre: 'Licuado de Frutas Mixtas (500cc)',
    descripcion: 'Combinación de frutas de temporada, leche y miel.',
    precio: 5000,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=500',
    video: 'https://www.youtube.com/results?search_query=licuado+frutas+mixtas',
  },

  // ═══════════════════════════════════════════════════════════
  //  🍺 TRAGOS Y BEBIDAS
  // ═══════════════════════════════════════════════════════════
  {
    rubro: '🍺 Tragos y Bebidas',
    nombre: 'Coca Cola 1.5L',
    descripcion: 'Botella 1.5 Litros bien fría.',
    precio: 3500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500',
    video: 'https://www.youtube.com/results?search_query=coca+cola+botella',
  },
  {
    rubro: '🍺 Tragos y Bebidas',
    nombre: 'Coca Cola 500ml',
    descripcion: 'Botella personal 500ml bien fría.',
    precio: 2000,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1559839914-17aae19cec71?w=500',
    video: 'https://www.youtube.com/results?search_query=coca+cola+personal',
  },
  {
    rubro: '🍺 Tragos y Bebidas',
    nombre: 'Agua Mineral sin Gas 500ml',
    descripcion: 'Agua mineral natural sin gas, bien fría.',
    precio: 1500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=500',
    video: 'https://www.youtube.com/results?search_query=agua+mineral+natural',
  },
  {
    rubro: '🍺 Tragos y Bebidas',
    nombre: 'Jugo de Naranja Natural (400cc)',
    descripcion: 'Naranjas exprimidas al momento, fresco y vitamínico.',
    precio: 3500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=500',
    video: 'https://www.youtube.com/results?search_query=jugo+naranja+natural+exprimido',
  },
  {
    rubro: '🍺 Tragos y Bebidas',
    nombre: 'Gaseosa Variada 500ml (Fanta/Sprite/7UP)',
    descripcion: 'Gaseosa en botella personal a elección, bien fría.',
    precio: 2000,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500',
    video: 'https://www.youtube.com/results?search_query=gaseosa+variada+argentina',
  },
  {
    rubro: '🍺 Tragos y Bebidas',
    nombre: 'Cerveza Lata 473ml',
    descripcion: 'Lata de cerveza rubia 473ml, bien fría.',
    precio: 3500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=500',
    video: 'https://www.youtube.com/results?search_query=cerveza+lata+fria',
  },
  {
    rubro: '🍺 Tragos y Bebidas',
    nombre: 'Cerveza Artesanal IPA 473ml',
    descripcion: 'Cerveza artesanal India Pale Ale, bien fría y aromática.',
    precio: 4500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=500',
    video: 'https://www.youtube.com/results?search_query=cerveza+artesanal+IPA',
  },
  {
    rubro: '🍺 Tragos y Bebidas',
    nombre: 'Fernet con Coca (Copa)',
    descripcion: 'Fernet Branca con Coca Cola, hielo y rodaja de limón.',
    precio: 5500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=500',
    video: 'https://www.youtube.com/results?search_query=fernet+con+coca+argentina',
  },
  {
    rubro: '🍺 Tragos y Bebidas',
    nombre: 'Aperol Spritz',
    descripcion: 'Aperol, prosecco y agua con gas, servido con rodaja de naranja.',
    precio: 7500,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1558642891-54be180ea339?w=500',
    video: 'https://www.youtube.com/watch?v=1tBegk9YfnM',
  },
  {
    rubro: '🍺 Tragos y Bebidas',
    nombre: 'Agua Tónica con Limón',
    descripcion: 'Agua tónica, jugo de limón fresco y hielo.',
    precio: 3000,
    descuento_pct: 0,
    foto: 'https://images.unsplash.com/photo-1560508179-b2c9a3555b3e?w=500',
    video: 'https://www.youtube.com/results?search_query=agua+tonica+limon+trago',
  },
];

// ─── CONSTRUIR FILAS DEL EXCEL ────────────────────────────────────────────────
const filas = productos.map((p) => {
  const precio_original = p.precio;
  const precio_final = p.descuento_pct > 0
    ? Math.round(p.precio * (1 - p.descuento_pct / 100))
    : p.precio;

  return {
    'Fecha Creación':            FECHA_CREACION,
    'Rubro / Categoría':         p.rubro,
    'Nombre del Plato':          p.nombre,
    'Descripción':               p.descripcion,
    '★ PRECIO FINAL ($ARS)':     precio_final,   // ← precio que se muestra en el portal
    'Descuento Aplicado (%)':    p.descuento_pct,
    'Precio Lista Orig.':        precio_original, // referencia
    'Foto del Plato (URL)':      p.foto,
    'Video de Preparación (URL)':p.video,
  };
});

// ─── CREAR WORKBOOK ───────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(filas);

// Anchos de columna
ws['!cols'] = [
  { wch: 16 }, // Fecha
  { wch: 28 }, // Rubro
  { wch: 50 }, // Nombre
  { wch: 65 }, // Descripción
  { wch: 14 }, // Precio
  { wch: 14 }, // Descuento
  { wch: 18 }, // Precio Promo
  { wch: 70 }, // Foto URL
  { wch: 70 }, // Video URL
];

XLSX.utils.book_append_sheet(wb, ws, 'Menú Completo');

// ─── GUARDAR ──────────────────────────────────────────────────────────────────
const outputPath = path.join(__dirname, 'menu_rotiseria_completo.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`✅ Excel generado exitosamente:`);
console.log(`   📄 ${outputPath}`);
console.log(`   📊 Total de productos: ${productos.length}`);

// Resumen por rubro
const rubros = {};
productos.forEach(p => {
  rubros[p.rubro] = (rubros[p.rubro] || 0) + 1;
});
console.log('\n📋 Resumen por rubro:');
Object.entries(rubros).forEach(([r, c]) => console.log(`   ${r}: ${c} productos`));
