const socket = io();
let orders = [];
let audioEnabled = true;
let activeMobileTab = 'all';
let rawMaterials = [];
let suppliers = [];
let menuProducts = [];

document.addEventListener('DOMContentLoaded', () => {
  loadOrders();
  loadStockMaterials();
  loadMenuProducts();
  setupSocket();
  setInterval(updateTimers, 30000);
});

function formatWhatsAppNumber(phone) {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.length === 10 && !clean.startsWith('54')) {
    clean = '549' + clean;
  } else if (clean.length === 11 && clean.startsWith('0')) {
    clean = '549' + clean.substring(1);
  } else if (clean.length === 12 && clean.startsWith('54') && !clean.startsWith('549')) {
    clean = '549' + clean.substring(2);
  }
  return clean;
}

function setupSocket() {
  socket.on('connect', () => {
    document.getElementById('socket-status').innerHTML = '🟢 En vivo';
    document.getElementById('socket-status').className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  });

  socket.on('disconnect', () => {
    document.getElementById('socket-status').innerHTML = '🔴 Desconectado';
    document.getElementById('socket-status').className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30';
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
    if (idx > -1) {
      orders[idx] = updatedOrder;
      renderKanban();
    }
  });
}

async function loadOrders() {
  try {
    const res = await fetch('/api/orders');
    const data = await res.json();
    if (data.success) {
      orders = data.orders;
      renderKanban();
    }
  } catch (err) {
    console.error('Error al cargar pedidos:', err);
  }
}

async function loadMenuProducts() {
  try {
    const res = await fetch('/api/menu');
    const data = await res.json();
    if (data.success) {
      menuProducts = data.products || [];
      populateProductionSelect();
    }
  } catch (err) {
    console.error('Error al cargar menú:', err);
  }
}

function populateProductionSelect() {
  const sel = document.getElementById('prod-product-id');
  if (!sel) return;
  sel.innerHTML = menuProducts.map(p => `<option value="${p.id}">${p.name} ($${p.price})</option>`).join('');
}

