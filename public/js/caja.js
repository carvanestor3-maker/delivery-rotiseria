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
        const boxSummaryStr = activeShiftsListCaja.map(s => `Caja N°${s.box_number || 1}: ${s.cashier_name || s.opened_by.split(' ')[0]}`).join(' | ');
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
  const cashier_name = document.getElementById('shift-cashier-name').value.trim();
  const enableWeighed = document.getElementById('shift-enable-weighed') ? document.getElementById('shift-enable-weighed').checked : false;
  const shift_type = enableWeighed ? 'weighed_food' : 'standard';
  const initial_cash = document.getElementById('shift-initial-cash').value;
  const pin = document.getElementById('shift-open-pin').value.trim();

  try {
    const res = await fetch('/api/cash/shift/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ box_number, cashier_name, shift_type, initial_cash, pin })
    });
    const data = await res.json();
    if (data.success) {
      closeOpenShiftModal();
      const typeLabel = data.shift.shift_type === 'weighed_food' 
        ? '✅ Standard + ⚖️ Mostrador de Comida a la Balanza por Kilo' 
        : '✅ Standard (🍕 Comandas/Delivery + ☕ Ticket de Bar + 📦 Escáner Envasados)';
      alert(`✅ Caja N° ${data.box_number} Abierta con éxito:\n\nCajero Asignado: ${data.cashier_name}\nOperatorias Habilitadas: ${typeLabel}\nAutorizado por: ${data.user_name}\nCambio Inicial: ${formatCurrency(initial_cash)}`);
      await loadCashSummary();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al abrir caja:', err);
  }
}

function handleCloseShiftBoxChange() {
  const selCloseBox = document.getElementById('shift-close-box-id');
  const wasteContainer = document.getElementById('close-shift-waste-container');
  if (!selCloseBox || !wasteContainer) return;

  const selectedShiftId = selCloseBox.value;
  const activeShift = activeShiftsListCaja.find(s => String(s.id) === String(selectedShiftId));

  if (activeShift && activeShift.shift_type === 'weighed_food') {
    wasteContainer.parentElement.classList.remove('hidden');
  } else {
    wasteContainer.parentElement.classList.add('hidden');
  }
}

