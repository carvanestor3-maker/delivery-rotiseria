// importar_menu.js
// Reemplaza los productos de prueba por los 90 del menú generado
// Ejecutar con: node importar_menu.js

const fs = require('fs');
const path = require('path');

// ─── NUEVAS CATEGORÍAS ────────────────────────────────────────────────────────
const nuevasCategorias = [
  { id: 1,  name: 'Promos y Combos',            icon: '🔥', sort_order: 0  },
  { id: 2,  name: 'Minutas',                     icon: '🍳', sort_order: 1  },
  { id: 3,  name: 'Hamburguesas',                icon: '🍔', sort_order: 2  },
  { id: 4,  name: 'Pizzas',                      icon: '🍕', sort_order: 3  },
  { id: 5,  name: 'Empanadas',                   icon: '🥟', sort_order: 4  },
  { id: 6,  name: 'Bebidas & Tragos',            icon: '🍺', sort_order: 5  },
  { id: 7,  name: 'Cafetería & Infusiones',      icon: '☕', sort_order: 6  },
  { id: 8,  name: 'Sándwiches de Lomo',          icon: '🥩', sort_order: 7  },
  { id: 9,  name: 'Sándwiches de Milanesa',      icon: '🥪', sort_order: 8  },
  { id: 10, name: 'Guarniciones & Porciones',    icon: '🥗', sort_order: 9  },
  { id: 11, name: 'Sándwiches Especiales / Miga',icon: '🥪', sort_order: 10 },
  { id: 12, name: 'Combos Cafetería',            icon: '🫔', sort_order: 11 },
  { id: 13, name: 'Chipás & Panificados',        icon: '🧇', sort_order: 12 },
  { id: 14, name: 'Licuados',                    icon: '🥤', sort_order: 13 },
];

// Mapa: rubro del Excel → category_id
const RUBRO_A_CATEGORIA = {
  '🍕 Pizzas':                            4,
  '🍔 Hamburguesas':                      3,
  '🥩 Sándwiches de Lomo':               8,
  '🥩 Sándwiches de Milanesa':           9,
  '🍳 Minutas':                           2,
  '🥟 Empanadas':                         5,
  '🥗 Guarniciones y Porciones':         10,
  '🥪 Sándwiches Especiales / Pan de Miga': 11,
  '☕ Cafetería':                          7,
  '🫔 Combos Cafetería':                  12,
  '🧇 Chipás y Panificados':             13,
  '🥤 Licuados':                          14,
  '🍺 Tragos y Bebidas':                   6,
};

