const socket = io();
let batches = [];
let products = [];
let rawMaterials = [];
let activeTab = 'active'; // 'active' | 'history'
let sectorFilter = 'all'; // 'all' | 'cocina' | 'bar' | 'kilo'
let liveTimerInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  loadProductionData();
  setupSocket();
  liveTimerInterval = setInterval(updateLiveTimers, 1000);
});

function setupSocket() {
  socket.on('connect', () => {
    const statusElem = document.getElementById('socket-status');
    if (statusElem) {
      statusElem.innerHTML = '🟢 En vivo';
      statusElem.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    }
  });

  socket.on('disconnect', () => {
    const statusElem = document.getElementById('socket-status');
    if (statusElem) {
      statusElem.innerHTML = '🔴 Desconectado';
      statusElem.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30';
    }
  });

  socket.on('production_updated', () => {
    loadProductionData();
  });

  socket.on('stock_updated', () => {
    loadProductionData();
  });
}

async function loadProductionData() {
  try {
    const res = await fetch('/api/production/batches');
    const data = await res.json();
    if (data.success) {
      batches = data.batches || [];
      products = data.products || [];
      rawMaterials = data.raw_materials || [];
      populateProductSelect();
      renderProductionView();
    }
  } catch (err) {
    console.error('Error al cargar datos de producción:', err);
  }
}

function populateProductSelect() {
  const select = document.getElementById('batch-product-id');
  if (!select) return;

  if (products.length === 0) {
    select.innerHTML = '<option value="">No hay productos registrados en el sistema</option>';
    return;
  }

  // Filtrar o listar productos gastronómicos / panadería / comida por kilo
  select.innerHTML = products.map(p => `
    <option value="${p.id}">${p.name} (${p.category_name || 'General'}) - Unid: ${p.unit_type || 'kg'}</option>
  `).join('');
}

function renderProductionView() {
  let filtered = batches;
  if (sectorFilter !== 'all') {
    filtered = batches.filter(b => {
      const sec = (b.category_sector || '').toLowerCase();
      if (sectorFilter === 'cocina') return sec.includes('cocina') || sec.includes('relleno') || sec.includes('minuta');
      if (sectorFilter === 'bar') return sec.includes('bar') || sec.includes('panad') || sec.includes('pastel');
      if (sectorFilter === 'kilo') return sec.includes('kilo') || sec.includes('roti');
      return true;
    });
  }

  const activeBatches = filtered.filter(b => b.status === 'in_progress');
  const historyBatches = filtered.filter(b => b.status === 'completed');

  updateMetrics(activeBatches, historyBatches);

  if (activeTab === 'active') {
    renderActiveGrid(activeBatches);
  } else {
    renderHistoryTable(historyBatches);
  }

  lucide.createIcons();
}

function updateMetrics(activeBatches, historyBatches) {
  const elemActive = document.getElementById('metric-in-progress');
  const elemCompleted = document.getElementById('metric-completed-today');
  const elemAvg = document.getElementById('metric-avg-duration');

  if (elemActive) elemActive.textContent = activeBatches.length;
  if (elemCompleted) elemCompleted.textContent = historyBatches.length;

  if (elemAvg) {
    if (historyBatches.length === 0) {
      elemAvg.textContent = '0.0 min';
    } else {
      let totalSecs = 0;
      historyBatches.forEach(b => {
        totalSecs += (b.duration_seconds || 0);
      });
      const avgMin = (totalSecs / historyBatches.length / 60).toFixed(1);
      elemAvg.textContent = `${avgMin} min`;
    }
  }
}

