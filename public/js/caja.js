const socket = io();
let orders = [];
let activeFilter = 'pending'; // 'pending' | 'paid' | 'all'

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupSocket();
});

function setupSocket() {
  socket.on('connect', () => {
    document.getElementById('socket-status').innerHTML = '🟢 En vivo';
    document.getElementById('socket-status').className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  });

  socket.on('disconnect', () => {
    document.getElementById('socket-status').innerHTML = '🔴 Desconectado';
    document.getElementById('socket-status').className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30';
  });

  socket.on('new_order', () => {
    loadData();
  });

  socket.on('order_updated', () => {
    loadData();
  });

  socket.on('cash_shift_updated', () => {
    loadCashSummary();
  });
}

let activeShiftsListCaja = [];

async function loadData() {
  await Promise.all([loadCashSummary(), loadOrders()]);
}

async function loadCashSummary() {
  try {
    const res = await fetch('/api/cash/summary');
    const data = await res.json();
    if (data.success) {
      const s = data.summary;
      activeShiftsListCaja = data.active_shifts || (data.active_shift ? [data.active_shift] : []);

      document.getElementById('cash-collected-val').textContent = formatCurrency(s.cash_collected);
      document.getElementById('cash-pending-val').textContent = formatCurrency(s.cash_pending);
      document.getElementById('card-total-val').textContent = formatCurrency(s.card_total);
      document.getElementById('digital-total-val').textContent = formatCurrency(s.digital_total);

      const badge = document.getElementById('shift-status-badge-caja');
      const btnOpen = document.getElementById('btn-open-shift-caja');
      const btnClose = document.getElementById('btn-close-shift-caja');

      if (activeShiftsListCaja.length > 0) {
        const boxSummaryStr = activeShiftsListCaja.map(s => `Caja N°${s.box_number || 1}: ${s.opened_by.split(' ')[0]}`).join(' | ');
        if (badge) {
          badge.textContent = `🟢 ${activeShiftsListCaja.length} Abierta(s) [${boxSummaryStr}]`;
          badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        }
        if (btnOpen) {
          btnOpen.disabled = false;
          btnOpen.className = 'px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition cursor-pointer';
          btnOpen.title = 'Abrir otra estación de caja (Caja N° 2, 3...)';
        }
        if (btnClose) {
          btnClose.disabled = false;
          btnClose.className = 'px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold border border-slate-600 transition cursor-pointer';
          btnClose.title = 'Cerrar una caja abierta';
        }
      } else {
        if (badge) {
          badge.textContent = `🔴 Sin Cajas Abiertas`;
          badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30';
        }
        if (btnOpen) {
          btnOpen.disabled = false;
          btnOpen.className = 'px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition cursor-pointer';
          btnOpen.title = 'Abrir turno de caja';
        }
        if (btnClose) {
          btnClose.disabled = true;
          btnClose.className = 'px-2.5 py-1 bg-slate-800 text-slate-500 rounded-lg text-xs font-bold border border-slate-700 opacity-50 cursor-not-allowed';
          btnClose.title = 'No hay turno de caja abierto para cerrar';
        }
      }
    }
  } catch (err) {
    console.error('Error al cargar métricas de caja:', err);
  }
}

async function loadOrders() {
  try {
    const res = await fetch('/api/orders');
    const data = await res.json();
    if (data.success) {
      orders = data.orders;
      renderOrders();
    }
  } catch (err) {
    console.error('Error al cargar pedidos:', err);
  }
}

function setFilter(filter) {
  activeFilter = filter;

  ['pending', 'paid', 'all'].forEach(f => {
    const btn = document.getElementById(`tab-${f}`);
    if (btn) {
      if (f === filter) {
        btn.className = 'tab-btn active bg-orange-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs whitespace-nowrap shadow transition flex items-center gap-1';
      } else {
        btn.className = 'tab-btn bg-slate-700 text-slate-300 font-bold px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition flex items-center gap-1';
      }
    }
  });

  renderOrders();
}

