// ==========================================================================
// PLANILLA DE STOCK AL CIERRE DE CAJA + CONTROL FÍSICO AL ABRIR LA SIGUIENTE
// Compartido por caja.html y admin.html (ambos tienen los modales de abrir /
// cerrar turno). Requiere en el modal de apertura un <div id="open-shift-stockcheck">.
// ==========================================================================

let stockCheckSnapshot = null; // planilla pendiente de controlar (si hay)

function stockEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function stockFmt(n) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(n || 0);
}

// Abre la planilla imprimible. id: número de planilla, 'latest' (última) o 'current' (stock en vivo)
function openStockSheet(id) {
  window.open('/stock_planilla.html?id=' + encodeURIComponent(id || 'latest') + '&print=1', '_blank');
}

// Cartel que aparece después de cerrar la caja para imprimir la planilla
// (con un botón real: así el navegador no bloquea la ventana de impresión)
function showStockSheetPrompt(snapshotId) {
  if (!snapshotId) return;
  const old = document.getElementById('stock-sheet-prompt');
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'stock-sheet-prompt';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
  el.innerHTML =
    '<div style="background:#fff;color:#0f172a;border-radius:16px;max-width:380px;width:100%;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.5);font-family:Arial,sans-serif;">' +
      '<div style="font-size:34px;text-align:center;">📋</div>' +
      '<h3 style="margin:6px 0 4px;text-align:center;font-size:17px;font-weight:800;">Planilla de stock del cierre</h3>' +
      '<p style="font-size:13px;color:#475569;text-align:center;margin:0 0 14px;">Imprimila y dejala en el local: quien abra la próxima caja cuenta el stock físico y la compara con lo que figura en el sistema.</p>' +
      '<button id="stock-sheet-print-btn" style="width:100%;padding:12px;background:#f59e0b;border:0;border-radius:10px;font-weight:800;font-size:14px;cursor:pointer;">🖨️ Imprimir planilla de stock</button>' +
      '<button id="stock-sheet-skip-btn" style="width:100%;margin-top:8px;padding:10px;background:#f1f5f9;border:0;border-radius:10px;font-weight:700;font-size:12px;color:#334155;cursor:pointer;">Ahora no (se puede reimprimir desde el botón "Planilla de Stock")</button>' +
    '</div>';
  document.body.appendChild(el);
  document.getElementById('stock-sheet-print-btn').onclick = () => { openStockSheet(snapshotId); el.remove(); };
  document.getElementById('stock-sheet-skip-btn').onclick = () => el.remove();
}

// ---------- Apertura de caja: control contra la planilla anterior ----------