async function openCloseShiftModal() {
  if (activeShiftsListCaja.length === 0) {
    alert(`⚠️ NO SE PUEDE CERRAR CAJA: No hay ningún turno de caja abierto en este momento.`);
    return;
  }

  document.getElementById('close-shift-form').reset();

  const selCloseBox = document.getElementById('shift-close-box-id');
  if (selCloseBox) {
    selCloseBox.onchange = handleCloseShiftBoxChange;
    selCloseBox.innerHTML = activeShiftsListCaja.map(s => {
      const typeTag = s.shift_type === 'weighed_food' ? '⚖️ Balanza' : s.shift_type === 'pre_packaged' ? '📦 Envasados' : s.shift_type === 'bar_ticket' ? '☕ Bar (Ticket Retiro)' : '🍕 Comandas';
      return `<option value="${s.id}">Caja N° ${s.box_number || 1} [${typeTag}] - Cajero: ${s.cashier_name || 'Sin asignar'} - ${formatCurrency(s.initial_cash || 0)} cambio</option>`;
    }).join('');
    handleCloseShiftBoxChange();
  }

  const wasteContainer = document.getElementById('close-shift-waste-container');
  if (wasteContainer) {
    if (posProducts.length === 0) {
      try {
        const res = await fetch('/api/menu');
        const data = await res.json();
        if (data.success) posProducts = data.products || [];
      } catch (err) {}
    }

    const preparedItems = posProducts.filter(p => p.unit_type === 'kg' || p.is_prepared_food === 1);
    if (preparedItems.length === 0) {
      wasteContainer.innerHTML = `<div class="text-[11px] text-amber-700 italic">No hay productos por kilo configurados.</div>`;
    } else {
      wasteContainer.innerHTML = preparedItems.map(p => `
        <div class="bg-white p-2.5 rounded-xl border border-amber-200 text-xs space-y-2">
          <div class="flex justify-between items-center">
            <div class="font-extrabold text-slate-900">
              <div>${p.name}</div>
              <div class="text-[10px] text-slate-400 font-mono font-normal">Stock teórico actual: ${(p.stock_prepared || 0).toFixed(3)} kg</div>
            </div>
            <div class="flex items-center gap-1">
              <input type="number" step="0.001" data-prod-id="${p.id}" placeholder="${(p.stock_prepared || 0).toFixed(3)}" class="shift-waste-input w-24 px-2 py-1 border border-slate-300 rounded-lg text-xs font-mono font-bold text-right outline-none focus:ring-2 focus:ring-amber-500">
              <span class="text-[10px] font-bold text-slate-500">kg sobrantes</span>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100">
            <div>
              <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Destino del Sobrante</label>
              <select data-prod-id="${p.id}" onchange="toggleShiftWasteFields(this)" class="shift-waste-action w-full px-2 py-1 border border-slate-300 rounded-lg text-[11px] font-bold outline-none focus:ring-2 focus:ring-amber-500 bg-white">
                <option value="offer">🏷️ Oferta Refrigerada (% OFF + EAN-13)</option>
                <option value="reprocess">♻️ Reprocesar en Cocina (Desc. 100%)</option>
                <option value="waste">🗑️ Dar de Baja por Desperdicio</option>
              </select>
            </div>

            <div id="fields-offer-${p.id}" class="grid grid-cols-2 gap-1">
              <div>
                <label class="block text-[10px] font-bold text-slate-600 mb-0.5">% Desc.</label>
                <input type="number" value="30" data-prod-id="${p.id}" class="shift-waste-discount w-full px-1.5 py-1 border border-slate-300 rounded-lg text-xs font-mono font-bold">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Frío (hs)</label>
                <input type="number" value="4" data-prod-id="${p.id}" class="shift-waste-hours w-full px-1.5 py-1 border border-slate-300 rounded-lg text-xs font-mono font-bold">
              </div>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  const modal = document.getElementById('close-shift-modal');
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function toggleShiftWasteFields(selectElem) {
  const prodId = selectElem.getAttribute('data-prod-id');
  const action = selectElem.value;
  const offerFields = document.getElementById(`fields-offer-${prodId}`);

  if (offerFields) {
    if (action === 'offer') {
      offerFields.classList.remove('hidden');
    } else {
      offerFields.classList.add('hidden');
    }
  }
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

  // Recolectar datos del triple destino
  const wasteInputs = document.querySelectorAll('.shift-waste-input');
  const measuredItems = [];

  wasteInputs.forEach(inp => {
    const val = inp.value.trim();
    if (val !== '') {
      const prodId = inp.getAttribute('data-prod-id');
      const actionSelect = document.querySelector(`.shift-waste-action[data-prod-id="${prodId}"]`);
      const discountInp = document.querySelector(`.shift-waste-discount[data-prod-id="${prodId}"]`);
      const hoursInp = document.querySelector(`.shift-waste-hours[data-prod-id="${prodId}"]`);

      measuredItems.push({
        product_id: parseInt(prodId),
        measured_remaining: parseFloat(val),
        action: actionSelect ? actionSelect.value : 'offer',
        discount_percent: discountInp ? parseFloat(discountInp.value || 30) : 30,
        refrigerated_hours: hoursInp ? parseInt(hoursInp.value || 4) : 4
      });
    }
  });

  try {
    const activeShift = activeShiftsListCaja.find(s => String(s.id) === String(shift_id));
    const boxNum = activeShift ? (activeShift.box_number || 1) : 1;

    let eanLogText = '';

    if (measuredItems.length > 0) {
      const recRes = await fetch('/api/cash/shift/reconcile-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ box_number: boxNum, measured_items: measuredItems, pin })
      });
      const recData = await recRes.json();
      if (recData.success && recData.waste_logs) {
        const offersCreated = recData.waste_logs.filter(w => w.action === 'offer');
        if (offersCreated.length > 0) {
          eanLogText = '\n\n🏷️ ETIQUETAS EAN-13 GENERADAS PARA BALANZA:\n' + offersCreated.map(o => `• ${o.product_name}: EAN Barcode -> ${o.scale_ean} ($${o.offer_price}/kg)`).join('\n');
        }
      }
    }

    const res = await fetch('/api/cash/shift/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shift_id, final_cash, pin })
    });
    const data = await res.json();
    if (data.success) {
      closeCloseShiftModal();
      alert(`🔒 Caja N° ${data.box_number} Cerrada por "${data.user_name}" con saldo final de ${formatCurrency(final_cash)}.${eanLogText}`);
      await loadCashSummary();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al cerrar caja:', err);
  }
}

// ==========================================
// MÓDULO POS: VENTA DIRECTA / ESCÁNER / BALANZA
// ==========================================

let posProducts = [];
let posCategories = [];
let posCart = [];
let selectedPosCategory = 'all';

function playBeepSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {}
}

async function openPosModal() {
  try {
    const res = await fetch('/api/menu');
    const data = await res.json();
    if (data.success) {
      posProducts = data.products || [];
      posCategories = data.categories || [];
    }
  } catch (err) {
    console.error('Error al cargar catálogo POS:', err);
  }

  // VALIDACIÓN 1: Verificar si el turno actual operó Comida por Kilo
  const btnWeighed = document.getElementById('pos-sec-weighed');
  const operatesWeighed = activeShiftsListCaja.some(s => s.shift_type === 'weighed_food');

  if (btnWeighed) {
    if (operatesWeighed) {
      btnWeighed.classList.remove('hidden');
    } else {
      btnWeighed.classList.add('hidden'); // Ocultar si la caja no operó comida por kilo
    }
  }

  // VALIDACIÓN 2: Iniciar en modo escáner limpio (sin productos mostrados abajo)
  selectedPosSector = 'scanned';
  renderPosCategoryPills();
  renderPosProductsGrid();
  renderPosCart();

  const modal = document.getElementById('pos-modal');
  modal.classList.remove('opacity-0', 'pointer-events-none');

  setTimeout(() => {
    const input = document.getElementById('pos-barcode-input');
    if (input) {
      input.value = '';
      input.focus();
    }
  }, 200);
}

function closePosModal() {
  const modal = document.getElementById('pos-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

function renderPosCategoryPills() {
  const container = document.getElementById('pos-category-pills');
  if (!container) return;

  container.innerHTML = `
    <button onclick="setPosCategory('all')" class="px-3 py-1.5 rounded-xl font-extrabold whitespace-nowrap transition ${selectedPosCategory === 'all' ? 'bg-amber-500 text-slate-950 shadow' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}">
      🔥 Todos
    </button>
  `;

  posCategories.forEach(c => {
    const isActive = selectedPosCategory === String(c.id);
    const btn = document.createElement('button');
    btn.onclick = () => setPosCategory(String(c.id));
    btn.className = `px-3 py-1.5 rounded-xl font-extrabold whitespace-nowrap transition ${isActive ? 'bg-amber-500 text-slate-950 shadow' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}`;
    btn.textContent = `${c.icon || '🍽️'} ${c.name}`;
    container.appendChild(btn);
  });
}

let selectedPosSector = 'scanned'; // 'scanned' | 'all' | 'bar' | 'packaged' | 'kitchen' | 'weighed'

function setPosSector(sec) {
  selectedPosSector = sec;

  ['all', 'bar', 'packaged', 'kitchen', 'weighed'].forEach(s => {
    const btn = document.getElementById(`pos-sec-${s}`);
    if (btn) {
      if (s === sec) {
        btn.className = 'px-3 py-1 rounded-lg font-black bg-slate-900 text-white shadow';
      } else {
        btn.className = 'px-3 py-1 rounded-lg font-black bg-white text-slate-700 border border-amber-300 hover:bg-amber-100';
      }
    }
  });

  const ticketChk = document.getElementById('pos-generate-bar-ticket');
  if (ticketChk) {
    if (sec === 'bar') {
      ticketChk.checked = true;
    } else if (sec === 'packaged' || sec === 'weighed' || sec === 'kitchen') {
      ticketChk.checked = false;
    }
  }

  renderPosProductsGrid();
}

function setPosCategory(catId) {
  selectedPosCategory = catId;
  renderPosCategoryPills();
  renderPosProductsGrid();
}

function renderPosProductsGrid() {
  const grid = document.getElementById('pos-products-grid');
  if (!grid) return;

  grid.innerHTML = '';

  // VALIDACIÓN 2: Si está en modo escáner inicial, mostrar pantalla limpia con instrucciones de tipeo manual
  if (selectedPosSector === 'scanned') {
    grid.innerHTML = `
      <div class="col-span-full p-8 text-center bg-white rounded-2xl border border-dashed border-amber-300 space-y-3 my-auto shadow-sm">
        <div class="w-14 h-14 bg-amber-100 text-amber-700 font-black text-2xl rounded-2xl flex items-center justify-center mx-auto shadow-inner">
          📊
        </div>
        <div>
          <h4 class="font-extrabold text-slate-900 text-base">Modo Escáner Activo</h4>
          <p class="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
            Pasa la pistola de código de barras USB sobre la etiqueta del producto o balanza.
          </p>
        </div>
        <div class="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-left text-xs font-bold text-amber-900 space-y-1.5 max-w-md mx-auto">
          <div class="flex items-center gap-1.5 text-amber-950 font-black">
            <span>💡 ¿Falló el lector o escáner?</span>
          </div>
          <div class="text-[11px] font-normal text-amber-800 leading-normal">
            Escribe los números del código de barras en el buscador superior y presiona <kbd class="px-1.5 py-0.5 bg-white rounded border border-amber-300 font-mono font-bold text-amber-900 shadow-sm">Enter</kbd> o el botón <strong>Buscar / Añadir</strong>.
          </div>
        </div>
        <div class="pt-2 text-[11px] font-bold text-slate-400">
          O presiona cualquiera de las pestañas superiores (Bar, Envasados, Cocina, Ver Todo) para elegir del menú visual.
        </div>
      </div>
    `;
    return;
  }

  let filtered = posProducts.filter(p => p.available === 1);

  if (selectedPosSector === 'bar') {
    filtered = filtered.filter(p => p.sector === 'bar' || p.category_id === 7);
  } else if (selectedPosSector === 'packaged') {
    filtered = filtered.filter(p => p.sector === 'packaged' || p.category_id === 6 || (p.barcode && p.unit_type !== 'kg'));
  } else if (selectedPosSector === 'kitchen') {
    filtered = filtered.filter(p => p.sector === 'kitchen' || [1,2,3,4,5].includes(p.category_id));
  } else if (selectedPosSector === 'weighed') {
    filtered = filtered.filter(p => p.unit_type === 'kg' || p.is_prepared_food === 1 || p.sector === 'weighed');
  }

  if (selectedPosCategory !== 'all') {
    filtered = filtered.filter(p => String(p.category_id) === String(selectedPosCategory));
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="col-span-full p-6 text-center text-slate-400 font-bold">No hay productos activos en esta categoría.</div>`;
    return;
  }

  filtered.forEach(p => {
    const card = document.createElement('div');
    card.onclick = () => handlePosProductClick(p.id);
    card.className = 'bg-white p-3 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-400 hover:shadow-md cursor-pointer transition flex flex-col justify-between space-y-2 group';

    const isKg = p.unit_type === 'kg';

    card.innerHTML = `
      <div class="space-y-1">
        <div class="flex justify-between items-start">
          <div class="font-extrabold text-slate-900 text-xs line-clamp-2 group-hover:text-amber-600 transition">${p.name}</div>
          ${isKg ? `<span class="bg-purple-100 text-purple-800 font-black text-[9px] px-1.5 py-0.5 rounded">x Kg</span>` : ''}
        </div>
        <div class="text-[10px] text-slate-400 font-mono">
          ${p.barcode ? `📊 ${p.barcode}` : p.plu_code ? `🏷️ PLU: ${p.plu_code}` : ''}
        </div>
      </div>
      <div class="flex justify-between items-center pt-1 border-t border-slate-100">
        <span class="font-mono font-black text-slate-900 text-sm">${formatCurrency(p.price)}${isKg ? '/kg' : ''}</span>
        <span class="p-1 bg-amber-100 group-hover:bg-amber-500 group-hover:text-slate-950 text-amber-800 rounded-lg text-xs font-black transition">➕</span>
      </div>
    `;

    grid.appendChild(card);
  });
}

function handlePosProductClick(prodId) {
  const prod = posProducts.find(p => p.id === prodId);
  if (!prod) return;

  if (prod.unit_type === 'kg') {
    openPosWeighedModal(prod);
  } else {
    addToPosCart(prod, 1);
    playBeepSound();
  }
}

function addToPosCart(prod, qty = 1) {
  const existing = posCart.find(i => i.id === prod.id);
  if (existing) {
    existing.qty = parseFloat((existing.qty + qty).toFixed(3));
    existing.total = parseFloat((existing.qty * existing.price).toFixed(2));
  } else {
    posCart.push({
      id: prod.id,
      name: prod.name,
      price: prod.price,
      qty: parseFloat(qty.toFixed(3)),
      unit_type: prod.unit_type || 'unidad',
      total: parseFloat((qty * prod.price).toFixed(2))
    });
  }

  renderPosCart();
}

function renderPosCart() {
  const container = document.getElementById('pos-cart-container');
  const countSpan = document.getElementById('pos-cart-count');
  const totalSpan = document.getElementById('pos-cart-total-val');

  if (!container) return;

  container.innerHTML = '';

  let grandTotal = 0;
  let totalCount = 0;

  if (posCart.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400 font-bold text-xs">El carrito de venta directa está vacío. Escanea o selecciona un producto.</div>`;
    if (countSpan) countSpan.textContent = '0';
    if (totalSpan) totalSpan.textContent = formatCurrency(0);
    return;
  }

  posCart.forEach((item, index) => {
    grandTotal += item.total;
    totalCount += item.unit_type === 'kg' ? 1 : item.qty;

    const tr = document.createElement('div');
    tr.className = 'py-2 flex justify-between items-center text-xs gap-2';

    const isKg = item.unit_type === 'kg';
    const qtyStr = isKg ? `${item.qty} kg` : `${item.qty}x`;

    tr.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="font-extrabold text-slate-900 truncate">${item.name}</div>
        <div class="text-[11px] font-mono text-slate-400">${formatCurrency(item.price)} x ${qtyStr}</div>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-mono font-black text-slate-900 text-sm">${formatCurrency(item.total)}</span>
        <div class="flex items-center gap-1">
          <button onclick="updatePosCartQty(${index}, -1)" class="w-5 h-5 bg-slate-200 hover:bg-slate-300 font-black rounded text-slate-700 flex items-center justify-center">-</button>
          <button onclick="updatePosCartQty(${index}, 1)" class="w-5 h-5 bg-slate-200 hover:bg-slate-300 font-black rounded text-slate-700 flex items-center justify-center">+</button>
          <button onclick="removePosCartItem(${index})" class="w-5 h-5 bg-red-100 hover:bg-red-200 font-black rounded text-red-600 flex items-center justify-center">×</button>
        </div>
      </div>
    `;

    container.appendChild(tr);
  });

  if (countSpan) countSpan.textContent = Math.round(totalCount);
  if (totalSpan) totalSpan.textContent = formatCurrency(grandTotal);
}

function updatePosCartQty(index, change) {
  const item = posCart[index];
  if (!item) return;

  const step = item.unit_type === 'kg' ? 0.1 : 1;
  item.qty = parseFloat((item.qty + (change * step)).toFixed(3));

  if (item.qty <= 0) {
    posCart.splice(index, 1);
  } else {
    item.total = parseFloat((item.qty * item.price).toFixed(2));
  }

  renderPosCart();
}

function removePosCartItem(index) {
  posCart.splice(index, 1);
  renderPosCart();
}

function clearPosCart() {
  posCart = [];
  renderPosCart();
}

// LECTURA DE CÓDIGO DE BARRAS & DECODIFICADOR EAN-13 DE BALANZA
function handlePosBarcodeInput(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    processManualBarcodeInput();
  }
}

function processManualBarcodeInput() {
  const input = document.getElementById('pos-barcode-input');
  if (!input) return;

  const rawCode = input.value.trim();
  if (!rawCode) return;

  input.value = '';

  // 1. Verificar si es Código de Balanza EAN-13 (empieza por 20 o 28 y tiene 12/13 dígitos)
  if ((rawCode.startsWith('20') || rawCode.startsWith('28')) && rawCode.length >= 12) {
    const pluCode = rawCode.substring(2, 6);
    const priceOrWeightDigits = parseInt(rawCode.substring(6, 11));

    const prod = posProducts.find(p => String(p.plu_code).trim() === pluCode || String(p.plu_code).padStart(4, '0') === pluCode);

    if (prod) {
      const priceTotal = priceOrWeightDigits / 100;
      const calculatedWeight = parseFloat((priceTotal / (prod.price || 1)).toFixed(3));

      addToPosCart({
        ...prod,
        name: `${prod.name} (Balanza ${calculatedWeight}kg)`
      }, calculatedWeight);

      playBeepSound();
      return;
    }
  }

  // 2. Buscar por Código de Barras Estático
  const prodByBarcode = posProducts.find(p => String(p.barcode).trim() === rawCode);
  if (prodByBarcode) {
    handlePosProductClick(prodByBarcode.id);
    return;
  }

  // 3. Buscar por Nombre
  const prodByName = posProducts.find(p => p.name.toLowerCase().includes(rawCode.toLowerCase()));
  if (prodByName) {
    handlePosProductClick(prodByName.id);
    return;
  }

  alert(`⚠️ No se encontró ningún producto con el código o nombre "${rawCode}".`);
}

// VENTA POR PESO MANUAL (BALANZA DE MOSTRADOR)
function openPosWeighedModal(prod) {
  document.getElementById('weighed-prod-id').value = prod.id;
  document.getElementById('weighed-prod-name').textContent = prod.name;
  document.getElementById('weighed-prod-price').textContent = `Precio por Kilo: ${formatCurrency(prod.price)}/kg`;
  document.getElementById('weighed-input-kg').value = '';
  document.getElementById('weighed-calculated-total').textContent = formatCurrency(0);

  const modal = document.getElementById('pos-weighed-modal');
  modal.classList.remove('opacity-0', 'pointer-events-none');

  setTimeout(() => {
    document.getElementById('weighed-input-kg').focus();
  }, 150);
}

function closePosWeighedModal() {
  const modal = document.getElementById('pos-weighed-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

function calculateWeighedTotal() {
  const prodId = parseInt(document.getElementById('weighed-prod-id').value);
  const prod = posProducts.find(p => p.id === prodId);
  const kg = parseFloat(document.getElementById('weighed-input-kg').value || 0);

  if (prod && kg > 0) {
    const total = kg * prod.price;
    document.getElementById('weighed-calculated-total').textContent = formatCurrency(total);
  } else {
    document.getElementById('weighed-calculated-total').textContent = formatCurrency(0);
  }
}

function confirmWeighedItemAdd() {
  const prodId = parseInt(document.getElementById('weighed-prod-id').value);
  const prod = posProducts.find(p => p.id === prodId);
  const kg = parseFloat(document.getElementById('weighed-input-kg').value || 0);

  if (!prod || kg <= 0) {
    alert('⚠️ Por favor ingrese un peso en kilos válido mayor a 0.');
    return;
  }

  addToPosCart(prod, kg);
  playBeepSound();
  closePosWeighedModal();
}

// ENVIAR VENTA DIRECTA POS AL SERVIDOR
let lastReceiptOrder = null;

function openPosReceiptModal(order) {
  lastReceiptOrder = order;

  const orderNumElem = document.getElementById('receipt-order-number');
  if (orderNumElem) orderNumElem.textContent = order.order_number || '#BAR-101';
  
  const dateElem = document.getElementById('receipt-date');
  if (dateElem) dateElem.textContent = `Fecha: ${new Date(order.created_at || Date.now()).toLocaleString('es-AR')}`;
  
  const payElem = document.getElementById('receipt-payment-method');
  if (payElem) payElem.textContent = `${(order.payment_method || 'EFECTIVO').toUpperCase()} (PAGADO EN CAJA)`;
  
  const totalElem = document.getElementById('receipt-total-val');
  if (totalElem) totalElem.textContent = formatCurrency(order.total || 0);

  const itemsContainer = document.getElementById('receipt-items-list');
  if (itemsContainer) {
    let parsedItems = [];
    try {
      parsedItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    } catch (e) {
      parsedItems = [];
    }

    itemsContainer.innerHTML = parsedItems.map(i => `
      <div class="flex justify-between items-center py-0.5 font-bold">
        <span>${i.qty}x ${i.name}</span>
        <span class="font-mono">${formatCurrency(i.total || (i.price * i.qty))}</span>
      </div>
    `).join('');
  }

  const modal = document.getElementById('pos-receipt-modal');
  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closePosReceiptModal() {
  const modal = document.getElementById('pos-receipt-modal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

function printPosBarReceipt() {
  const content = document.getElementById('pos-receipt-printable');
  if (!content) return;

  const printWin = window.open('', '_blank', 'width=400,height=600');
  printWin.document.write(`
    <html>
      <head>
        <title>Ticket de Retiro ${lastReceiptOrder ? lastReceiptOrder.order_number : ''}</title>
        <style>
          body { font-family: monospace; font-size: 12px; margin: 10px; padding: 0; text-align: center; }
          .title { font-size: 16px; font-weight: bold; }
          .num { font-size: 28px; font-weight: 900; margin: 8px 0; color: #d97706; }
          .border { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 8px 0; margin: 8px 0; text-align: left; }
          .item { display: flex; justify-content: space-between; margin: 4px 0; }
          .total { font-weight: bold; font-size: 14px; display: flex; justify-content: space-between; margin-top: 8px; }
        </style>
      </head>
      <body>
        ${content.innerHTML}
      </body>
    </html>
  `);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => {
    printWin.print();
    printWin.close();
  }, 250);
}

async function submitPosSale() {
  if (posCart.length === 0) {
    alert('⚠️ El carrito de venta directa está vacío.');
    return;
  }

  const grandTotal = posCart.reduce((sum, i) => sum + i.total, 0);
  const payment_method = document.getElementById('pos-payment-method').value;
  const generateBarTicket = document.getElementById('pos-generate-bar-ticket') ? document.getElementById('pos-generate-bar-ticket').checked : false;

  try {
    const res = await fetch('/api/pos/sale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: posCart,
        payment_method,
        total: grandTotal
      })
    });

    const data = await res.json();
    if (data.success) {
      playBeepSound();
      const order = data.order;
      clearPosCart();
      closePosModal();
      await loadCashSummary();
      await loadOrders();

      if (generateBarTicket) {
        openPosReceiptModal(order);
      } else {
        alert(`⚡ VENTA DIRECTA COBRADA E INGRESADA A CAJA!\n\nOrden: ${order.order_number}\nTotal Cobrado: ${formatCurrency(grandTotal)}\nMétodo de Pago: ${payment_method}`);
      }
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al cobrar venta directa POS:', err);
    alert('Error de conexión al procesar la venta.');
  }
}

// ==========================================
// FICHAJE DE ASISTENCIA Y CÓMPUTO DE HORAS TRABAJADAS (CAJA)
// ==========================================

let attendanceLogsList = [];
let activeStaffList = [];

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
        <div class="flex items-center gap-1.5">${l.user_name || 'Empleado'} <span class="bg-amber-100 text-amber-900 px-2 py-0.5 rounded text-[10px] font-black">${l.sector || 'General'}</span></div>
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
  const sector = sectorInput ? sectorInput.value : '💰 Caja & Mostrador';

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
