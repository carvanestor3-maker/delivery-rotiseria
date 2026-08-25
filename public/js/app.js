const state = {
  categories: [],
  products: [],
  settings: {},
  cart: [],
  selectedCategory: 'all',
  deliveryType: 'delivery'
};

document.addEventListener('DOMContentLoaded', () => {
  loadMenuData();
  loadCartFromStorage();
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

async function loadMenuData() {
  try {
    const res = await fetch('/api/menu');
    const data = await res.json();

    if (data.success) {
      state.categories = data.categories;
      state.products = data.products;
      state.settings = data.settings;

      if (state.settings.restaurant_name) {
        document.getElementById('restaurant-title').textContent = state.settings.restaurant_name;
      }

      renderCategoryTabs();
      renderMenuSections();
      updateCartUI();
      handlePaymentMethodChange();
    }
  } catch (err) {
    console.error('Error al cargar el menú:', err);
  }
}

function renderCategoryTabs() {
  const container = document.getElementById('category-tabs');
  if (!container) return;

  container.innerHTML = `
    <button onclick="selectCategory('all')" class="category-tab px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-sm ${state.selectedCategory === 'all' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-slate-700 hover:bg-slate-200'}">
      🔥 Todo el Menú
    </button>
  `;

  state.categories.forEach(cat => {
    const isActive = state.selectedCategory === String(cat.id);
    const btn = document.createElement('button');
    btn.onclick = () => selectCategory(String(cat.id));
    btn.className = `category-tab px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-sm ${isActive ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-slate-700 hover:bg-slate-200'}`;
    btn.textContent = `${cat.icon || '🍽️'} ${cat.name}`;
    container.appendChild(btn);
  });
}

function selectCategory(catId) {
  state.selectedCategory = catId;
  renderCategoryTabs();
  renderMenuSections();
}

function renderMenuSections() {
  const container = document.getElementById('menu-container');
  if (!container) return;

  container.innerHTML = '';

  let filteredCategories = state.categories;
  if (state.selectedCategory !== 'all') {
    filteredCategories = state.categories.filter(c => String(c.id) === String(state.selectedCategory));
  }

  if (filteredCategories.length === 0) {
    container.innerHTML = `<p class="text-center py-8 text-slate-400 text-sm">No hay productos en esta categoría.</p>`;
    return;
  }

  filteredCategories.forEach(cat => {
    const catProducts = state.products.filter(p => String(p.category_id) === String(cat.id) && p.available === 1);
    if (catProducts.length === 0) return;

    const section = document.createElement('div');
    section.className = 'space-y-3';

    section.innerHTML = `
      <h2 class="font-black text-slate-900 text-base flex items-center gap-2 border-b border-slate-200 pb-2">
        <span class="text-xl">${cat.icon || '🍽️'}</span>
        <span>${cat.name}</span>
      </h2>
      <div class="grid grid-cols-1 gap-3">
        ${catProducts.map(p => renderProductCard(p)).join('')}
      </div>
    `;

    container.appendChild(section);
  });
}

function renderProductCard(prod) {
  const cartItem = state.cart.find(item => item.id === prod.id);
  const qty = cartItem ? cartItem.qty : 0;
  const imageUrl = prod.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200';
  const hasVideo = prod.video_url && prod.video_url.trim().length > 0;

  return `
    <div class="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-200 flex gap-3.5 items-start hover:shadow-md transition">
      <div class="relative flex-shrink-0 cursor-pointer group" onclick="openPhotoLightbox('${imageUrl}', '${prod.name.replace(/'/g, "\\'")}', '${(prod.description || '').replace(/'/g, "\\'")}')" title="Toca para ampliar foto en pantalla completa HD">
        <img src="${imageUrl}" alt="${prod.name}" class="w-20 h-20 rounded-xl object-cover bg-slate-100 group-hover:opacity-90 transition">
        <span class="absolute bottom-1 right-1 bg-slate-900/80 text-white p-1 rounded-md text-[9px] font-black backdrop-blur-xs flex items-center gap-0.5">
          🔍 HD
        </span>
      </div>
      
      <div class="flex-1 min-w-0 space-y-1">
        <h3 class="font-extrabold text-slate-900 text-sm leading-snug cursor-pointer hover:text-orange-600 transition" onclick="openPhotoLightbox('${imageUrl}', '${prod.name.replace(/'/g, "\\'")}', '${(prod.description || '').replace(/'/g, "\\'")}')">${prod.name}</h3>
        ${prod.description ? `<p class="text-slate-500 text-[11px] leading-relaxed line-clamp-2 font-normal">${prod.description}</p>` : ''}
        
        <div class="flex items-center gap-2 pt-0.5">
          <div class="font-black text-slate-900 text-sm font-mono">${formatCurrency(prod.price)}</div>
          ${hasVideo ? `
            <button type="button" onclick="event.stopPropagation(); openVideoPlayer('${prod.video_url.replace(/'/g, "\\'")}', '${prod.name.replace(/'/g, "\\'")}')" class="px-2 py-0.5 bg-red-100 hover:bg-red-200 text-red-700 font-extrabold rounded-lg text-[10px] transition flex items-center gap-1">
              🎬 Ver Video
            </button>
          ` : ''}
        </div>
      </div>

      <div class="flex-shrink-0">
        ${qty === 0 ? `
          <button onclick="addToCart(${prod.id})" class="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl shadow transition flex items-center gap-1">
            <span>+</span> Agregar
          </button>
        ` : `
          <div class="flex items-center bg-slate-900 text-white rounded-xl overflow-hidden shadow-md">
            <button onclick="updateItemQty(${prod.id}, -1)" class="px-2 py-1 hover:bg-slate-800 font-bold text-xs">-</button>
            <span class="px-2 font-black text-xs font-mono text-orange-400">${qty}</span>
            <button onclick="addToCart(${prod.id})" class="px-2 py-1 hover:bg-slate-800 font-bold text-xs">+</button>
          </div>
        `}
      </div>
    </div>
  `;
}

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

  const btnDel = document.getElementById('btn-type-delivery');
  const btnRet = document.getElementById('btn-type-takeaway');
  const addrContainer = document.getElementById('address-field-container');

  if (type === 'delivery') {
    btnDel.className = 'py-2.5 rounded-lg transition bg-orange-500 text-white shadow';
    btnRet.className = 'py-2.5 rounded-lg transition text-slate-600 hover:text-slate-900';
    if (addrContainer) addrContainer.style.display = 'block';
  } else {
    btnRet.className = 'py-2.5 rounded-lg transition bg-orange-500 text-white shadow';
    btnDel.className = 'py-2.5 rounded-lg transition text-slate-600 hover:text-slate-900';
    if (addrContainer) addrContainer.style.display = 'none';
  }

  updateCartUI();
}

