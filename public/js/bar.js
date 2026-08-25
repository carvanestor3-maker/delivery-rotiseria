const socket = io();
let orders = [];
let audioEnabled = true;
let activeMobileTab = 'bar_tickets';
let attendanceLogsList = [];
let activeStaffList = [];

document.addEventListener('DOMContentLoaded', () => {
  loadOrders();
  setupSocket();
  setInterval(updateTimers, 30000);
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
      renderKanban();
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
    renderKanban();
  });

  socket.on('attendance_updated', () => {
    if (document.getElementById('attendance-modal') && !document.getElementById('attendance-modal').classList.contains('pointer-events-none')) {
      loadAttendanceLogs();
    }
  });
}

async function loadOrders() {
  try {
    const res = await fetch('/api/orders');
    const data = await res.json();
    if (data.success) {
      orders = data.orders || [];
      renderKanban();
    }
  } catch (err) {
    console.error('Error al cargar comandas de bar:', err);
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

function renderKanban() {
  const containerBarTickets = document.getElementById('container-bar_tickets');
  const containerPrep = document.getElementById('container-prep');
  const containerReady = document.getElementById('container-ready');

  if (!containerBarTickets || !containerPrep || !containerReady) return;

  const barOrders = orders.filter(isBarOrder);

  const ticketsOrders = barOrders.filter(o => o.status === 'pending' || o.status === 'received' || String(o.order_number || '').startsWith('#BAR'));
  const prepOrders = barOrders.filter(o => o.status === 'preparing');
  const readyOrders = barOrders.filter(o => o.status === 'ready' || o.status === 'delivered');

  updateBadgeCount('bar_tickets', ticketsOrders.length);
  updateBadgeCount('prep', prepOrders.length);
  updateBadgeCount('ready', readyOrders.length);

  containerBarTickets.innerHTML = ticketsOrders.length === 0
    ? `<div class="p-6 text-center text-slate-500 font-bold text-xs italic">No hay tickets de barra pendientes.</div>`
    : ticketsOrders.map(o => renderBarCard(o, 'bar_tickets')).join('');

  containerPrep.innerHTML = prepOrders.length === 0
    ? `<div class="p-6 text-center text-slate-500 font-bold text-xs italic">No hay tragos/bebidas en preparación.</div>`
    : prepOrders.map(o => renderBarCard(o, 'prep')).join('');

  containerReady.innerHTML = readyOrders.length === 0
    ? `<div class="p-6 text-center text-slate-500 font-bold text-xs italic">No hay despachos recientes.</div>`
    : readyOrders.slice(0, 15).map(o => renderBarCard(o, 'ready')).join('');

  lucide.createIcons();
}

function renderBarCard(order, section) {
  const isTicketBar = String(order.order_number || '').startsWith('#BAR');
  const elapsedMin = getMinutesAgo(order.created_at);
  const isUrgent = elapsedMin > 10;

  const itemsHtml = Array.isArray(order.items) ? order.items.map(item => `
    <div class="flex justify-between items-center py-1 border-b border-slate-700/50 text-xs">
      <span class="font-extrabold text-white flex items-center gap-1.5">
        <span class="bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded font-mono font-black text-xs">${item.quantity || item.qty}x</span>
        ${item.name}
      </span>
      <span class="font-mono text-slate-400 text-[11px]">${formatCurrency((item.price || 0) * (item.quantity || item.qty))}</span>
    </div>
  `).join('') : '<div class="text-xs text-slate-400 italic">Sin detalle de ítems</div>';

  let actionButtonsHtml = '';
  if (section === 'bar_tickets') {
    actionButtonsHtml = `
      <button onclick="updateOrderStatus(${order.id}, 'preparing')" class="w-full py-2 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-extrabold rounded-xl text-xs shadow transition flex items-center justify-center gap-1">
        🍹 Iniciar Preparación Bar
      </button>
      <button onclick="updateOrderStatus(${order.id}, 'ready')" class="w-full py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold rounded-xl text-xs shadow transition flex items-center justify-center gap-1 mt-1.5">
        ✅ Despachar Directo en Barra
      </button>
    `;
  } else if (section === 'prep') {
    actionButtonsHtml = `
      <button onclick="updateOrderStatus(${order.id}, 'ready')" class="w-full py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold rounded-xl text-xs shadow transition flex items-center justify-center gap-1">
        ✅ Listo para Entregar en Barra
      </button>
    `;
  } else {
    actionButtonsHtml = `
      <div class="text-center text-[11px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 py-1.5 rounded-xl">
        ✓ Entregado en Barra
      </div>
    `;
  }

  return `
    <div class="bg-slate-800 rounded-2xl border ${isTicketBar ? 'border-purple-500/50 shadow-purple-900/20' : isUrgent ? 'border-red-500/70 shadow-red-900/20' : 'border-slate-700'} p-4 shadow-lg space-y-3">
      <div class="flex justify-between items-start border-b border-slate-700 pb-2">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-base font-black font-mono ${isTicketBar ? 'text-purple-400' : 'text-amber-400'}">${order.order_number}</span>
            ${isTicketBar ? '<span class="bg-purple-500/30 text-purple-300 border border-purple-500/50 text-[10px] font-black px-2 py-0.5 rounded-full">🎫 Ficha #BAR</span>' : ''}
          </div>
          <div class="text-xs font-bold text-slate-300 mt-0.5">👤 ${order.customer_name || 'Cliente Barra'}</div>
        </div>
        <div class="text-right">
          <span class="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${isUrgent ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse' : 'bg-slate-700 text-slate-300'}">
            ⏱️ ${elapsedMin} min
          </span>
        </div>
      </div>

      <div class="space-y-1">
        ${itemsHtml}
      </div>

      ${order.notes ? `<div class="bg-slate-900/60 p-2 rounded-lg text-[11px] text-amber-300 font-semibold border border-amber-500/20">📝 ${order.notes}</div>` : ''}

      <div class="pt-1">
        ${actionButtonsHtml}
      </div>
    </div>
  `;
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      await loadOrders();
    }
  } catch (err) {
    console.error('Error al actualizar estado en Bar:', err);
  }
}

