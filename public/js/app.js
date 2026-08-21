let state = {
  categories: [],
  products: [],
  settings: {},
  currentCategory: 'all',
  cart: [],
  deliveryType: 'delivery', // 'delivery' | 'retiro'
};

document.addEventListener('DOMContentLoaded', async () => {
  await fetchMenu();
  loadCartFromStorage();
  updateCartUI();
});

// Helper para formatear números de teléfono a WhatsApp (ej: 3794218138 -> 5493794218138)
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

// Cargar menú y configuraciones desde la API
async function fetchMenu() {
  try {
    const res = await fetch('/api/menu');
    const data = await res.json();

    if (data.success) {
      state.categories = data.categories;
      state.products = data.products;
      state.settings = data.settings;

      if (state.settings.restaurant_name) {
        document.getElementById('restaurant-name').textContent = state.settings.restaurant_name;
      }

      renderCategories();
      renderProducts();
    }
  } catch (err) {
    console.error('Error al obtener el menú:', err);
  }
}

// Renderizar botones de categorías
function renderCategories() {
  const container = document.getElementById('categories-container');
  container.innerHTML = `
    <button onclick="selectCategory('all')" class="cat-btn ${state.currentCategory === 'all' ? 'bg-orange-500 text-white font-bold shadow-md' : 'bg-white text-slate-700 hover:bg-slate-100'} px-4 py-2 rounded-xl text-sm whitespace-nowrap transition border border-slate-200" data-cat="all">
      🔥 Todos
    </button>
  `;

  state.categories.forEach(cat => {
    const isActive = state.currentCategory === String(cat.id);
    const btn = document.createElement('button');
    btn.onclick = () => selectCategory(String(cat.id));
    btn.className = `cat-btn ${isActive ? 'bg-orange-500 text-white font-bold shadow-md' : 'bg-white text-slate-700 hover:bg-slate-100'} px-4 py-2 rounded-xl text-sm whitespace-nowrap transition border border-slate-200`;
    btn.innerHTML = `${cat.icon || '🍽️'} ${cat.name}`;
    container.appendChild(btn);
  });
}

function selectCategory(catId) {
  state.currentCategory = catId;
  renderCategories();
  renderProducts();

  const titleEl = document.getElementById('current-category-title');
  if (catId === 'all') {
    titleEl.textContent = 'Menú Completo';
  } else {
    const cat = state.categories.find(c => String(c.id) === String(catId));
    titleEl.textContent = cat ? `${cat.icon} ${cat.name}` : 'Menú';
  }
}

// Renderizar tarjetas de productos
function renderProducts() {
  const grid = document.getElementById('products-grid');
  grid.innerHTML = '';

  let filtered = state.products;
  if (state.currentCategory !== 'all') {
    filtered = state.products.filter(p => String(p.category_id) === String(state.currentCategory));
  }

  document.getElementById('product-count').textContent = `${filtered.length} opciones disponibles`;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-400">
        <div class="text-4xl mb-2">🍽️</div>
        <p class="font-semibold">No hay platos disponibles en esta categoría.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(p => {
    const isAvailable = p.available === 1;
    const card = document.createElement('div');
    card.className = `bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 flex flex-col justify-between transition hover:shadow-md ${!isAvailable ? 'opacity-60 grayscale' : ''}`;

    const formattedPrice = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(p.price);

    card.innerHTML = `
      <div class="flex gap-3">
        ${p.image_url ? `
          <img src="${p.image_url}" alt="${p.name}" class="w-24 h-24 object-cover rounded-xl flex-shrink-0 bg-slate-100" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300'">
        ` : `
          <div class="w-24 h-24 bg-orange-100 text-orange-500 rounded-xl flex items-center justify-center text-3xl flex-shrink-0">🍔</div>
        `}
        <div class="flex-1">
          <h3 class="font-bold text-slate-900 text-base leading-tight">${p.name}</h3>
          <p class="text-xs text-slate-500 mt-1 line-clamp-2">${p.description || ''}</p>
          <div class="mt-2 font-black text-slate-900 text-base">
            ${formattedPrice}
          </div>
        </div>
      </div>

      <div class="mt-3 pt-3 border-t border-slate-100 flex justify-end">
        ${isAvailable ? `
          <button onclick="addToCart(${p.id})" class="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition">
            <i data-lucide="plus" class="w-4 h-4"></i> Agregar al Pedido
          </button>
        ` : `
          <span class="text-xs font-semibold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg">Agotado</span>
        `}
      </div>
    `;

    grid.appendChild(card);
  });

  lucide.createIcons();
}

// ----------------------------------------------------
// GESTIÓN DEL CARRITO
// ----------------------------------------------------

function addToCart(productId) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;

  const existingItem = state.cart.find(item => item.id === productId);
  if (existingItem) {
    existingItem.qty += 1;
  } else {
    state.cart.push({
      id: prod.id,
      name: prod.name,
      price: prod.price,
      qty: 1
    });
  }

  saveCartToStorage();
  updateCartUI();

  if (state.cart.reduce((sum, item) => sum + item.qty, 0) === 1) {
    openCartModal();
  }
}

