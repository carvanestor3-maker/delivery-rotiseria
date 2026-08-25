const socket = io();
let orders = [];
let audioEnabled = true;
let activeTab = 'pending';
let attendanceLogsList = [];
let activeStaffList = [];
let liveTimerInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  loadOrders();
  loadAttendanceLogs();
  loadBarShift();
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

  socket.on('new_order', (newOrder) => {
    const exists = orders.some(o => o.id === newOrder.id);
    if (!exists) {
      orders.unshift(newOrder);
      renderBarView();
      playNotificationSound();
    }
  });

  socket.on('order_updated', (updatedOrder) => {
    const idx = orders.findIndex(o => o.id === updatedOrder.id);
    if (idx !== -1) {
      orders[idx] = updatedOrder;
    } else {
      orders.unshift(updatedOrder);
    }
    renderBarView();
  });

  socket.on('attendance_updated', () => {
    loadAttendanceLogs();
  });

  socket.on('bar_shift_updated', () => {
    loadBarShift();
  });
}

async function loadOrders() {
  try {
    const res = await fetch('/api/orders');
    const data = await res.json();
    if (data.success) {
      orders = data.orders || [];
      renderBarView();
    }
  } catch (err) {
    console.error('Error al cargar pedidos de bar:', err);
  }
}

function isBarItem(item) {
  if (!item) return false;
  const cat = (item.category_name || item.category || '').toLowerCase();
  const name = (item.name || '').toLowerCase();

  return cat.includes('bar') || cat.includes('cafet') || cat.includes('bebida') || cat.includes('trago') || cat.includes('licuado') ||
         name.includes('café') || name.includes('cafe') || name.includes('licuado') || name.includes('jugo') ||
         name.includes('gaseosa') || name.includes('cerveza') || name.includes('trago') || name.includes('licor') ||
         name.includes('tostado') || name.includes('media luna') || name.includes('medialuna');
}

function isBarOrder(order) {
  if (!order) return false;
  if (order.order_number && String(order.order_number).startsWith('#BAR')) return true;
  if (order.notes && String(order.notes).includes('Ficha #BAR')) return true;
  if (Array.isArray(order.items) && order.items.some(isBarItem)) return true;
  return false;
}

function renderBarView() {
  const barOrders = orders.filter(isBarOrder);

  const pendingOrders = barOrders.filter(o => o.status !== 'ready' && o.status !== 'delivered');
  const historyOrders = barOrders.filter(o => o.status === 'ready' || o.status === 'delivered');

  updateMetrics(pendingOrders, historyOrders);

  if (activeTab === 'pending') {
    renderPendingBarGrid(pendingOrders);
  } else {
    renderBarHistoryTable(historyOrders);
  }

  lucide.createIcons();
}

function updateMetrics(pendingOrders, historyOrders) {
  const elemPending = document.getElementById('metric-pending-count');
  const elemDelivered = document.getElementById('metric-delivered-count');
  const elemAvgTime = document.getElementById('metric-avg-time');
  const elemBarista = document.getElementById('metric-active-barista');

  if (elemPending) elemPending.textContent = pendingOrders.length;
  if (elemDelivered) elemDelivered.textContent = historyOrders.length;

  if (elemAvgTime) {
    if (historyOrders.length === 0) {
      elemAvgTime.textContent = '0.0 min';
    } else {
      let totalSecs = 0;
      let countSecs = 0;
      historyOrders.forEach(o => {
        const start = new Date(o.created_at);
        const end = o.delivered_at ? new Date(o.delivered_at) : new Date(o.updated_at || o.created_at);
        const diffSec = Math.max(0, Math.floor((end - start) / 1000));
        totalSecs += diffSec;
        countSecs++;
      });
      const avgMin = countSecs > 0 ? (totalSecs / countSecs / 60).toFixed(1) : '0.0';
      elemAvgTime.textContent = `${avgMin} min`;
    }
  }

  if (elemBarista) {
    const barStaff = activeStaffList.filter(s => (s.sector || '').toLowerCase().includes('bar') || (s.sector || '').toLowerCase().includes('cafet'));
    if (barStaff.length > 0) {
      elemBarista.textContent = `${barStaff.length} activo(s): ${barStaff.map(s => s.user_name).join(', ')}`;
    } else if (activeBarShift) {
      elemBarista.textContent = `Apertura: ${activeBarShift.barista_name}`;
    } else {
      elemBarista.textContent = 'Sin baristas fichados';
    }
  }
}