function handlePaymentMethodChange() {
  const method = document.getElementById('cust-payment').value;
  const noteContainer = document.getElementById('payment-note-container');
  const label = document.getElementById('payment-note-label');
  const input = document.getElementById('cust-payment-note');

  if (!noteContainer) return;
  noteContainer.style.display = 'block';

  if (method === 'Efectivo') {
    label.textContent = '¿Con cuánto abonas? (para el vuelto)';
    input.placeholder = 'Ej: Pago con $10.000';
  } else if (method.includes('Cuenta Corriente')) {
    label.textContent = 'DNI / CUIT de la Cuenta Corriente Autorizada *';
    input.placeholder = 'Ej: 35123456 (Obligatorio para fiado)';
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

  const cartBar = document.getElementById('cart-bar');
  if (totalItems > 0) {
    cartBar.classList.remove('translate-y-32', 'opacity-0', 'pointer-events-none');
  } else {
    cartBar.classList.add('translate-y-32', 'opacity-0', 'pointer-events-none');
    closeCartModal();
  }

  document.getElementById('cart-badge-count').textContent = totalItems;
  document.getElementById('cart-bar-total').textContent = formatCurrency(grandTotal);

  document.getElementById('summary-subtotal').textContent = formatCurrency(subtotal);
  document.getElementById('summary-delivery-cost').textContent = formatCurrency(deliveryCost);
  document.getElementById('summary-total').textContent = formatCurrency(grandTotal);

  const itemsContainer = document.getElementById('cart-items-list');
  if (!itemsContainer) return;

  if (state.cart.length === 0) {
    itemsContainer.innerHTML = `<p class="text-center py-4 text-slate-400 text-xs">Tu carrito está vacío.</p>`;
    return;
  }

  itemsContainer.innerHTML = state.cart.map(item => `
    <div class="py-2.5 flex justify-between items-center text-xs sm:text-sm">
      <div class="flex-1 min-w-0 pr-2">
        <div class="font-extrabold text-slate-800 truncate">${item.name}</div>
        <div class="text-slate-400 text-xs font-mono font-semibold">${formatCurrency(item.price)} x ${item.qty}</div>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex items-center bg-slate-100 rounded-lg border border-slate-200">
          <button onclick="updateItemQty(${item.id}, -1)" class="px-2 py-1 text-slate-600 font-bold hover:bg-slate-200 rounded-l-lg">-</button>
          <span class="px-2 font-black font-mono text-slate-800">${item.qty}</span>
          <button onclick="updateItemQty(${item.id}, 1)" class="px-2 py-1 text-slate-600 font-bold hover:bg-slate-200 rounded-r-lg">+</button>
        </div>
        <span class="font-mono font-black text-slate-900 w-16 text-right">${formatCurrency(item.price * item.qty)}</span>
      </div>
    </div>
  `).join('');
}

function openCartModal() {
  const modal = document.getElementById('cart-modal');
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeCartModal() {
  const modal = document.getElementById('cart-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

function closeOrderSuccessModal() {
  const modal = document.getElementById('order-success-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
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

// ENVIAR PEDIDO A LA BASE DE DATOS Y WHATSAPP
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
    alert('Por favor ingresa la Dirección de Entrega para el Delivery.');
    document.getElementById('cust-address').focus();
    return;
  }

  if (paymentMethod.includes('Cuenta Corriente') && !paymentNote) {
    alert('Por favor ingresa tu DNI / CUIT de la Cuenta Corriente Autorizada.');
    document.getElementById('cust-payment-note').focus();
    return;
  }

  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const deliveryCost = state.deliveryType === 'delivery' ? parseFloat(state.settings.delivery_cost || 1200) : 0;
  const total = subtotal + deliveryCost;

  const orderPayload = {
    customer_name: name,
    customer_phone: rawPhone,
    address: state.deliveryType === 'delivery' ? address : 'Retiro en Local',
    delivery_type: state.deliveryType,
    payment_method: paymentMethod,
    payment_note: paymentNote,
    notes,
    items: state.cart,
    total
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });

    const data = await res.json();
    if (!data.success) {
      alert(`⚠️ ERROR AL PROCESAR PEDIDO: ${data.error}`);
      return;
    }

    const orderNumber = data.order.order_number;

    let itemsText = state.cart.map(i => `• ${i.qty}x ${i.name} ($${i.price * i.qty})`).join('\n');
    let message = `🛒 *NUEVO PEDIDO DE COMIDA* (${orderNumber})\n\n`;
    message += `👤 *Cliente:* ${name}\n`;
    message += `📞 *Teléfono:* ${rawPhone}\n`;
    message += `🛵 *Tipo:* ${state.deliveryType === 'delivery' ? 'Delivery a Domicilio' : 'Retiro en Local'}\n`;
    if (state.deliveryType === 'delivery') message += `📍 *Dirección:* ${address}\n`;
    message += `💳 *Pago:* ${paymentMethod} ${paymentNote ? `(${paymentNote})` : ''}\n\n`;
    message += `📋 *DETALLE DEL PEDIDO:*\n${itemsText}\n\n`;
    if (notes) message += `⚠️ *Notas:* ${notes}\n\n`;
    if (state.deliveryType === 'delivery') message += `Envío: ${formatCurrency(deliveryCost)}\n`;
    message += `💰 *TOTAL A PAGAR: ${formatCurrency(total)}*`;

    // Vaciar carrito y cerrar modal checkout
    state.cart = [];
    saveCartToStorage();
    updateCartUI();
    closeCartModal();

    // Formatear destino de WhatsApp
    const targetPhone = formatWhatsAppNumber(state.settings.whatsapp_phone || '5491112345678');
    const waUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;

    // Mostrar Modal de Confirmación de Éxito en pantalla
    document.getElementById('success-order-number').textContent = `ORDEN ${orderNumber}`;
    document.getElementById('success-wa-btn').href = waUrl;
    
    const successModal = document.getElementById('order-success-modal');
    successModal.classList.remove('opacity-0', 'pointer-events-none');

    // Intentar abrir WhatsApp en pestaña nueva
    window.open(waUrl, '_blank');
  } catch (err) {
    console.error('Error al enviar pedido:', err);
    alert('Ocurrió un error al registrar el pedido. Intenta nuevamente.');
  }
}

// ==========================================
// VISOR DE FOTO FULLSCREEN (LIGHTBOX) & REPRODUCTOR DE VIDEO
// ==========================================

function openPhotoLightbox(imageUrl, title, desc) {
  const modal = document.getElementById('photo-lightbox-modal');
  const img = document.getElementById('lightbox-img');
  const titleElem = document.getElementById('lightbox-title');
  const descElem = document.getElementById('lightbox-desc');

  if (img) img.src = imageUrl;
  if (titleElem) titleElem.textContent = title;
  if (descElem) descElem.textContent = desc || 'Ampliación HD al ancho de pantalla';

  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closePhotoLightbox() {
  const modal = document.getElementById('photo-lightbox-modal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

function openVideoPlayer(videoUrl, title) {
  const modal = document.getElementById('video-modal');
  const titleElem = document.getElementById('video-modal-title');
  const contentElem = document.getElementById('video-player-content');

  if (titleElem) titleElem.textContent = `🎬 Video de Preparación: ${title}`;

  if (contentElem) {
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      let embedUrl = videoUrl;
      if (videoUrl.includes('watch?v=')) {
        const id = videoUrl.split('watch?v=')[1].split('&')[0];
        embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1`;
      } else if (videoUrl.includes('youtu.be/')) {
        const id = videoUrl.split('youtu.be/')[1].split('?')[0];
        embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1`;
      }
      contentElem.innerHTML = `<iframe src="${embedUrl}" class="w-full h-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    } else {
      contentElem.innerHTML = `<video src="${videoUrl}" controls autoplay class="w-full max-h-[70vh] object-contain"></video>`;
    }
  }

  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeVideoPlayer() {
  const modal = document.getElementById('video-modal');
  const contentElem = document.getElementById('video-player-content');
  if (contentElem) contentElem.innerHTML = '';
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}