function updateItemQty(productId, delta) {
  const itemIndex = state.cart.findIndex(i => i.id === productId);
  if (itemIndex > -1) {
    state.cart[itemIndex].qty += delta;
    if (state.cart[itemIndex].qty <= 0) {
      state.cart.splice(itemIndex, 1);
    }
  }
  saveCartToStorage();
  updateCartUI();
}

function setDeliveryType(type) {
  state.deliveryType = type;

  const btnDel = document.getElementById('btn-delivery');
  const btnRet = document.getElementById('btn-retiro');
  const addrContainer = document.getElementById('address-field-container');

  if (type === 'delivery') {
    btnDel.className = 'delivery-type-btn py-2.5 px-3 rounded-xl border-2 border-orange-500 bg-orange-50 text-orange-600 font-bold text-sm flex items-center justify-center gap-2 transition';
    btnRet.className = 'delivery-type-btn py-2.5 px-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-600 font-bold text-sm flex items-center justify-center gap-2 transition';
    addrContainer.style.display = 'block';
  } else {
    btnRet.className = 'delivery-type-btn py-2.5 px-3 rounded-xl border-2 border-orange-500 bg-orange-50 text-orange-600 font-bold text-sm flex items-center justify-center gap-2 transition';
    btnDel.className = 'delivery-type-btn py-2.5 px-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-600 font-bold text-sm flex items-center justify-center gap-2 transition';
    addrContainer.style.display = 'none';
  }

  updateCartUI();
}

function togglePaymentNote() {
  const method = document.getElementById('cust-payment').value;
  const noteContainer = document.getElementById('payment-note-container');
  const label = document.getElementById('payment-note-label');
  const input = document.getElementById('cust-payment-note');

  noteContainer.style.display = 'block';

  if (method === 'Efectivo') {
    label.textContent = '¿Con cuánto abonas? (para el vuelto)';
    input.placeholder = 'Ej: Pago con $10.000';
  } else if (method.includes('Tarjeta')) {
    label.textContent = 'Aclaración de Tarjeta / Posnet (Opcional)';
    input.placeholder = 'Ej: Visa Débito, Mastercard, Posnet MP';
  } else if (method === 'Link de Pago') {
    label.textContent = 'Aclaración para Link de Pago (Opcional)';
    input.placeholder = 'Ej: Solicitar link de MercadoPago';
  } else {
    label.textContent = 'Notas sobre el Pago (Opcional)';
    input.placeholder = 'Ej: Transferiré desde cuenta a nombre de Juan';
  }
}

function updateCartUI() {
  const totalItems = state.cart.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const deliveryCost = state.deliveryType === 'delivery' ? parseFloat(state.settings.delivery_cost || 1200) : 0;
  const grandTotal = subtotal > 0 ? subtotal + deliveryCost : 0;

  const floatingBtn = document.getElementById('floating-cart-btn');
  if (totalItems > 0) {
    floatingBtn.classList.remove('hidden');
  } else {
    floatingBtn.classList.add('hidden');
    closeCartModal();
  }

  document.getElementById('cart-badge').textContent = totalItems;
  document.getElementById('cart-total-floating').textContent = formatCurrency(grandTotal);

  const itemsContainer = document.getElementById('cart-items-list');
  if (state.cart.length === 0) {
    itemsContainer.innerHTML = `
      <div class="py-8 text-center text-slate-400">
        <p class="text-sm font-semibold">Tu carrito está vacío</p>
      </div>
    `;
  } else {
    itemsContainer.innerHTML = state.cart.map(item => `
      <div class="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200/60">
        <div class="flex-1 pr-2">
          <h5 class="font-bold text-slate-900 text-sm">${item.name}</h5>
          <span class="text-xs font-semibold text-orange-600">${formatCurrency(item.price)} x ${item.qty} = ${formatCurrency(item.price * item.qty)}</span>
        </div>
        <div class="flex items-center gap-2 bg-white border border-slate-300 rounded-lg p-1">
          <button onclick="updateItemQty(${item.id}, -1)" class="w-6 h-6 rounded flex items-center justify-center hover:bg-slate-100 font-bold text-slate-700 text-sm">-</button>
          <span class="text-xs font-bold w-4 text-center">${item.qty}</span>
          <button onclick="updateItemQty(${item.id}, 1)" class="w-6 h-6 rounded flex items-center justify-center hover:bg-slate-100 font-bold text-slate-700 text-sm">+</button>
        </div>
      </div>
    `).join('');
  }

  document.getElementById('summary-subtotal').textContent = formatCurrency(subtotal);
  document.getElementById('summary-delivery-cost').textContent = state.deliveryType === 'delivery' ? formatCurrency(deliveryCost) : 'GRATIS';
  document.getElementById('summary-total').textContent = formatCurrency(grandTotal);

  document.getElementById('summary-delivery-row').style.display = state.deliveryType === 'delivery' ? 'flex' : 'none';
}

function openCartModal() {
  const modal = document.getElementById('cart-modal');
  const drawer = document.getElementById('cart-drawer');
  modal.classList.remove('opacity-0', 'pointer-events-none');
  drawer.classList.remove('translate-x-full');
}