function renderOrders() {
  const container = document.getElementById('caja-orders-container');
  container.innerHTML = '';

  let pendingCount = 0;
  let paidCount = 0;

  orders.forEach(o => {
    if (o.paid === 1) paidCount++;
    else pendingCount++;
  });

  document.getElementById('count-pending').textContent = pendingCount;
  document.getElementById('count-paid').textContent = paidCount;

  let filtered = orders;
  if (activeFilter === 'pending') {
    filtered = orders.filter(o => o.paid === 0);
  } else if (activeFilter === 'paid') {
    filtered = orders.filter(o => o.paid === 1);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="py-12 text-center text-slate-400">
        <div class="text-3xl mb-2">💰</div>
        <p class="font-semibold text-sm">No hay pedidos en esta sección de caja.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(o => {
    const card = createCajaCard(o);
    container.appendChild(card);
  });

  lucide.createIcons();
}

function createCajaCard(order) {
  const card = document.createElement('div');
  const isPaid = order.paid === 1;

  card.className = `bg-slate-900 border ${isPaid ? 'border-emerald-500/40' : 'border-amber-500/50'} rounded-xl p-3.5 shadow-lg space-y-3`;

  const formattedPhone = formatWhatsAppNumber(order.customer_phone);

  let itemsSummary = '';
  if (Array.isArray(order.items)) {
    itemsSummary = order.items.map(i => `${i.qty}x ${i.name}`).join(', ');
  }

  card.innerHTML = `
    <!-- Cabecera -->
    <div class="flex justify-between items-start border-b border-slate-800 pb-2">
      <div>
        <span class="text-xs font-black font-mono text-orange-400 bg-orange-950/60 border border-orange-500/30 px-2 py-0.5 rounded-md">
          ${order.order_number}
        </span>
        <span class="ml-2 text-xs font-bold text-slate-300">
          ${order.delivery_type === 'delivery' ? '🛵 Delivery' : '🏪 Retiro'}
        </span>
      </div>
      <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${order.status === 'entregado' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}">
        ${order.status.toUpperCase()}
      </span>
    </div>

    <!-- Cliente y Dirección -->
    <div>
      <h4 class="font-black text-white text-base leading-tight">${order.customer_name}</h4>
      <p class="text-xs text-slate-400 mt-0.5">📞 ${formattedPhone || order.customer_phone}</p>
      ${order.address ? `<p class="text-xs text-amber-300 font-medium mt-1">📍 ${order.address}</p>` : ''}
    </div>

    <!-- Resumen de Ítems -->
    <div class="bg-slate-950 p-2 rounded-lg text-xs text-slate-300 line-clamp-2 border border-slate-800">
      <strong>Platos:</strong> ${itemsSummary}
    </div>

    <!-- Información de Cobro -->
    <div class="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
      <div class="flex justify-between items-center text-xs">
        <span class="text-slate-400">Método de Pago:</span>
        <span class="font-bold text-white">${order.payment_method} ${order.payment_note ? `(${order.payment_note})` : ''}</span>
      </div>
      <div class="flex justify-between items-center text-sm font-mono pt-1 border-t border-slate-800">
        <span class="font-bold text-slate-300">TOTAL A COBRAR:</span>
        <span class="font-black text-emerald-400 text-lg">${formatCurrency(order.total)}</span>
      </div>
    </div>

    <!-- Botón Principal de Acción de Caja -->
    <div>
      <button onclick="toggleCajaPaid(${order.id}, ${!isPaid})" class="w-full font-black py-3 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-lg ${isPaid ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/40' : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95'}">
        ${isPaid ? '✅ COBRADO EN CAJA (Tocar para desmarcar)' : `💰 CONFIRMAR INGRESO A CAJA (${formatCurrency(order.total)})`}
      </button>
    </div>

    <!-- Botones Secundarios -->
    <div class="grid grid-cols-2 gap-2 pt-1">
      <button onclick="printEpsonOrBrowser(${order.id})" class="bg-slate-700 hover:bg-slate-600 active:scale-95 text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1 transition">
        🖨️ Imprimir Epson
      </button>
      <button onclick="notifyCustomerWhatsApp(${order.id})" class="bg-emerald-600/80 hover:bg-emerald-600 active:scale-95 text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1 transition">
        💬 Avisar WhatsApp
      </button>
    </div>

    ${order.status !== 'entregado' ? `
      <div class="pt-1">
        <button onclick="markOrderDeliveredFromCaja(${order.id})" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold py-2 rounded-xl text-xs flex items-center justify-center gap-1 transition">
          ✅ Marcar como Entregado
        </button>
      </div>
    ` : ''}
  `;

  return card;
}

async function markOrderDeliveredFromCaja(orderId) {
  const order = orders.find(o => o.id === orderId);

  // Validación estricta: No se permite marcar como entregado si no ha ingresado a caja
  if (order && order.paid !== 1) {
    alert(`⚠️ ATENCIÓN CAJA:\n\nNo se puede marcar como ENTREGADO el pedido ${order.order_number} (${formatCurrency(order.total)}).\n\nPrimero debes presionar el botón "💰 CONFIRMAR INGRESO A CAJA" para registrar el dinero.`);
    return;
  }

  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'entregado' })
    });
    const data = await res.json();
    if (!data.success) {
      alert(`⚠️ ${data.error}`);
      return;
    }
    loadData();
  } catch (err) {
    console.error('Error al actualizar estado:', err);
  }
}

