// generar_menu.js
// Genera un Excel completo con el menú de la rotisería
// tomando los precios REALES desde la base de datos (delivery_store.json)
// Ejecutar con: node generar_menu.js

const XLSX = require('xlsx');
const path = require('path');
const fs   = require('fs');

// ─── LEER BASE DE DATOS REAL ─────────────────────────────────────────────────
const dbPath = path.join(__dirname, 'delivery_store.json');

if (!fs.existsSync(dbPath)) {
  console.error('❌ No se encontró delivery_store.json en:', dbPath);
  process.exit(1);
}

const store = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));

const productos  = store.products   || [];
const categorias = store.categories || [];
const settings   = store.settings   || {};

const FECHA = new Date().toLocaleDateString('es-AR', {
  day:   '2-digit',
  month: '2-digit',
  year:  'numeric',
});

const NOMBRE_LOCAL = settings.restaurant_name || 'La Gran Rotisería';

// ─── MAPA CATEGORÍA ID → NOMBRE ──────────────────────────────────────────────
const catMap = {};
categorias.forEach(c => {
  catMap[c.id] = `${c.icon || ''} ${c.name}`.trim();
});

// ─── FILTRAR SOLO DISPONIBLES Y ORDENAR POR CATEGORÍA ───────────────────────
const disponibles = productos
  .filter(p => p.available !== 0)
  .sort((a, b) => {
    const catA = categorias.find(c => c.id === a.category_id);
    const catB = categorias.find(c => c.id === b.category_id);
    return ((catA?.sort_order || 0) - (catB?.sort_order || 0)) || (a.id - b.id);
  });

const noDisponibles = productos.filter(p => p.available === 0);

console.log(`📦 Total productos en BD:        ${productos.length}`);
console.log(`✅ Disponibles (en menú):         ${disponibles.length}`);
console.log(`🔴 No disponibles (ocultos):      ${noDisponibles.length}`);

// ─── CONSTRUIR FILAS DEL EXCEL ───────────────────────────────────────────────
function buildRow(p) {
  return {
    'Código':                p.code        || '',
    'Categoría':             catMap[p.category_id] || `ID ${p.category_id}`,
    'Nombre del Plato':      p.name,
    'Descripción':           p.description || '',
    '★ PRECIO ($ARS)':       p.price,
    'Disponible':            p.available !== 0 ? 'Sí' : 'No',
    'Tipo de Unidad':        p.unit_type   || 'unidad',
    'Foto (URL)':            p.image_url   || '',
    'Video (URL)':           p.video_url   || '',
    'ID Interno':            p.id,
  };
}

const filasDisponibles   = disponibles.map(buildRow);
const filasNoDisponibles = noDisponibles.map(buildRow);
const todasLasFilas      = [...filasDisponibles, ...filasNoDisponibles];

// ─── CREAR WORKBOOK ───────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();

// ── Hoja 1: Menú Completo (disponibles + no disponibles) ─────────────────────
const ws1 = XLSX.utils.json_to_sheet(todasLasFilas);
ws1['!cols'] = [
  { wch: 14 },  // Código
  { wch: 30 },  // Categoría
  { wch: 52 },  // Nombre
  { wch: 68 },  // Descripción
  { wch: 14 },  // Precio
  { wch: 12 },  // Disponible
  { wch: 14 },  // Tipo Unidad
  { wch: 72 },  // Foto URL
  { wch: 72 },  // Video URL
  { wch: 10 },  // ID Interno
];
XLSX.utils.book_append_sheet(wb, ws1, 'Menú Completo');

// ── Hoja 2: Solo disponibles (para imprimir / compartir) ─────────────────────
const ws2 = XLSX.utils.json_to_sheet(filasDisponibles);
ws2['!cols'] = ws1['!cols'];
XLSX.utils.book_append_sheet(wb, ws2, 'Solo Disponibles');

// ── Hoja 3: Resumen por categoría ────────────────────────────────────────────
const resumenMap = {};
disponibles.forEach(p => {
  const cat = catMap[p.category_id] || 'Sin Categoría';
  if (!resumenMap[cat]) resumenMap[cat] = { cantidad: 0, precio_min: Infinity, precio_max: 0 };
  resumenMap[cat].cantidad++;
  if (p.price < resumenMap[cat].precio_min) resumenMap[cat].precio_min = p.price;
  if (p.price > resumenMap[cat].precio_max) resumenMap[cat].precio_max = p.price;
});

const filasResumen = Object.entries(resumenMap).map(([cat, data]) => ({
  'Categoría':       cat,
  'Cantidad Platos': data.cantidad,
  'Precio Mínimo':   data.precio_min === Infinity ? '-' : data.precio_min,
  'Precio Máximo':   data.precio_max,
}));

const ws3 = XLSX.utils.json_to_sheet(filasResumen);
ws3['!cols'] = [{ wch: 35 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
XLSX.utils.book_append_sheet(wb, ws3, 'Resumen por Categoría');

// ─── GUARDAR ──────────────────────────────────────────────────────────────────
const outputPath = path.join(__dirname, 'menu_rotiseria_completo.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`\n✅ Excel generado exitosamente:`);
console.log(`   📄 Archivo: ${outputPath}`);
console.log(`   🏪 Local:   ${NOMBRE_LOCAL}`);
console.log(`   📅 Fecha:   ${FECHA}`);
console.log(`   📊 Hojas:   Menú Completo | Solo Disponibles | Resumen por Categoría`);
console.log(`\n📋 Resumen por categoría:`);
filasResumen.forEach(r => {
  console.log(`   ${r['Categoría']}: ${r['Cantidad Platos']} platos  |  $${r['Precio Mínimo']} – $${r['Precio Máximo']}`);
});