function renderPendingBarGrid(pendingOrders) {
  const container = document.getElementById('bar-pending-grid');
  if (!container) return;

  if (pendingOrders.length === 0) {
    container.innerHTML = `<div class="col-span-full p-12 text-center text-slate-500 font-bold text-sm bg-slate-800/40 rounded-2xl border border-slate-700">☕ No hay tickets de bar pendientes de despacho en este momento.</div>`;
    return;
  }

  container.innerHTML = pendingOrders.map(o => {
    const isTicketBar = String(o.order_number || '').startsWith('#BAR');
    const inTime = o.created_at ? new Date(o.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
    
    const itemsHtml = Array.isArray(o.items) ? o.items.map(i => `
      <div class="flex justify-between items-center py-1 border-b border-slate-700/50 text-xs">
        <span class="font-black text-white flex items-center gap-1.5">
          <span class="bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded font-mono font-black text-xs">${i.quantity || i.qty}x</span>
          ${i.name}
        </span>
        <span class="font-mono text-slate-400 text-[11px]">${formatCurrency((i.price || 0) * (i.quantity || i.qty))}</span>
      </div>
    `).join('') : '<div class="text-xs text-slate-400 italic">Sin detalle</div>';

    return `
      <div class="bg-slate-800 rounded-2xl border ${isTicketBar ? 'border-purple-500/50 shadow-purple-900/20' : 'border-slate-700'} p-4 shadow-xl space-y-3">
        <div class="flex justify-between items-start border-b border-slate-700 pb-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-lg font-black font-mono ${isTicketBar ? 'text-purple-400' : 'text-amber-400'}">${o.order_number}</span>
              ${isTicketBar ? '<span class="bg-purple-500/30 text-purple-300 border border-purple-500/50 text-[10px] font-black px-2 py-0.5 rounded-full">🎫 Ficha Barra</span>' : ''}
            </div>
            <div class="text-xs font-bold text-slate-300 mt-0.5">👤 ${o.customer_name || 'Cliente Barra'}</div>
          </div>
          <div class="text-right">
            <div class="text-[10px] text-slate-400 font-bold">HORA INGRESO</div>
            <div class="text-xs font-mono font-black text-slate-200">${inTime} hs</div>
          </div>
        </div>

        <div class="space-y-1">
          ${itemsHtml}
        </div>

        <!-- RELOJ TRANSCRURRIDO EN VIVO -->
        <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700 flex justify-between items-center">
          <span class="text-[11px] font-extrabold text-slate-400">⏱️ Tiempo Transcurrido:</span>
          <span class="live-elapsed-timer font-mono font-black text-sm text-amber-400" data-start="${o.created_at}">Calculando...</span>
        </div>

        ${o.notes ? `<div class="bg-slate-900/60 p-2 rounded-lg text-[11px] text-amber-300 font-semibold border border-amber-500/20">📝 ${o.notes}</div>` : ''}

        <button onclick="deliverBarOrder(${o.id})" class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold rounded-xl text-xs shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer">
          ☕ MARCAR ENTREGADO EN BARRA
        </button>
      </div>
    `;
  }).join('');

  updateLiveTimers();
}

function renderBarHistoryTable(historyOrders) {
  const tbody = document.getElementById('bar-history-tbody');
  if (!tbody) return;

  if (historyOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-500 font-bold text-xs">No hay entregas registradas en la bitácora hoy.</td></tr>`;
    return;
  }

  tbody.innerHTML = historyOrders.map(o => {
    const isTicketBar = String(o.order_number || '').startsWith('#BAR');
    const inTime = o.created_at ? new Date(o.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
    const outTime = o.delivered_at ? new Date(o.delivered_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : o.updated_at ? new Date(o.updated_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';

    const start = new Date(o.created_at);
    const end = o.delivered_at ? new Date(o.delivered_at) : new Date(o.updated_at || o.created_at);
    const diffSec = Math.max(0, Math.floor((end - start) / 1000));
    
    const minutes = Math.floor(diffSec / 60);
    const seconds = diffSec % 60;
    const durationText = `${minutes} min ${seconds} seg`;

    let timeBadgeClass = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    if (minutes >= 10) {
      timeBadgeClass = 'bg-red-500/20 text-red-400 border-red-500/40';
    } else if (minutes >= 5) {
      timeBadgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    }

    const itemsSummary = Array.isArray(o.items) ? o.items.map(i => `${i.quantity || i.qty}x ${i.name}`).join(', ') : 'Detalle no disponible';

    return `
      <tr class="hover:bg-slate-800/60 transition">
        <td class="p-3 font-mono font-black ${isTicketBar ? 'text-purple-400' : 'text-amber-400'} text-xs">
          ${o.order_number} ${isTicketBar ? '<span class="bg-purple-500/20 text-purple-300 text-[10px] px-1.5 py-0.2 rounded font-mono">Ficha</span>' : ''}
        </td>
        <td class="p-3 text-xs">
          <div class="font-extrabold text-slate-100">${o.customer_name || 'Cliente Barra'}</div>
          <div class="text-[11px] text-slate-400 line-clamp-1">${itemsSummary}</div>
        </td>
        <td class="p-3 font-mono text-xs font-bold text-slate-300">${inTime} hs</td>
        <td class="p-3 font-mono text-xs font-bold text-emerald-400">${outTime} hs</td>
        <td class="p-3 text-right">
          <span class="px-2.5 py-1 rounded-lg border font-mono font-black text-xs ${timeBadgeClass}">
            ⏱️ ${durationText}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

async function deliverBarOrder(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ready', delivered_at: new Date().toISOString() })
    });
    const data = await res.json();
    if (data.success) {
      await loadOrders();
    }
  } catch (err) {
    console.error('Error al entregar pedido en Bar:', err);
  }
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

function switchBarTab(tab) {
  activeTab = tab;
  const viewPending = document.getElementById('view-pending');
  const viewHistory = document.getElementById('view-history');
  const btnPending = document.getElementById('tab-btn-pending');
  const btnHistory = document.getElementById('tab-btn-history');

  if (tab === 'pending') {
    viewPending.classList.remove('hidden');
    viewHistory.classList.add('hidden');
    btnPending.className = 'pb-2.5 border-b-2 border-purple-500 text-purple-400 font-extrabold text-xs flex items-center gap-1.5';
    btnHistory.className = 'pb-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200 font-bold text-xs flex items-center gap-1.5';
  } else {
    viewPending.classList.add('hidden');
    viewHistory.classList.remove('hidden');
    btnPending.className = 'pb-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200 font-bold text-xs flex items-center gap-1.5';
    btnHistory.className = 'pb-2.5 border-b-2 border-purple-500 text-purple-400 font-extrabold text-xs flex items-center gap-1.5';
  }

  renderBarView();
}

function playNotificationSound() {
  if (!audioEnabled) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) {}
}

function toggleAudio() {
  audioEnabled = !audioEnabled;
  const btn = document.getElementById('sound-btn');
  if (btn) {
    btn.innerHTML = audioEnabled 
      ? `<i data-lucide="volume-2" class="w-4 h-4 text-emerald-400"></i><span class="hidden sm:inline">Sonido</span>`
      : `<i data-lucide="volume-x" class="w-4 h-4 text-red-400"></i><span class="hidden sm:inline">Silenciado</span>`;
    lucide.createIcons();
  }
}

function formatCurrency(val) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val || 0);
}

// ==========================================
// FICHAJE DE ASISTENCIA (BAR)
// ==========================================

async function openAttendanceModal() {
  const modal = document.getElementById('attendance-modal');
  const pinInput = document.getElementById('att-pin-input');
  if (pinInput) pinInput.value = '';

  await loadAttendanceLogs();
  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeAttendanceModal() {
  const modal = document.getElementById('attendance-modal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

async function loadAttendanceLogs() {
  try {
    const res = await fetch('/api/attendance/logs');
    const data = await res.json();
    if (data.success) {
      attendanceLogsList = data.logs || [];
      activeStaffList = data.active_staff || [];
      renderAttendanceHistory();
    }
  } catch (err) {
    console.error('Error al cargar asistencia:', err);
  }
}

function renderAttendanceHistory() {
  const tbody = document.getElementById('attendance-history-tbody');
  const countElem = document.getElementById('active-staff-count');

  if (countElem) {
    const names = activeStaffList.map(s => s.user_name).join(', ');
    countElem.textContent = activeStaffList.length > 0
      ? `${activeStaffList.length} (${names})`
      : '0 operarios (Nadie en turno activo)';
  }

  if (!tbody) return;
  tbody.innerHTML = '';

  if (attendanceLogsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400 text-xs">No hay fichajes de asistencia registrados en el sistema.</td></tr>`;
    return;
  }

  attendanceLogsList.forEach(l => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';

    const inStr = l.clock_in ? new Date(l.clock_in).toLocaleString('es-AR') : '-';
    const outStr = l.clock_out ? new Date(l.clock_out).toLocaleString('es-AR') : '-';
    const isActive = l.status === 'active';

    const hoursText = isActive
      ? '<span class="text-emerald-600 font-extrabold flex items-center justify-end gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span> En curso</span>'
      : `<span class="font-mono font-black text-slate-900 text-sm">${l.hours_worked || 0} hs</span>`;

    tr.innerHTML = `
      <td class="p-3 font-bold text-slate-900">
        <div class="flex items-center gap-1.5">${l.user_name || 'Empleado'} <span class="bg-purple-100 text-purple-900 px-2 py-0.5 rounded text-[10px] font-black">${l.sector || 'General'}</span></div>
        <div class="text-[10px] text-slate-400 font-normal">Nivel ${l.level || 1}</div>
      </td>
      <td class="p-3">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${isActive ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-700 border border-slate-200'}">
          ${isActive ? '🟢 En Turno Activo' : '🔴 Salida Completada'}
        </span>
      </td>
      <td class="p-3 font-mono text-slate-600">${inStr}</td>
      <td class="p-3 font-mono text-slate-600">${outStr}</td>
      <td class="p-3 text-right font-bold">${hoursText}</td>
    `;

    tbody.appendChild(tr);
  });
}

async function submitClockIn() {
  const pinInput = document.getElementById('att-pin-input');
  const sectorInput = document.getElementById('att-sector-input');
  const pin = pinInput ? pinInput.value.trim() : '';
  const sector = sectorInput ? sectorInput.value : '☕ Bar & Cafetería';

  if (!pin) {
    alert('⚠️ Por favor ingresa tu PIN personal para marcar entrada.');
    if (pinInput) pinInput.focus();
    return;
  }

  try {
    const res = await fetch('/api/attendance/clock-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, sector })
    });
    const data = await res.json();
    if (data.success) {
      if (pinInput) pinInput.value = '';
      const inTime = new Date(data.log.clock_in).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      alert(`🟢 INGRESO REGISTRADO CON ÉXITO!\n\nBienvenido/a: ${data.user_name}\nSector / Área: ${sector}\nHora de entrada: ${inTime} hs.`);
      await loadAttendanceLogs();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al fichar entrada:', err);
  }
}

async function submitClockOut() {
  const pinInput = document.getElementById('att-pin-input');
  const pin = pinInput ? pinInput.value.trim() : '';

  if (!pin) {
    alert('⚠️ Por favor ingresa tu PIN personal para marcar salida.');
    if (pinInput) pinInput.focus();
    return;
  }

  try {
    const res = await fetch('/api/attendance/clock-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (data.success) {
      if (pinInput) pinInput.value = '';
      const outTime = new Date(data.log.clock_out).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      alert(`🔴 SALIDA DE TURNO REGISTRADA CON ÉXITO!\n\nHasta luego: ${data.user_name}\nHora de salida: ${outTime} hs.\nHoras totales trabajadas: ${data.hours_worked} hs.`);
      await loadAttendanceLogs();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al fichar salida:', err);
  }
}

// ==========================================
// APERTURA Y CIERRE DE TURNO DE BAR & CAFETERÍA
// ==========================================

let activeBarShift = null;

async function loadBarShift() {
  try {
    const res = await fetch('/api/bar/shift');
    const data = await res.json();
    if (data.success) {
      activeBarShift = data.active_shift;
      renderBarShiftButton();
    }
  } catch (err) {
    console.error('Error al cargar turno de bar:', err);
  }
}

function renderBarShiftButton() {
  const btn = document.getElementById('btn-bar-shift');
  const btnText = document.getElementById('bar-shift-btn-text');
  if (!btn || !btnText) return;

  if (activeBarShift) {
    btnText.textContent = `☕ Sector Bar: 🟢 Abierto`;
    btn.className = 'px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-black flex items-center gap-1 text-white shadow transition cursor-pointer';
    btn.title = `Estación de Bar Abierta. Responsable Apertura: ${activeBarShift.barista_name}. Clic para cerrar la estación.`;
  } else {
    btnText.textContent = `🔴 Abrir Sector Bar`;
    btn.className = 'px-2.5 py-1.5 bg-purple-700 hover:bg-purple-600 rounded-xl text-xs font-black flex items-center gap-1 text-white shadow transition cursor-pointer';
    btn.title = `Estación de Bar Cerrada. Clic para abrir.`;
  }
}

function openBarShiftModal() {
  const modal = document.getElementById('bar-shift-modal');
  const title = document.getElementById('bar-shift-title');
  const openFields = document.getElementById('bar-shift-open-fields');
  const submitBtn = document.getElementById('bar-shift-submit-btn');

  document.getElementById('bar-shift-form').reset();

  if (activeBarShift) {
    if (title) title.textContent = `🔒 Cerrar Turno de Bar (Barista: ${activeBarShift.barista_name})`;
    if (openFields) openFields.classList.add('hidden');
    if (submitBtn) {
      submitBtn.textContent = '🔒 Confirmar Cierre de Bar';
      submitBtn.className = 'flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white font-extrabold rounded-xl text-xs shadow';
    }
  } else {
    if (title) title.textContent = '☕ Apertura de Turno de Bar & Cafetería';
    if (openFields) openFields.classList.remove('hidden');
    if (submitBtn) {
      submitBtn.textContent = '🟢 Confirmar Apertura de Bar';
      submitBtn.className = 'flex-1 py-2 bg-purple-700 hover:bg-purple-800 text-white font-extrabold rounded-xl text-xs shadow';
    }
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeBarShiftModal() {
  const modal = document.getElementById('bar-shift-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

async function submitBarShift(e) {
  e.preventDefault();
  const pin = document.getElementById('barista-pin-input').value.trim();

  if (activeBarShift) {
    try {
      const res = await fetch('/api/bar/shift/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (data.success) {
        closeBarShiftModal();
        alert(`🔒 TURNO DE BAR CERRADO CON ÉXITO!\n\nBarista: ${data.shift.barista_name}\nCerrado por: ${data.user_name}`);
        await loadBarShift();
      } else {
        alert(`⚠️ ${data.error}`);
      }
    } catch (err) {
      console.error('Error al cerrar turno de bar:', err);
    }
  } else {
    const barista_name = document.getElementById('barista-name-input').value.trim();
    const shift_name = document.getElementById('barista-shift-name').value;

    if (!barista_name) {
      alert('⚠️ Por favor ingresa el nombre del Barista a cargo.');
      document.getElementById('barista-name-input').focus();
      return;
    }

    try {
      const res = await fetch('/api/bar/shift/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barista_name, shift_name, pin })
      });
      const data = await res.json();
      if (data.success) {
        closeBarShiftModal();
        alert(`🟢 TURNO DE BAR ABIERTO CON ÉXITO!\n\nBarista a cargo: ${data.shift.barista_name}\nTurno: ${data.shift.shift_name}\nAutorizado por: ${data.user_name}`);
        await loadBarShift();
      } else {
        alert(`⚠️ ${data.error}`);
      }
    } catch (err) {
      console.error('Error al abrir turno de bar:', err);
    }
  }
}