function updateBadgeCount(colId, count) {
  const elem = document.getElementById(`count-${colId}`);
  const melem = document.getElementById(`mcount-${colId}`);
  if (elem) elem.textContent = count;
  if (melem) melem.textContent = count;
}

function setMobileTab(tab) {
  activeMobileTab = tab;
  const colBar = document.getElementById('col-bar_tickets');
  const colPrep = document.getElementById('col-prep');
  const colReady = document.getElementById('col-ready');

  const mbtnBar = document.getElementById('mtab-bar_tickets');
  const mbtnPrep = document.getElementById('mtab-prep');
  const mbtnReady = document.getElementById('mtab-ready');

  if (colBar) colBar.className = tab === 'bar_tickets' ? 'flex flex-col bg-slate-800/50 rounded-2xl border border-purple-500/30 overflow-hidden shadow-inner' : 'hidden sm:flex flex-col bg-slate-800/50 rounded-2xl border border-purple-500/30 overflow-hidden shadow-inner';
  if (colPrep) colPrep.className = tab === 'prep' ? 'flex flex-col bg-slate-800/50 rounded-2xl border border-amber-500/30 overflow-hidden shadow-inner' : 'hidden sm:flex flex-col bg-slate-800/50 rounded-2xl border border-amber-500/30 overflow-hidden shadow-inner';
  if (colReady) colReady.className = tab === 'ready' ? 'flex flex-col bg-slate-800/50 rounded-2xl border border-emerald-500/30 overflow-hidden shadow-inner' : 'hidden sm:flex flex-col bg-slate-800/50 rounded-2xl border border-emerald-500/30 overflow-hidden shadow-inner';

  if (mbtnBar) mbtnBar.className = tab === 'bar_tickets' ? 'flex-1 py-1.5 px-2 rounded-lg text-xs font-black bg-purple-600 text-white transition text-center shadow' : 'flex-1 py-1.5 px-2 rounded-lg text-xs font-black bg-slate-700 text-slate-300 transition text-center';
  if (mbtnPrep) mbtnPrep.className = tab === 'prep' ? 'flex-1 py-1.5 px-2 rounded-lg text-xs font-black bg-purple-600 text-white transition text-center shadow' : 'flex-1 py-1.5 px-2 rounded-lg text-xs font-black bg-slate-700 text-slate-300 transition text-center';
  if (mbtnReady) mbtnReady.className = tab === 'ready' ? 'flex-1 py-1.5 px-2 rounded-lg text-xs font-black bg-purple-600 text-white transition text-center shadow' : 'flex-1 py-1.5 px-2 rounded-lg text-xs font-black bg-slate-700 text-slate-300 transition text-center';
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

function getMinutesAgo(dateStr) {
  if (!dateStr) return 0;
  const diffMs = new Date() - new Date(dateStr);
  return Math.floor(diffMs / 60000);
}

function updateTimers() {
  renderKanban();
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