async function toggleCajaPaid(orderId, newPaidStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}/paid`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: newPaidStatus })
    });
    const data = await res.json();
    if (data.success) {
      loadData();
    }
  } catch (err) {
    console.error('Error al actualizar pago:', err);
  }
}

async function printEpsonOrBrowser(orderId) {
  try {
    const res = await fetch(`/api/print-epson/${orderId}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('🖨️ Comanda enviada a la impresora Epson');
      return;
    }
  } catch (e) {
    console.log('Error al imprimir por red...');
  }
}

function notifyCustomerWhatsApp(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  const msg = `👋 Hola ${order.customer_name}! Tu pedido *${order.order_number}* en La Gran Rotisería está listo.`;
  const phone = formatWhatsAppNumber(order.customer_phone);
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function formatWhatsAppNumber(phone) {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.length === 10 && !clean.startsWith('54')) clean = '549' + clean;
  else if (clean.length === 11 && clean.startsWith('0')) clean = '549' + clean.substring(1);
  return clean;
}

function formatCurrency(val) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
}

// Apertura / Cierre de Caja por Número (Nivel 2 o 3 en Celular 2)
function openOpenShiftModal() {
  document.getElementById('open-shift-form').reset();
  
  const selBox = document.getElementById('shift-box-number');
  if (selBox) {
    const openBoxNums = activeShiftsListCaja.map(s => s.box_number || 1);
    for (let opt of selBox.options) {
      const val = parseInt(opt.value);
      if (openBoxNums.includes(val)) {
        opt.disabled = true;
        opt.text = `Caja N° ${val} (⚠️ Ya abierta)`;
      } else {
        opt.disabled = false;
        opt.text = `Caja N° ${val} ${val === 1 ? '(Estación Principal)' : val === 2 ? '(Estación Secundaria)' : ''}`;
      }
    }
  }

  const modal = document.getElementById('open-shift-modal');
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeOpenShiftModal() {
  const modal = document.getElementById('open-shift-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

async function submitOpenShift(e) {
  e.preventDefault();
  const box_number = document.getElementById('shift-box-number').value;
  const initial_cash = document.getElementById('shift-initial-cash').value;
  const pin = document.getElementById('shift-open-pin').value.trim();

  try {
    const res = await fetch('/api/cash/shift/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ box_number, initial_cash, pin })
    });
    const data = await res.json();
    if (data.success) {
      closeOpenShiftModal();
      alert(`✅ Caja N° ${data.box_number} Abierta por "${data.user_name}" con cambio inicial de ${formatCurrency(initial_cash)}.`);
      await loadCashSummary();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al abrir caja:', err);
  }
}

function openCloseShiftModal() {
  if (activeShiftsListCaja.length === 0) {
    alert(`⚠️ NO SE PUEDE CERRAR CAJA: No hay ningún turno de caja abierto en este momento.`);
    return;
  }

  document.getElementById('close-shift-form').reset();

  const selCloseBox = document.getElementById('shift-close-box-id');
  if (selCloseBox) {
    selCloseBox.innerHTML = activeShiftsListCaja.map(s => 
      `<option value="${s.id}">Caja N° ${s.box_number || 1} - ${s.opened_by} (${formatCurrency(s.initial_cash || 0)} cambio)</option>`
    ).join('');
  }

  const modal = document.getElementById('close-shift-modal');
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeCloseShiftModal() {
  const modal = document.getElementById('close-shift-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

async function submitCloseShift(e) {
  e.preventDefault();
  const shift_id = document.getElementById('shift-close-box-id').value;
  const final_cash = document.getElementById('shift-final-cash').value;
  const pin = document.getElementById('shift-close-pin').value.trim();

  try {
    const res = await fetch('/api/cash/shift/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shift_id, final_cash, pin })
    });
    const data = await res.json();
    if (data.success) {
      closeCloseShiftModal();
      alert(`🔒 Caja N° ${data.box_number} Cerrada por "${data.user_name}" con saldo final de ${formatCurrency(final_cash)}.`);
      await loadCashSummary();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al cerrar caja:', err);
  }
}