function openProductionModal() {
  loadMenuProducts();
  const modal = document.getElementById('production-modal');
  document.getElementById('production-form').reset();
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeProductionModal() {
  const modal = document.getElementById('production-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

async function submitProduction(e) {
  e.preventDefault();
  const pin = document.getElementById('prod-pin').value.trim();
  const product_id = document.getElementById('prod-product-id').value;
  const portions = document.getElementById('prod-portions').value;

  try {
    const res = await fetch('/api/production/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, product_id, portions })
    });
    const data = await res.json();
    if (data.success) {
      closeProductionModal();
      const discText = data.discounted && data.discounted.length > 0 ? `\n\nInsumos descontados de Stock:\n${data.discounted.join('\n')}` : '';
      alert(`👨‍🍳 PRODUCCIÓN REGISTRADA: ${data.portions} porciones de "${data.product_name}" listas.${discText}`);
      loadStockMaterials();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al registrar producción:', err);
  }
}

async function loadStockMaterials() {
  try {
    const res = await fetch('/api/admin/stock');
    const data = await res.json();
    if (data.success) {
      rawMaterials = data.raw_materials || [];
      suppliers = data.suppliers || [];
      populateStockSelects();
    }
  } catch (err) {
    console.error('Error al cargar insumos de stock:', err);
  }
}

function populateStockSelects() {
  const matSel = document.getElementById('stock-material-id');
  const supSel = document.getElementById('stock-supplier-id');
  if (!matSel || !supSel) return;

  matSel.innerHTML = rawMaterials.map(m => `<option value="${m.id}">${m.name} (Stock: ${m.current_stock} ${m.unit})</option>`).join('');
  supSel.innerHTML = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

function openStockEntryModal() {
  loadStockMaterials();
  const modal = document.getElementById('stock-entry-modal');
  document.getElementById('stock-entry-form').reset();
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeStockEntryModal() {
  const modal = document.getElementById('stock-entry-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

async function submitStockEntry(e) {
  e.preventDefault();
  const pin = document.getElementById('stock-pin').value.trim();
  const raw_material_id = document.getElementById('stock-material-id').value;
  const supplier_id = document.getElementById('stock-supplier-id').value;
  const quantity = parseFloat(document.getElementById('stock-qty').value);
  const notes = document.getElementById('stock-notes').value.trim();

  try {
    const res = await fetch('/api/stock/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pin,
        supplier_id,
        raw_material_id,
        quantity,
        notes,
        registered_by: 'Encargado (Cocina - Nivel 2)'
      })
    });
    const data = await res.json();
    if (data.success) {
      closeStockEntryModal();
      alert(`✅ INGRESO DE STOCK AUTORIZADO: Se agregaron +${quantity} al stock de ${data.raw_material.name}.`);
      loadStockMaterials();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al ingresar mercadería:', err);
  }
}

function setMobileTab(tab) {
  activeMobileTab = tab;
  renderKanban();

  const tabs = ['all', 'nuevo', 'en_preparacion', 'en_camino', 'entregado'];
  tabs.forEach(t => {
    const btn = document.getElementById(`mtab-${t}`);
    if (btn) {
      if (t === tab) {
        btn.className = 'mtab-btn active bg-orange-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs whitespace-nowrap shadow transition flex items-center gap-1';
      } else {
        btn.className = 'mtab-btn bg-slate-700 text-slate-300 font-bold px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition flex items-center gap-1';
      }
    }
  });
}

function renderKanban() {
  const cols = {
    nuevo: document.getElementById('col-nuevo'),
    en_preparacion: document.getElementById('col-en_preparacion'),
    en_camino: document.getElementById('col-en_camino'),
    entregado: document.getElementById('col-entregado')
  };

  const colBoxes = {
    nuevo: document.getElementById('col-box-nuevo'),
    en_preparacion: document.getElementById('col-box-en_preparacion'),
    en_camino: document.getElementById('col-box-en_camino'),
    entregado: document.getElementById('col-box-entregado')
  };

  Object.values(cols).forEach(c => c.innerHTML = '');

  const counts = { nuevo: 0, en_preparacion: 0, en_camino: 0, entregado: 0 };

  orders.forEach(order => {
    const statusKey = cols[order.status] ? order.status : 'nuevo';
    counts[statusKey] = (counts[statusKey] || 0) + 1;

    const card = createOrderCard(order);
    if (cols[statusKey]) {
      cols[statusKey].appendChild(card);
    }
  });

  document.getElementById('count-nuevo').textContent = counts.nuevo;
  document.getElementById('count-en_preparacion').textContent = counts.en_preparacion;
  document.getElementById('count-en_camino').textContent = counts.en_camino;
  document.getElementById('count-entregado').textContent = counts.entregado;

  document.getElementById('mcount-nuevo').textContent = counts.nuevo;
  document.getElementById('mcount-en_preparacion').textContent = counts.en_preparacion;
  document.getElementById('mcount-en_camino').textContent = counts.en_camino;

  if (window.innerWidth < 768) {
    Object.keys(colBoxes).forEach(key => {
      if (activeMobileTab === 'all' || activeMobileTab === key) {
        colBoxes[key].style.display = 'flex';
      } else {
        colBoxes[key].style.display = 'none';
      }
    });
  } else {
    Object.values(colBoxes).forEach(box => box.style.display = 'flex');
  }

  lucide.createIcons();
}

function createOrderCard(order) {
  const card = document.createElement('div');
  const isNuevo = order.status === 'nuevo';
  const isPaid = order.paid === 1;

  card.className = `bg-slate-900 border ${isNuevo ? 'border-red-500 animate-new-order pulse-red' : 'border-slate-700'} rounded-xl p-3 shadow-lg flex flex-col justify-between transition hover:border-slate-500`;

  const minutesAgo = getMinutesAgo(order.created_at);
  const itemsCount = order.items ? order.items.reduce((s, i) => s + i.qty, 0) : 0;
  const formattedPhone = formatWhatsAppNumber(order.customer_phone);

  let itemsHtml = '';
  if (Array.isArray(order.items)) {
    itemsHtml = order.items.map(item => `
      <div class="flex justify-between items-start text-xs sm:text-sm border-b border-slate-800 pb-1 mb-1">
        <div class="font-bold text-white flex items-center gap-1.5">
          <span class="bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded text-xs font-mono font-black">${item.qty}x</span>
          <span>${item.name}</span>
        </div>
        <span class="text-[11px] text-slate-400 font-mono">${formatCurrency(item.price * item.qty)}</span>
      </div>
    `).join('');
  }

  card.innerHTML = `
    <div>
      <div class="flex justify-between items-start mb-2 border-b border-slate-800 pb-1.5">
        <div>
          <span class="text-xs font-black font-mono text-orange-400 bg-orange-950/60 border border-orange-500/30 px-2 py-0.5 rounded-md">
            ${order.order_number}
          </span>
          <span class="ml-1.5 text-xs font-bold text-slate-300">
            ${order.delivery_type === 'delivery' ? '🛵 Delivery' : '🏪 Retiro'}
          </span>
        </div>
        <span class="text-[11px] font-mono font-semibold ${minutesAgo > 20 ? 'text-red-400 font-bold' : 'text-slate-400'}">
          ⏱️ hace ${minutesAgo}m
        </span>
      </div>

      <div class="mb-2">
        <h4 class="font-black text-white text-base leading-tight">${order.customer_name}</h4>
        <p class="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
          📞 ${formattedPhone || order.customer_phone}
        </p>
        ${order.address ? `
          <p class="text-xs text-amber-300 font-medium mt-1 bg-amber-950/30 border border-amber-500/20 p-1.5 rounded-lg">
            📍 ${order.address}
          </p>
        ` : ''}
      </div>

      <div class="my-2 bg-slate-950/60 p-2 rounded-lg border border-slate-800">
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Comidas (${itemsCount})</div>
        ${itemsHtml}
      </div>

      ${order.notes ? `
        <div class="mb-2 bg-red-950/40 border border-red-500/30 p-2 rounded-lg text-xs text-red-200">
          <strong>⚠️ Nota:</strong> ${order.notes}
        </div>
      ` : ''}

      <div class="flex justify-between items-center text-xs font-mono my-1 text-slate-300">
        <span>Pago: ${order.payment_method} ${order.payment_note ? `(${order.payment_note})` : ''}</span>
        <span class="font-black text-emerald-400 text-sm">${formatCurrency(order.total)}</span>
      </div>
    </div>

    <!-- Controles de Caja e Impresión -->
    <div class="mt-2 pt-2 border-t border-slate-800 flex flex-col gap-2">
      <!-- Estado de Cobro en Caja -->
      <div class="flex items-center justify-between bg-slate-950/80 p-2 rounded-xl border border-slate-800">
        <span class="text-xs font-bold ${isPaid ? 'text-emerald-400' : 'text-amber-400'} flex items-center gap-1">
          ${isPaid ? '✅ Ingresado a Caja' : '⏳ Pendiente de Caja'}
        </span>
        <button onclick="toggleOrderPaid(${order.id}, ${!isPaid})" class="px-2.5 py-1 rounded-lg text-xs font-bold transition ${isPaid ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'}">
          ${isPaid ? 'Desmarcar' : '💰 Ingresar a Caja'}
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button onclick="printEpsonOrBrowser(${order.id})" class="bg-slate-700 hover:bg-slate-600 active:scale-95 text-white font-bold py-2 px-2 rounded-lg text-xs flex items-center justify-center gap-1 transition">
          🖨️ Imprimir
        </button>
        <button onclick="notifyCustomerWhatsApp(${order.id})" class="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold py-2 px-2 rounded-lg text-xs flex items-center justify-center gap-1 transition">
          💬 Avisar
        </button>
      </div>

      ${renderStatusButtons(order)}
    </div>
  `;

  return card;
}

function renderStatusButtons(order) {
  if (order.status === 'nuevo') {
    return `
      <button onclick="updateOrderStatus(${order.id}, 'en_preparacion')" class="w-full bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-black py-2.5 rounded-lg text-xs flex items-center justify-center gap-1 transition shadow">
        ➡️ Pasar a Cocina (En Preparación)
      </button>
    `;
  }
  if (order.status === 'en_preparacion') {
    return `
      <button onclick="updateOrderStatus(${order.id}, 'en_camino')" class="w-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black py-2.5 rounded-lg text-xs flex items-center justify-center gap-1 transition shadow">
        🛵 Listo / En Camino a Despacho
      </button>
    `;
  }
  if (order.status === 'en_camino') {
    return `
      <button onclick="updateOrderStatus(${order.id}, 'entregado')" class="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black py-2.5 rounded-lg text-xs flex items-center justify-center gap-1 transition shadow">
        ✅ Marcar como Entregado
      </button>
    `;
  }
  return `
    <span class="text-center text-[11px] font-bold text-slate-500 py-1">Pedido Entregado</span>
  `;
}

async function updateOrderStatus(orderId, newStatus) {
  const order = orders.find(o => o.id === orderId);

  // Validación estricta: No se puede finalizar si no ha sido ingresado a caja (salvo Cuenta Corriente autorizada)
  if (newStatus === 'entregado' && order && order.paid !== 1 && (!order.payment_method || !order.payment_method.includes('Cuenta Corriente'))) {
    alert(`⚠️ ATENCIÓN: No se puede marcar como ENTREGADO el pedido ${order.order_number} (${formatCurrency(order.total)}).\n\nPrimero debe presionar "💰 Ingresar a Caja" para registrar el cobro del dinero.`);
    return;
  }

  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (!data.success) {
      alert(`⚠️ ${data.error}`);
      return;
    }
    if (data.success) {
      const idx = orders.findIndex(o => o.id === orderId);
      if (idx > -1) {
        orders[idx].status = newStatus;
        renderKanban();
      }
    }
  } catch (err) {
    console.error('Error al actualizar estado:', err);
  }
}

async function toggleOrderPaid(orderId, newPaidStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}/paid`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: newPaidStatus })
    });
    const data = await res.json();
    if (data.success) {
      const idx = orders.findIndex(o => o.id === orderId);
      if (idx > -1) {
        orders[idx].paid = newPaidStatus ? 1 : 0;
        renderKanban();
      }
    }
  } catch (err) {
    console.error('Error al actualizar ingreso a caja:', err);
  }
}

async function openCashModal() {
  const modal = document.getElementById('cash-modal');
  const container = document.getElementById('cash-summary-content');
  modal.classList.remove('opacity-0', 'pointer-events-none');

  container.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Calculando arqueo de caja...</p>`;

  try {
    const res = await fetch('/api/cash/summary');
    const data = await res.json();

    if (data.success) {
      const s = data.summary;
      container.innerHTML = `
        <div class="grid grid-cols-2 gap-3 text-xs">
          <div class="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span class="text-slate-400 block font-medium mb-1">💵 Efectivo Ingresado</span>
            <span class="text-lg font-black text-emerald-400">${formatCurrency(s.cash_collected)}</span>
          </div>
          <div class="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span class="text-slate-400 block font-medium mb-1">⏳ Efectivo Pendiente</span>
            <span class="text-lg font-black text-amber-400">${formatCurrency(s.cash_pending)}</span>
          </div>
          <div class="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span class="text-slate-400 block font-medium mb-1">💳 Tarjetas / Posnet</span>
            <span class="text-lg font-black text-blue-400">${formatCurrency(s.card_total)}</span>
          </div>
          <div class="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span class="text-slate-400 block font-medium mb-1">📱 MercadoPago/Transf</span>
            <span class="text-lg font-black text-purple-400">${formatCurrency(s.digital_total)}</span>
          </div>
        </div>

        <div class="bg-emerald-950/40 border border-emerald-500/30 p-3 rounded-xl flex justify-between items-center text-xs">
          <span class="font-bold text-emerald-200">TOTAL VENTAS REGISTRADAS (${s.orders_count}):</span>
          <span class="font-black text-emerald-400 text-base font-mono">${formatCurrency(s.total_sales)}</span>
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `<p class="text-xs text-red-400">Error al obtener reporte de caja.</p>`;
  }
}

function closeCashModal() {
  const modal = document.getElementById('cash-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

async function printEpsonOrBrowser(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  try {
    const res = await fetch(`/api/print-epson/${orderId}`, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      alert(`🖨️ Comanda enviada a la impresora Epson de la caja`);
      return;
    }
  } catch (e) {
    console.log('Impresión directa por red no configurada, usando navegador...');
  }

  printThermalTicketBrowser(order);
}

function printThermalTicketBrowser(order) {
  const printArea = document.getElementById('print-area');
  const now = new Date().toLocaleString('es-AR');

  let itemsRows = '';
  if (Array.isArray(order.items)) {
    itemsRows = order.items.map(i => `
      <tr>
        <td class="ticket-qty">${i.qty}x</td>
        <td><div>${i.name}</div></td>
        <td style="text-align: right; font-weight: bold;">${formatCurrency(i.price * i.qty)}</td>
      </tr>
    `).join('');
  }

  printArea.innerHTML = `
    <div class="ticket-title">COMANDA - COCINA</div>
    <div class="ticket-header">
      <div><strong>ORDEN:</strong> <span style="font-size: 20px; font-weight: bold;">${order.order_number}</span></div>
      <div><strong>FECHA:</strong> ${now}</div>
      <div><strong>CLIENTE:</strong> ${order.customer_name}</div>
      <div><strong>TEL:</strong> ${formatWhatsAppNumber(order.customer_phone)}</div>
      <div><strong>TIPO:</strong> ${order.delivery_type === 'delivery' ? 'DELIVERY A DOMICILIO' : 'RETIRO EN LOCAL'}</div>
      ${order.address ? `<div><strong>DIR:</strong> ${order.address}</div>` : ''}
      <div><strong>PAGO:</strong> ${order.payment_method} ${order.payment_note ? `(${order.payment_note})` : ''}</div>
      <div><strong>ESTADO CAJA:</strong> ${order.paid ? 'COBRADO EN CAJA [OK]' : 'PENDIENTE DE COBRO'}</div>
    </div>

    <table class="ticket-items-table">
      <thead>
        <tr>
          <th>CANT</th>
          <th>DESCRIPCIÓN</th>
          <th style="text-align: right;">TOTAL</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    ${order.notes ? `
      <div style="background: #eee; padding: 4px; border: 1px solid #000; margin-bottom: 8px;">
        <strong>NOTAS COCINA:</strong><br>${order.notes}
      </div>
    ` : ''}

    <div class="ticket-total">TOTAL: ${formatCurrency(order.total)}</div>
    <div class="ticket-footer">--- ¡MUCHAS GRACIAS! ---</div>
  `;

  window.print();
}

function notifyCustomerWhatsApp(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  let msg = '';
  if (order.status === 'en_preparacion') {
    msg = `👋 Hola ${order.customer_name}! Tu pedido *${order.order_number}* en La Gran Rotisería está *EN PREPARACIÓN* en la cocina 👨‍🍳🔥.`;
  } else if (order.status === 'en_camino') {
    msg = `🛵 ¡Buenas noticias ${order.customer_name}! Tu pedido *${order.order_number}* ya está listo y *EN CAMINO* a ${order.address || 'tu domicilio'}. ¡Prepara la mesa!`;
  } else if (order.status === 'entregado') {
    msg = `✅ ¡Pedido *${order.order_number}* entregado! Muchas gracias por elegirnos. ¡Que lo disfrutes mucho! 🙌`;
  } else {
    msg = `👋 Hola ${order.customer_name}! Tu pedido *${order.order_number}* fue recibido correctamente.`;
  }

  const phone = formatWhatsAppNumber(order.customer_phone);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

function playNotificationSound() {
  if (!audioEnabled) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) {
    console.log('Audio no interactuado aún');
  }
}

function toggleAudio() {
  audioEnabled = !audioEnabled;
  const btn = document.getElementById('sound-btn');
  btn.innerHTML = audioEnabled 
    ? `<i data-lucide="volume-2" class="w-4 h-4 text-emerald-400"></i><span class="hidden sm:inline">Sonido</span>`
    : `<i data-lucide="volume-x" class="w-4 h-4 text-red-400"></i><span class="hidden sm:inline">Silenciado</span>`;
  lucide.createIcons();
}

function getMinutesAgo(dateStr) {
  const diffMs = new Date() - new Date(dateStr);
  return Math.floor(diffMs / 60000);
}

function updateTimers() {
  renderKanban();
}

function formatCurrency(val) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
}

// ==========================================
// FICHAJE DE ASISTENCIA Y CÓMPUTO DE HORAS TRABAJADAS (COCINA)
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
  const sector = sectorInput ? sectorInput.value : '🍳 Cocina';

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