function closeCartModal() {
  const modal = document.getElementById('cart-modal');
  const drawer = document.getElementById('cart-drawer');
  modal.classList.add('opacity-0', 'pointer-events-none');
  drawer.classList.add('translate-x-full');
}

function saveCartToStorage() {
  localStorage.setItem('rotiseria_cart', JSON.stringify(state.cart));
}

function loadCartFromStorage() {
  const saved = localStorage.getItem('rotiseria_cart');
  if (saved) {
    try {
      state.cart = JSON.parse(saved);
    } catch (e) {
      state.cart = [];
    }
  }
}

function formatCurrency(val) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
}

// ----------------------------------------------------
// ENVIAR PEDIDO POR WHATSAPP Y REGISTRAR EN COCINA
// ----------------------------------------------------

async function submitOrderToWhatsApp() {
  if (state.cart.length === 0) {
    alert('Tu carrito está vacío. Agrega comidas antes de continuar.');
    return;
  }

  const name = document.getElementById('cust-name').value.trim();
  const rawPhone = document.getElementById('cust-phone').value.trim();
  const address = document.getElementById('cust-address').value.trim();
  const paymentMethod = document.getElementById('cust-payment').value;
  const paymentNote = document.getElementById('cust-payment-note').value.trim();
  const notes = document.getElementById('cust-notes').value.trim();

  if (!name) {
    alert('Por favor ingresa tu Nombre Completo.');
    document.getElementById('cust-name').focus();
    return;
  }

  if (!rawPhone) {
    alert('Por favor ingresa tu número de celular / WhatsApp.');
    document.getElementById('cust-phone').focus();
    return;
  }

  if (state.deliveryType === 'delivery' && !address) {
    alert('Por favor ingresa tu Dirección Completa para el envío.');
    document.getElementById('cust-address').focus();
    return;
  }

  const formattedPhone = formatWhatsAppNumber(rawPhone);

  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const deliveryCost = state.deliveryType === 'delivery' ? parseFloat(state.settings.delivery_cost || 1200) : 0;
  const grandTotal = subtotal + deliveryCost;

  // 1. Guardar el pedido en la base de datos para que la cocina lo reciba al instante
  let createdOrder = null;
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: name,
        customer_phone: formattedPhone,
        address: state.deliveryType === 'delivery' ? address : 'RETIRO POR EL LOCAL',
        delivery_type: state.deliveryType,
        payment_method: paymentMethod,
        payment_note: paymentNote,
        notes: notes,
        items: state.cart,
        total: grandTotal
      })
    });

    const data = await res.json();
    if (data.success) {
      createdOrder = data.order;
    }
  } catch (err) {
    console.error('Error al registrar pedido en backend:', err);
  }

  const orderNumber = createdOrder ? createdOrder.order_number : '#NUEVO';

  // 2. Construir mensaje estructurado para WhatsApp
  let message = `🍽️ *NUEVO PEDIDO - ${state.settings.restaurant_name || 'Rotisería'}*\n`;
  message += `📌 *Orden:* ${orderNumber}\n`;
  message += `--------------------------------\n`;
  message += `👤 *Cliente:* ${name}\n`;
  message += `📞 *Teléfono:* ${formattedPhone}\n`;
  message += `🛵 *Tipo:* ${state.deliveryType === 'delivery' ? 'Delivery a Domicilio' : 'Retiro por el Local'}\n`;
  if (state.deliveryType === 'delivery') {
    message += `📍 *Dirección:* ${address}\n`;
  }
  message += `💳 *Pago:* ${paymentMethod}${paymentNote ? ` (${paymentNote})` : ''}\n`;
  message += `--------------------------------\n`;
  message += `📋 *DETALLE DEL PEDIDO:*\n`;

  state.cart.forEach(item => {
    message += `• *${item.qty}x* ${item.name} (${formatCurrency(item.price * item.qty)})\n`;
  });

  if (state.deliveryType === 'delivery') {
    message += `• *1x* Costo de Envío (${formatCurrency(deliveryCost)})\n`;
  }

  if (notes) {
    message += `\n📝 *Notas/Aclaraciones:* _${notes}_\n`;
  }

  message += `--------------------------------\n`;
  message += `💰 *TOTAL A PAGAR:* *${formatCurrency(grandTotal)}*\n`;
  message += `\n¡Gracias! Quedo a la espera de la confirmación 🙌`;

  // 3. Limpiar carrito local
  state.cart = [];
  saveCartToStorage();
  updateCartUI();
  closeCartModal();

  // 4. Abrir WhatsApp
  let targetPhone = state.settings.whatsapp_phone ? formatWhatsAppNumber(state.settings.whatsapp_phone) : '';
  if (!targetPhone || targetPhone === '5491112345678') {
    targetPhone = formattedPhone;
  }

  const encodedText = encodeURIComponent(message);
  const waUrl = `https://wa.me/${targetPhone}?text=${encodedText}`;

  window.open(waUrl, '_blank');
}