function renderActiveGrid(activeBatches) {
  const container = document.getElementById('production-active-grid');
  if (!container) return;

  if (activeBatches.length === 0) {
    container.innerHTML = `<div class="col-span-full p-12 text-center text-slate-500 font-bold text-sm bg-slate-900 rounded-2xl border border-slate-800">🏭 No hay lotes de producción en curso en este momento. Toca "➕ Iniciar Nuevo Lote" para abrir una comanda de producción.</div>`;
    return;
  }

  const now = new Date();

  container.innerHTML = activeBatches.map(b => {
    const startTime = b.started_at ? new Date(b.started_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '-';
    const diffSec = Math.max(0, Math.floor((now - new Date(b.started_at)) / 1000));

    return `
      <div class="bg-slate-900 rounded-2xl border border-amber-500/40 p-4 shadow-xl space-y-3 flex flex-col justify-between">
        
        <div class="space-y-2">
          <!-- Header Lote -->
          <div class="flex justify-between items-start border-b border-slate-800 pb-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-lg font-mono font-black text-amber-400">${b.batch_number}</span>
                <span class="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black px-2 py-0.5 rounded-full">${b.category_sector}</span>
              </div>
              <h3 class="font-extrabold text-white text-base mt-1 leading-snug">${b.product_name}</h3>
            </div>
            <div class="text-right">
              <div class="text-[10px] text-slate-400 font-bold">CANTIDAD</div>
              <div class="text-base font-mono font-black text-emerald-400">${b.quantity} ${b.unit_type || 'kg'}</div>
            </div>
          </div>

          <!-- Datos Operario & Hora -->
          <div class="flex justify-between items-center text-xs text-slate-300">
            <div>
              <span class="text-slate-400">👷 Operario a Cargo:</span>
              <span class="font-bold text-white ml-1">${b.operator_name}</span>
            </div>
            <div class="font-mono text-slate-400">
              ${startTime} hs
            </div>
          </div>

          ${b.notes ? `
            <div class="bg-slate-950 p-2 rounded-xl text-[11px] text-amber-300 font-semibold border border-amber-500/20">
              📝 ${b.notes}
            </div>
          ` : ''}

          <!-- Reloj Transcurrido en Vivo -->
          <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
            <span class="text-xs font-bold text-slate-400">⏱️ Tiempo Transcurrido:</span>
            <span class="live-elapsed-timer font-mono font-black text-base text-amber-400" data-start="${b.started_at}">Calculando...</span>
          </div>
        </div>

        <!-- Botón Concluir Lote -->
        <button onclick="finishBatch(${b.id})" class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black rounded-xl text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer mt-2">
          <span>🟢</span> CONCLUIR LOTE & CARGAR A STOCK
        </button>

      </div>
    `;
  }).join('');

  updateLiveTimers();
}

function renderHistoryTable(historyBatches) {
  const tbody = document.getElementById('production-history-tbody');
  if (!tbody) return;

  if (historyBatches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500 font-bold text-xs">No hay lotes concluidos en la bitácora todavía.</td></tr>`;
    return;
  }

  tbody.innerHTML = historyBatches.map(b => {
    const startTime = b.started_at ? new Date(b.started_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '-';
    const endTime = b.finished_at ? new Date(b.finished_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '-';
    const durationSec = b.duration_seconds || 0;
    const min = Math.floor(durationSec / 60);
    const sec = durationSec % 60;
    const durationText = `${min} min ${sec} seg`;

    return `
      <tr class="hover:bg-slate-800/50 transition">
        <td class="p-3 font-mono font-black text-amber-400 text-xs">${b.batch_number}</td>
        <td class="p-3 font-bold text-white">${b.product_name}</td>
        <td class="p-3 text-slate-400 text-xs">${b.category_sector}</td>
        <td class="p-3 font-mono font-black text-emerald-400">${b.quantity} ${b.unit_type || 'kg'}</td>
        <td class="p-3 font-semibold text-slate-200">${b.operator_name}</td>
        <td class="p-3 font-mono text-slate-400 text-xs">${startTime} a ${endTime} hs</td>
        <td class="p-3 text-right font-mono font-black text-purple-300">${durationText}</td>
      </tr>
    `;
  }).join('');
}

function updateLiveTimers() {
  const elements = document.querySelectorAll('.live-elapsed-timer');
  elements.forEach(elem => {
    const startStr = elem.getAttribute('data-start');
    if (startStr) {
      const diffSec = Math.max(0, Math.floor((new Date() - new Date(startStr)) / 1000));
      const min = Math.floor(diffSec / 60);
      const sec = diffSec % 60;
      elem.textContent = `${min} min ${sec < 10 ? '0' : ''}${sec} seg`;
    }
  });
}

function openNewBatchModal() {
  const modal = document.getElementById('new-batch-modal');
  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeNewBatchModal() {
  const modal = document.getElementById('new-batch-modal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

async function submitNewBatch(e) {
  e.preventDefault();
  const product_id = document.getElementById('batch-product-id').value;
  const category_sector = document.getElementById('batch-sector').value;
  const quantity = document.getElementById('batch-quantity').value;
  const operator_name = document.getElementById('batch-operator-name').value.trim();
  const pin = document.getElementById('batch-operator-pin').value.trim();
  const notes = document.getElementById('batch-notes').value.trim();

  if (!product_id || !quantity || !operator_name || !pin) {
    alert('Por favor completa todos los campos requeridos.');
    return;
  }

  try {
    const res = await fetch('/api/production/batches/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id, category_sector, quantity, operator_name, pin, notes })
    });
    const data = await res.json();
    if (data.success) {
      closeNewBatchModal();
      document.getElementById('new-batch-form').reset();
      await loadProductionData();
      alert(`✅ LOTE DE PRODUCCIÓN INICIADO:\n\nComanda #${data.batch.batch_number} para ${data.batch.product_name} (${data.batch.quantity} ${data.batch.unit_type}).`);
    } else {
      alert(`⚠️ ERROR AL INICIAR LOTE: ${data.error}`);
    }
  } catch (err) {
    console.error('Error al iniciar lote de producción:', err);
  }
}

async function finishBatch(batchId) {
  if (!confirm('¿Confirmas que el lote fue completado y listo para sumar al stock disponible?')) return;

  try {
    const res = await fetch(`/api/production/batches/${batchId}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.success) {
      await loadProductionData();
      alert(`🎉 LOTE CONCLUIDO Y CARGADO A STOCK:\n\nLote ${data.batch.batch_number}: Se sumaron ${data.batch.quantity} ${data.batch.unit_type} al stock disponible de ${data.batch.product_name}.`);
    } else {
      alert(`⚠️ ERROR: ${data.error}`);
    }
  } catch (err) {
    console.error('Error al finalizar lote:', err);
  }
}

function switchProductionTab(tab) {
  activeTab = tab;
  const viewActive = document.getElementById('view-active-production');
  const viewHistory = document.getElementById('view-history-production');
  const btnActive = document.getElementById('tab-btn-active');
  const btnHistory = document.getElementById('tab-btn-history');

  if (tab === 'active') {
    viewActive.classList.remove('hidden');
    viewHistory.classList.add('hidden');
    btnActive.className = 'flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black transition bg-amber-500 text-slate-950 shadow';
    btnHistory.className = 'flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black transition text-slate-400 hover:text-white hover:bg-slate-800';
  } else {
    viewActive.classList.add('hidden');
    viewHistory.classList.remove('hidden');
    btnActive.className = 'flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black transition text-slate-400 hover:text-white hover:bg-slate-800';
    btnHistory.className = 'flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black transition bg-amber-500 text-slate-950 shadow';
  }

  renderProductionView();
}

function setSectorFilter(sec) {
  sectorFilter = sec;

  ['all', 'cocina', 'bar', 'kilo'].forEach(s => {
    const btn = document.getElementById(`btn-sector-${s}`);
    if (btn) {
      if (s === sec) {
        btn.className = 'px-3 py-1.5 rounded-lg text-[11px] font-extrabold transition bg-slate-800 text-white border border-slate-700';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-[11px] font-bold transition text-slate-400 hover:text-white';
      }
    }
  });

  renderProductionView();
}