// ─── PRODUCTOS DEL MENÚ ───────────────────────────────────────────────────────
const productosMenu = [
  // 🍕 PIZZAS
  { rubro:'🍕 Pizzas', name:'Pizza Muzzarella Especial (Grande)', description:'Salsa de tomate casera, 300g muzzarella, aceitunas y orégano.', price:28000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500', video_url:'https://www.youtube.com/watch?v=UoYmgMO-ZZE' },
  { rubro:'🍕 Pizzas', name:'Pizza Napolitana (Grande)', description:'Muzzarella, tomate en rodajas, ajo y albahaca fresca.', price:31000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500', video_url:'https://www.youtube.com/watch?v=l3KJZ8smGIE' },
  { rubro:'🍕 Pizzas', name:'Pizza Fugazzeta Rellena (Grande)', description:'Doble masa rellena de muzzarella y cebolla caramelizada encima.', price:34000, descuento_pct:15, image_url:'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500', video_url:'https://www.youtube.com/watch?v=mGjx1KpRxM4' },
  { rubro:'🍕 Pizzas', name:'Pizza Calabresa con Pimiento (Grande)', description:'Salami calabresa, morrón rojo y verde, aceitunas negras.', price:33000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=500', video_url:'https://www.youtube.com/watch?v=G-XZhKOKBJ0' },
  { rubro:'🍕 Pizzas', name:'Pizza Cuatro Quesos (Grande)', description:'Muzzarella, roquefort, parmesano y provolone gratinados.', price:36000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1528137871618-79d2761e3fd5?w=500', video_url:'https://www.youtube.com/watch?v=8g_WXWF3HoE' },
  { rubro:'🍕 Pizzas', name:'Pizza Especial (Jamón, Morrón y Huevo)', description:'Jamón cocido, morrón asado, huevo, muzzarella y salsa.', price:35000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1590947132387-155cc02f3212?w=500', video_url:'https://www.youtube.com/watch?v=W5hBVUFlwAY' },
  { rubro:'🍕 Pizzas', name:'Pizza Pollo & BBQ (Grande)', description:'Pollo desmenuzado, salsa BBQ ahumada, cebolla morada y muzzarella.', price:37000, descuento_pct:15, image_url:'https://images.unsplash.com/photo-1601924582970-9238bcb495d6?w=500', video_url:'https://www.youtube.com/watch?v=7_b2LRv1h68' },
  { rubro:'🍕 Pizzas', name:'Pizza Verdura (Espinaca y Ricotta)', description:'Espinaca salteada, ricotta cremosa, ajo y muzzarella gratinada.', price:30000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1604917877934-07d8d248d396?w=500', video_url:'https://www.youtube.com/watch?v=3KZpRK7lBag' },
  { rubro:'🍕 Pizzas', name:'Porción de Pizza (2 porciones)', description:'Porción doble de pizza del día (consultar disponibilidad).', price:8500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=500', video_url:'https://www.youtube.com/results?search_query=pizza+porcion+argentina' },
  { rubro:'🍕 Pizzas', name:'Fainá (Grande)', description:'Torta de harina de garbanzo al horno, dorada y crocante.', price:7500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1624374055843-f30d553e6b37?w=500', video_url:'https://www.youtube.com/watch?v=kOPgG_VpqHw' },

  // 🍔 HAMBURGUESAS
  { rubro:'🍔 Hamburguesas', name:'Hamburguesa Clásica con Papas', description:'Medallón 150g, lechuga, tomate, cebolla, ketchup y mayonesa.', price:9500, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500', video_url:'https://www.youtube.com/watch?v=hRLqRzFRQXU' },
  { rubro:'🍔 Hamburguesas', name:'Hamburguesa Doble Cheddar & Bacon', description:'Doble medallón 120g c/u, cheddar fundido, panceta crocante y salsa de la casa.', price:13500, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=500', video_url:'https://www.youtube.com/watch?v=7cfHbvw3GtY' },
  { rubro:'🍔 Hamburguesas', name:'Hamburguesa BBQ Caramelizada', description:'Medallón 150g, cebolla caramelizada, salsa BBQ ahumada y cheddar.', price:12000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=500', video_url:'https://www.youtube.com/watch?v=Z_3kN6aBdNk' },
  { rubro:'🍔 Hamburguesas', name:'Hamburguesa Crispy de Pollo', description:'Pechuga de pollo empanada crocante, lechuga, tomate y mayo de ajo.', price:11500, descuento_pct:15, image_url:'https://images.unsplash.com/photo-1562802378-063ec186a863?w=500', video_url:'https://www.youtube.com/watch?v=3AOJUuSGplI' },
  { rubro:'🍔 Hamburguesas', name:'Hamburguesa con Huevo Frito y Jamón', description:'Medallón 150g, huevo frito, jamón cocido, queso y condimentos.', price:11000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=500', video_url:'https://www.youtube.com/results?search_query=hamburguesa+con+huevo+receta' },
  { rubro:'🍔 Hamburguesas', name:'Hamburguesa Triple Especial de la Casa', description:'Triple medallón 100g c/u, cheddar, bacon, cebolla crispy y salsa especial.', price:16500, descuento_pct:15, image_url:'https://images.unsplash.com/photo-1607013251379-e6eecfffe234?w=500', video_url:'https://www.youtube.com/watch?v=PBj0e0s3tFg' },

  // 🥩 LOMOS
  { rubro:'🥩 Sándwiches de Lomo', name:'Lomito Completo al Pan', description:'Lomo vacuno tierno, lechuga, tomate, jamón, queso, huevo frito y papas.', price:14500, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1481070555726-e2fe8357725c?w=500', video_url:'https://www.youtube.com/watch?v=FP0X6IQoRwE' },
  { rubro:'🥩 Sándwiches de Lomo', name:'Lomito Napolitano', description:'Lomo al pan con salsa de tomate, muzzarella gratinada y orégano.', price:15500, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=500', video_url:'https://www.youtube.com/results?search_query=lomito+napolitano+receta' },
  { rubro:'🥩 Sándwiches de Lomo', name:'Lomito al Verdeo con Champiñones', description:'Lomo vacuno con salsa de cebollita de verdeo, champiñones salteados y queso.', price:16000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500', video_url:'https://www.youtube.com/results?search_query=lomito+verdeo+champinones' },
  { rubro:'🥩 Sándwiches de Lomo', name:'Lomito Especial con Panceta y Cheddar', description:'Lomo, panceta crocante, queso cheddar, cebolla crispy y BBQ.', price:17000, descuento_pct:15, image_url:'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500', video_url:'https://www.youtube.com/results?search_query=lomito+especial+argentina' },

  // 🥩 MILANESAS SÁNDWICH
  { rubro:'🥩 Sándwiches de Milanesa', name:'Sándwich de Milanesa de Carne Vacuna Completo', description:'Milanesa de carne, lechuga, tomate, jamón, queso y huevo frito.', price:12500, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1550547660-d9450f859349?w=500', video_url:'https://www.youtube.com/watch?v=l3KJZ8smGIE' },
  { rubro:'🥩 Sándwiches de Milanesa', name:'Sándwich de Milanesa de Pollo Completo', description:'Milanesa de pechuga de pollo, lechuga, tomate, mayo de ajo y queso.', price:12000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=500', video_url:'https://www.youtube.com/results?search_query=sanduche+milanesa+pollo+receta' },
  { rubro:'🥩 Sándwiches de Milanesa', name:'Sándwich de Milanesa de Cerdo Completo', description:'Milanesa de cerdo jugosa, lechuga, tomate, mostaza y queso.', price:11500, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=500', video_url:'https://www.youtube.com/results?search_query=milanesa+cerdo+sanduche' },
  { rubro:'🥩 Sándwiches de Milanesa', name:'Sándwich de Milanesa Napolitana', description:'Milanesa al pan con salsa de tomate, jamón, muzzarella y orégano.', price:14000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1544025162-d76694265947?w=500', video_url:'https://www.youtube.com/watch?v=E_QQQeHa0tg' },

  // 🍳 MINUTAS
  { rubro:'🍳 Minutas', name:'Milanesa de Carne Vacuna con Papas Fritas', description:'Milanesa grande de nalga rebozada, papas fritas crocantes.', price:16500, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1544025162-d76694265947?w=500', video_url:'https://www.youtube.com/watch?v=PgWy1Ylh5Us' },
  { rubro:'🍳 Minutas', name:'Milanesa de Carne Vacuna a Caballo', description:'Milanesa de carne con dos huevos fritos encima y papas fritas.', price:18000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1559847844-5315695dadae?w=500', video_url:'https://www.youtube.com/watch?v=EH0WLBJSwKo' },
  { rubro:'🍳 Minutas', name:'Milanesa Napolitana con Papas Fritas', description:'Milanesa cubierta con salsa de tomate, jamón, muzzarella y orégano.', price:19000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=500', video_url:'https://www.youtube.com/watch?v=UoYmgMO-ZZE' },
  { rubro:'🍳 Minutas', name:'Milanesa de Pollo con Papas Fritas', description:'Pechuga de pollo empanada, papas fritas y ensalada mixta.', price:15500, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1619221882220-947b3d3c8861?w=500', video_url:'https://www.youtube.com/results?search_query=milanesa+pollo+papas+fritas' },
  { rubro:'🍳 Minutas', name:'Milanesa de Cerdo con Papas Fritas', description:'Milanesa de cerdo dorada, papas fritas y limón.', price:15000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1580476262798-bddd9f4b7369?w=500', video_url:'https://www.youtube.com/results?search_query=milanesa+cerdo+papas' },
  { rubro:'🍳 Minutas', name:'Bife de Lomo a la Plancha con Papas', description:'Bife de lomo vacuno a la plancha jugoso, papas fritas y ensalada.', price:22000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1529694157872-4e0c0f3b238b?w=500', video_url:'https://www.youtube.com/results?search_query=bife+lomo+plancha+argentina' },
  { rubro:'🍳 Minutas', name:'Bife de Chorizo con Papas y Ensalada', description:'Bife de chorizo tierno a la plancha, papas fritas y ensalada completa.', price:24000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1594041680534-e8c8cdebd659?w=500', video_url:'https://www.youtube.com/results?search_query=bife+chorizo+plancha' },
  { rubro:'🍳 Minutas', name:'Revuelto Gramajo', description:'Huevos revueltos con papas paja crocantes, jamón y arvejas.', price:12000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=500', video_url:'https://www.youtube.com/watch?v=AigjjS0NLGI' },

  // 🥟 EMPANADAS
  { rubro:'🥟 Empanadas', name:'Empanada de Carne Cortada a Cuchillo', description:'Carne vacuna picada a cuchillo, cebolla, huevo duro y aceitunas.', price:2800, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500', video_url:'https://www.youtube.com/watch?v=hGkbgJFH0qA' },
  { rubro:'🥟 Empanadas', name:'Empanada de Carne Molida Vacuna (Huevo, Morrón y Cebolla)', description:'Carne molida vacuna, cebolla, morrón, huevo duro y condimentos.', price:2600, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500', video_url:'https://www.youtube.com/watch?v=hGkbgJFH0qA' },
  { rubro:'🥟 Empanadas', name:'Empanada de Pollo con Verduras', description:'Pollo desmenuzado con cebolla, morrón, aceitunas y especias.', price:2700, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1607198179219-d0b74484b2de?w=500', video_url:'https://www.youtube.com/watch?v=cxK4VCfOBV4' },
  { rubro:'🥟 Empanadas', name:'Empanada de Bondiolita de Cerdo', description:'Bondiolita de cerdo desmenuzada, cebolla y especias criollas.', price:3000, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1571167530149-c1105da4c2c0?w=500', video_url:'https://www.youtube.com/results?search_query=empanada+bondiolita+cerdo' },
  { rubro:'🥟 Empanadas', name:'Empanada de Jamón y Queso', description:'Jamón cocido seleccionado y queso tirante cremoso.', price:2500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500', video_url:'https://www.youtube.com/results?search_query=empanada+jamon+queso+receta' },
  { rubro:'🥟 Empanadas', name:'Empanada Caprese (Tomate y Mozzarella)', description:'Tomate fresco, muzzarella, albahaca y aceite de oliva.', price:2600, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500', video_url:'https://www.youtube.com/results?search_query=empanada+caprese+italiana' },
  { rubro:'🥟 Empanadas', name:'Empanada de Roquefort y Cebolla', description:'Queso roquefort cremoso con cebolla caramelizada.', price:2900, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=500', video_url:'https://www.youtube.com/results?search_query=empanada+roquefort+cebolla' },
  { rubro:'🥟 Empanadas', name:'Empanada de Choclo y Queso', description:'Choclo cremoso, queso fresco y una pizca de azúcar.', price:2500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?w=500', video_url:'https://www.youtube.com/results?search_query=empanada+choclo+queso' },
  { rubro:'🥟 Empanadas', name:'Empanada de Verdura (Espinaca y Ricotta)', description:'Espinaca salteada, ricotta, nuez moscada y queso rallado.', price:2500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=500', video_url:'https://www.youtube.com/results?search_query=empanada+espinaca+ricotta' },
  { rubro:'🥟 Empanadas', name:'Empanada de Humita', description:'Maíz cremoso tradicional con leche, cebolla y queso.', price:2500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1624374055843-f30d553e6b37?w=500', video_url:'https://www.youtube.com/watch?v=kOPgG_VpqHw' },
  { rubro:'🥟 Empanadas', name:'Empanada de Atún', description:'Atún en aceite, cebolla, aceitunas y huevo duro.', price:2700, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1563612116625-3012372fccce?w=500', video_url:'https://www.youtube.com/results?search_query=empanada+atun+receta' },
  { rubro:'🥟 Empanadas', name:'Docena de Empanadas Mixtas', description:'Docena de empanadas a elección (carne, pollo, jamón y queso, etc.).', price:28000, descuento_pct:15, image_url:'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500', video_url:'https://www.youtube.com/results?search_query=empanadas+surtidas+argentina' },

  // 🥗 GUARNICIONES
  { rubro:'🥗 Guarniciones y Porciones', name:'Porción de Papas Fritas Simples', description:'Papas frescas cortadas y fritas en aceite de girasol, con sal.', price:4500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500', video_url:'https://www.youtube.com/results?search_query=papas+fritas+perfectas+receta' },
  { rubro:'🥗 Guarniciones y Porciones', name:'Porción de Papas Fritas Cheddar & Bacon', description:'Papas crocantes bañadas en salsa cheddar caliente y panceta crocante.', price:6500, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500', video_url:'https://www.youtube.com/results?search_query=papas+loaded+cheddar+bacon' },
  { rubro:'🥗 Guarniciones y Porciones', name:'Papas Rústicas al Horno con Hierbas', description:'Papas en gajos con romero, ajo, pimentón y aceite de oliva.', price:5500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1518013431117-eb1465fa5752?w=500', video_url:'https://www.youtube.com/results?search_query=papas+rusticas+horno' },
  { rubro:'🥗 Guarniciones y Porciones', name:'Puré de Papas Cremoso', description:'Puré casero con manteca, leche caliente y nuez moscada.', price:4000, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1574484284002-952d92456975?w=500', video_url:'https://www.youtube.com/results?search_query=pure+papas+cremoso+receta' },
  { rubro:'🥗 Guarniciones y Porciones', name:'Ensalada Mixta (Lechuga y Tomate)', description:'Lechuga, tomate, cebolla morada y aderezo a elección.', price:4000, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500', video_url:'https://www.youtube.com/results?search_query=ensalada+mixta+basica' },
  { rubro:'🥗 Guarniciones y Porciones', name:'Ensalada Completa del Chef', description:'Lechuga, tomate, zanahoria, huevo duro, aceitunas y choclo.', price:6000, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500', video_url:'https://www.youtube.com/results?search_query=ensalada+completa+chef' },
  { rubro:'🥗 Guarniciones y Porciones', name:'Arroz Blanco Mantequillado', description:'Arroz largo fino, manteca, sal y hierbas frescas.', price:3500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500', video_url:'https://www.youtube.com/results?search_query=arroz+blanco+perfecto' },

  // 🥪 SÁNDWICHES ESPECIALES
  { rubro:'🥪 Sándwiches Especiales / Pan de Miga', name:'Tostado Mixto Jamón y Queso (Pan de Miga)', description:'Pan de miga tostado, jamón cocido y queso cremoso derretido.', price:4500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=500', video_url:'https://www.youtube.com/results?search_query=tostado+miga+jamon+queso' },
  { rubro:'🥪 Sándwiches Especiales / Pan de Miga', name:'Sándwich Triple de Pan de Miga', description:'Triple de jamón, queso, tomate, lechuga y huevo duro en pan de miga.', price:6500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1622542796254-5b9c46ab0d2f?w=500', video_url:'https://www.youtube.com/results?search_query=sandwich+triple+miga' },
  { rubro:'🥪 Sándwiches Especiales / Pan de Miga', name:'Club Sándwich de Pollo', description:'Pollo a la plancha, bacon, lechuga, tomate, queso y mayo.', price:8500, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1567234669003-dce7a7a88821?w=500', video_url:'https://www.youtube.com/watch?v=kWEJCA5b3-E' },
  { rubro:'🥪 Sándwiches Especiales / Pan de Miga', name:'Medialunas con Jamón y Queso (x2)', description:'Dos medialunas de manteca rellenas con jamón y queso brie.', price:5500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500', video_url:'https://www.youtube.com/results?search_query=medialunas+jamon+queso' },
  { rubro:'🥪 Sándwiches Especiales / Pan de Miga', name:'Sándwich Enrollado de Pan de Miga', description:'Pan de miga enrollado con queso crema, jamón, lechuga y zanahoria.', price:5000, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=500', video_url:'https://www.youtube.com/results?search_query=sandwich+enrollado+miga' },

  // ☕ CAFETERÍA
  { rubro:'☕ Cafetería', name:'Café Espresso', description:'Café espresso intenso servido en taza pequeña.', price:2000, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?w=500', video_url:'https://www.youtube.com/watch?v=xHrc-BQwHOo' },
  { rubro:'☕ Cafetería', name:'Café con Leche', description:'Espresso con leche caliente o fría al gusto (250cc).', price:2800, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=500', video_url:'https://www.youtube.com/results?search_query=cafe+con+leche+perfecto' },
  { rubro:'☕ Cafetería', name:'Cortado', description:'Espresso con un toque de leche caliente vaporizada.', price:2200, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1515442261605-65987783cb6a?w=500', video_url:'https://www.youtube.com/results?search_query=cortado+cafe+receta' },
  { rubro:'☕ Cafetería', name:'Capuchino', description:'Espresso, leche vaporizada y espuma de leche cremosa.', price:3500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1534778101976-62847782c213?w=500', video_url:'https://www.youtube.com/watch?v=9f8mOfkFzQM' },
  { rubro:'☕ Cafetería', name:'Té (Limón, Menta o Frutos Rojos)', description:'Té en saquito a elección servido con limón o leche.', price:1800, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500', video_url:'https://www.youtube.com/results?search_query=te+infusion+preparacion' },
  { rubro:'☕ Cafetería', name:'Mate Cocido con Leche', description:'Mate cocido tradicional con leche caliente y azúcar.', price:1800, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=500', video_url:'https://www.youtube.com/results?search_query=mate+cocido+leche' },
  { rubro:'☕ Cafetería', name:'Chocolate Caliente', description:'Chocolate artesanal espeso servido con crema y cacao en polvo.', price:3200, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=500', video_url:'https://www.youtube.com/results?search_query=chocolate+caliente+espeso' },
  { rubro:'☕ Cafetería', name:'Café Americano (Grande)', description:'Espresso alargado con agua caliente (300cc), suave y aromático.', price:2500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1497515114629-f71d768fd07c?w=500', video_url:'https://www.youtube.com/results?search_query=cafe+americano+preparacion' },

  // 🫔 COMBOS
  { rubro:'🫔 Combos Cafetería', name:'Combo: Café + Chipá (x2)', description:'Café espresso o con leche acompañado de 2 chipás calientes.', price:4800, descuento_pct:15, image_url:'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500', video_url:'https://www.youtube.com/results?search_query=chipa+cafe+desayuno+misionero' },
  { rubro:'🫔 Combos Cafetería', name:'Combo: Café + Factura (Medialuna)', description:'Café a elección con medialuna de manteca o grasa.', price:4500, descuento_pct:15, image_url:'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500', video_url:'https://www.youtube.com/results?search_query=medialunas+manteca+argentina' },
  { rubro:'🫔 Combos Cafetería', name:'Combo: Café con Leche + Tostado', description:'Café con leche grande y tostado mixto de jamón y queso.', price:7000, descuento_pct:15, image_url:'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500', video_url:'https://www.youtube.com/results?search_query=desayuno+cafe+tostado+argentina' },
  { rubro:'🫔 Combos Cafetería', name:'Combo: Té + Chipás (x3)', description:'Té a elección con tres chipás recién salidos del horno.', price:4800, descuento_pct:15, image_url:'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500', video_url:'https://www.youtube.com/results?search_query=chipa+te+merienda' },
  { rubro:'🫔 Combos Cafetería', name:'Combo: Capuchino + Croissant de Manteca', description:'Capuchino cremoso con croissant de manteca artesanal.', price:6500, descuento_pct:15, image_url:'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500', video_url:'https://www.youtube.com/results?search_query=capuchino+croissant+desayuno' },

  // 🧇 CHIPÁS
  { rubro:'🧇 Chipás y Panificados', name:'Chipá (Unidad)', description:'Rosquita de harina de mandioca y queso, recién horneada.', price:1200, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500', video_url:'https://www.youtube.com/watch?v=AvV5UhMTLMY' },
  { rubro:'🧇 Chipás y Panificados', name:'Chipás (Docena)', description:'Docena de chipás artesanales de queso, recién horneadas.', price:12000, descuento_pct:10, image_url:'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500', video_url:'https://www.youtube.com/watch?v=AvV5UhMTLMY' },
  { rubro:'🧇 Chipás y Panificados', name:'Medialuna de Manteca', description:'Medialuna artesanal de manteca, dorada y hojaldrada.', price:1800, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500', video_url:'https://www.youtube.com/watch?v=A_tLLv1GKKU' },
  { rubro:'🧇 Chipás y Panificados', name:'Medialuna de Grasa', description:'Medialuna de grasa tradicional, suave y sabrosa.', price:1600, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500', video_url:'https://www.youtube.com/results?search_query=medialunas+grasa+argentina' },
  { rubro:'🧇 Chipás y Panificados', name:'Facturas Variadas (x3)', description:'Tres facturas a elección: vigilante, bomba, berlinesa o cañón.', price:5500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500', video_url:'https://www.youtube.com/results?search_query=facturas+argentinas+panaderia' },
  { rubro:'🧇 Chipás y Panificados', name:'Croissant de Manteca con Mermelada', description:'Croissant artesanal de manteca servido con mermelada de ciruela.', price:3500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500', video_url:'https://www.youtube.com/results?search_query=croissant+manteca+casero' },

  // 🥤 LICUADOS
  { rubro:'🥤 Licuados', name:'Licuado de Banana (500cc)', description:'Banana fresca, leche entera, azúcar y una pizca de vainilla.', price:4500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500', video_url:'https://www.youtube.com/results?search_query=licuado+banana+leche+casero' },
  { rubro:'🥤 Licuados', name:'Licuado de Frutilla (500cc)', description:'Frutillas frescas de temporada, leche y azúcar al gusto.', price:4800, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500', video_url:'https://www.youtube.com/results?search_query=licuado+frutilla+casero' },
  { rubro:'🥤 Licuados', name:'Licuado de Mango y Maracuyá (500cc)', description:'Mango maduro con maracuyá, leche y jugo de naranja.', price:5200, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1622597467836-f3e6a1bf90fd?w=500', video_url:'https://www.youtube.com/results?search_query=licuado+mango+maracuya' },
  { rubro:'🥤 Licuados', name:'Licuado de Durazno (500cc)', description:'Durazno en almíbar o fresco, leche y azúcar.', price:4500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=500', video_url:'https://www.youtube.com/results?search_query=licuado+durazno+receta' },
  { rubro:'🥤 Licuados', name:'Licuado de Frutas Mixtas (500cc)', description:'Combinación de frutas de temporada, leche y miel.', price:5000, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=500', video_url:'https://www.youtube.com/results?search_query=licuado+frutas+mixtas' },

  // 🍺 BEBIDAS
  { rubro:'🍺 Tragos y Bebidas', name:'Coca Cola 1.5L', description:'Botella 1.5 Litros bien fría.', price:3500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500', video_url:'https://www.youtube.com/results?search_query=coca+cola+botella' },
  { rubro:'🍺 Tragos y Bebidas', name:'Coca Cola 500ml', description:'Botella personal 500ml bien fría.', price:2000, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1559839914-17aae19cec71?w=500', video_url:'https://www.youtube.com/results?search_query=coca+cola+personal' },
  { rubro:'🍺 Tragos y Bebidas', name:'Agua Mineral sin Gas 500ml', description:'Agua mineral natural sin gas, bien fría.', price:1500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=500', video_url:'https://www.youtube.com/results?search_query=agua+mineral+natural' },
  { rubro:'🍺 Tragos y Bebidas', name:'Jugo de Naranja Natural (400cc)', description:'Naranjas exprimidas al momento, fresco y vitamínico.', price:3500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=500', video_url:'https://www.youtube.com/results?search_query=jugo+naranja+natural+exprimido' },
  { rubro:'🍺 Tragos y Bebidas', name:'Gaseosa Variada 500ml (Fanta/Sprite/7UP)', description:'Gaseosa en botella personal a elección, bien fría.', price:2000, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500', video_url:'https://www.youtube.com/results?search_query=gaseosa+variada+argentina' },
  { rubro:'🍺 Tragos y Bebidas', name:'Cerveza Lata 473ml', description:'Lata de cerveza rubia 473ml, bien fría.', price:3500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=500', video_url:'https://www.youtube.com/results?search_query=cerveza+lata+fria' },
  { rubro:'🍺 Tragos y Bebidas', name:'Cerveza Artesanal IPA 473ml', description:'Cerveza artesanal India Pale Ale, bien fría y aromática.', price:4500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=500', video_url:'https://www.youtube.com/results?search_query=cerveza+artesanal+IPA' },
  { rubro:'🍺 Tragos y Bebidas', name:'Fernet con Coca (Copa)', description:'Fernet Branca con Coca Cola, hielo y rodaja de limón.', price:5500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=500', video_url:'https://www.youtube.com/results?search_query=fernet+con+coca+argentina' },
  { rubro:'🍺 Tragos y Bebidas', name:'Aperol Spritz', description:'Aperol, prosecco y agua con gas, servido con rodaja de naranja.', price:7500, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1558642891-54be180ea339?w=500', video_url:'https://www.youtube.com/watch?v=1tBegk9YfnM' },
  { rubro:'🍺 Tragos y Bebidas', name:'Agua Tónica con Limón', description:'Agua tónica, jugo de limón fresco y hielo.', price:3000, descuento_pct:0, image_url:'https://images.unsplash.com/photo-1560508179-b2c9a3555b3e?w=500', video_url:'https://www.youtube.com/results?search_query=agua+tonica+limon+trago' },
];

// ─── IMPORTAR AL STORE ────────────────────────────────────────────────────────
const storePath = path.join(__dirname, 'delivery_store.json');
const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));

// Actualizar categorías
store.categories = nuevasCategorias;

// Construir productos con IDs auto-incrementales
store.products = productosMenu.map((p, i) => {
  const category_id = RUBRO_A_CATEGORIA[p.rubro];
  const precio_promo = p.descuento_pct > 0
    ? Math.round(p.price * (1 - p.descuento_pct / 100))
    : p.price;

  return {
    id:            i + 1,
    code:          '',          // se puede completar desde el admin
    category_id,
    name:          p.name,
    description:   p.description,
    price:         p.price,
    descuento_pct: p.descuento_pct,
    precio_promo,
    image_url:     p.image_url,
    video_url:     p.video_url,
    available:     1,
    unit_type:     'unidad',
  };
});

// Guardar
fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');

console.log('✅ Importación completada:');
console.log(`   📦 Productos: ${store.products.length}`);
console.log(`   📂 Categorías: ${store.categories.length}`);

const resumen = {};
store.products.forEach(p => {
  const cat = store.categories.find(c => c.id === p.category_id);
  const k = cat ? `${cat.icon} ${cat.name}` : 'Sin cat';
  resumen[k] = (resumen[k] || 0) + 1;
});
console.log('\n📋 Por categoría:');
Object.entries(resumen).forEach(([k, v]) => console.log(`   ${k}: ${v}`));