async function prepareOpenShiftStockCheck() {
  const box = document.getElementById('open-shift-stockcheck');
  if (!box) return;
  box.classList.add('hidden');
  box.innerHTML = '';
  stockCheckSnapshot = null;
  try {
    const res = await fetch('/api/cash/stock-snapshot/latest');
    const data = await res.json();
    const snap = data.success ? data.snapshot : null;
    if (!snap || snap.status !== 'pending' || !(snap.items || []).length) return;
    stockCheckSnapshot = snap;
  } catch (err) {
    console.error('No se pudo leer la planilla de stock:', err);
    return;
  }

  const snap = stockCheckSnapshot;
  const when = new Date(snap.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  box.innerHTML =
    '<div class="bg-sky-50 border border-sky-300 rounded-xl p-3 space-y-2">' +
      '<div class="flex justify-between items-start gap-2">' +
        '<div class="text-[11px] font-extrabold text-sky-900 leading-tight">📋 CONTROL DE STOCK vs. planilla del cierre anterior<br>' +
          '<span class="font-normal text-sky-800">Planilla #' + snap.id + ' · Caja N° ' + stockEsc(snap.box_number) + ' · ' + when + '</span></div>' +
        '<button type="button" onclick="openStockSheet(' + snap.id + ')" class="shrink-0 px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold rounded-lg">🖨️ Imprimir</button>' +
      '</div>' +
      '<select id="stockcheck-mode" onchange="toggleStockCheckList()" class="w-full px-2.5 py-2 border border-sky-300 rounded-lg text-xs font-bold bg-white text-slate-900">' +
        '<option value="">— Elegí una opción —</option>' +
        '<option value="ok">✅ Controlé el stock físico y coincide con la planilla</option>' +
        '<option value="diff">⚠️ Hay diferencias (las registro abajo)</option>' +
        '<option value="skip">⏭️ Omitir por ahora (lo controlo después)</option>' +
      '</select>' +
      '<div id="stockcheck-list-wrap" class="hidden space-y-1.5">' +
        '<input type="text" id="stockcheck-filter" oninput="filterStockCheckList()" placeholder="Buscar insumo…" class="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900">' +
        '<p class="text-[10px] text-sky-800 leading-tight">Completá <b>solo</b> los que tengan diferencia con el conteo real. Los vacíos se consideran correctos. <b>Solo se registran: el stock del sistema no se modifica.</b></p>' +
        '<div class="max-h-56 overflow-y-auto border border-slate-200 rounded-lg bg-white divide-y divide-slate-100" id="stockcheck-rows">' +
          snap.items.map((i, idx) =>
            '<div class="stockcheck-row flex items-center justify-between gap-2 px-2 py-1.5 text-xs" data-name="' + stockEsc((i.name + ' ' + i.code).toLowerCase()) + '">' +
              '<div class="min-w-0"><div class="font-bold text-slate-900 truncate">' + stockEsc(i.name) + '</div>' +
              '<div class="text-[10px] text-slate-500 font-mono">Sistema: ' + stockFmt(i.system_stock) + ' ' + stockEsc(i.unit) + (i.type === 'semi' ? ' · pre-armado' : '') + '</div></div>' +
              '<div class="flex items-center gap-1 shrink-0">' +
                '<input type="number" step="0.001" min="0" inputmode="decimal" data-idx="' + idx + '" placeholder="real" class="stockcheck-input w-20 px-1.5 py-1 border border-slate-300 rounded-lg text-xs font-mono font-bold text-right text-slate-900">' +
                '<span class="text-[10px] text-slate-500 w-6">' + stockEsc(i.unit) + '</span>' +
              '</div>' +
            '</div>'
          ).join('') +
        '</div>' +
      '</div>' +
    '</div>';
  box.classList.remove('hidden');
}

function toggleStockCheckList() {
  const mode = document.getElementById('stockcheck-mode').value;
  const wrap = document.getElementById('stockcheck-list-wrap');
  if (wrap) wrap.classList.toggle('hidden', mode !== 'diff');
}

function filterStockCheckList() {
  const q = (document.getElementById('stockcheck-filter').value || '').trim().toLowerCase();
  document.querySelectorAll('#stockcheck-rows .stockcheck-row').forEach(r => {
    r.style.display = !q || (r.getAttribute('data-name') || '').includes(q) ? '' : 'none';
  });
}

// Devuelve { ok:true, payload } (payload undefined si no hay planilla pendiente) o { ok:false, error }
function collectOpenShiftStockCheck() {
  const box = document.getElementById('open-shift-stockcheck');
  if (!box || box.classList.contains('hidden') || !stockCheckSnapshot) return { ok: true, payload: undefined };
  const mode = document.getElementById('stockcheck-mode').value;
  if (!mode) return { ok: false, error: 'Elegí una opción en el CONTROL DE STOCK (coincide, hay diferencias u omitir) antes de abrir la caja.' };
  const counts = [];
  if (mode === 'diff') {
    document.querySelectorAll('.stockcheck-input').forEach(inp => {
      if (inp.value.trim() === '') return;
      const item = stockCheckSnapshot.items[parseInt(inp.getAttribute('data-idx'))];
      if (!item) return;
      counts.push({ type: item.type, id: item.id, name: item.name, counted: inp.value.trim() });
    });
    if (counts.length === 0) return { ok: false, error: 'Elegiste "Hay diferencias" pero no cargaste ningún conteo. Completá los que difieren o cambiá la opción.' };

  }
  return { ok: true, payload: { snapshot_id: stockCheckSnapshot.id, mode, counts } };
}

// Texto para el cartel de "caja abierta" con el resultado del control
function describeStockCheckResult(r) {
  if (!r) return '';
  if (r.mode === 'skip') return '\n\n📋 Control de stock: OMITIDO (queda pendiente para quien abra la próxima caja).';
  if (r.mode === 'ok') return '\n\n📋 Control de stock: ✅ coincide con la planilla #' + r.snapshot_id + '.';
  const lines = (r.differences_list || []).map(a => '• ' + a.name + ': sistema ' + stockFmt(a.system_stock) + ' / real ' + stockFmt(a.counted_stock) + ' ' + a.unit + ' (' + (a.difference > 0 ? '+' : '') + stockFmt(a.difference) + ')');
  return '\n\n📋 Control de stock: ' + r.differences + ' diferencia(s) REGISTRADA(S). El stock del sistema NO se modificó:\n' + (lines.join('\n') || '(ninguna: los conteos coincidían con el sistema)');
}
