const state = {
  categories: [],
  products: [],
  settings: {},
  cart: [],
  selectedCategory: 'all',
  deliveryType: 'delivery'
};

window.deferredInstallPrompt = window.deferredInstallPrompt || null;

window.addEventListener('beforeinstallprompt', (e) => {
  window.deferredInstallPrompt = e;
  const installBanner = document.getElementById('pwa-install-banner');
  if (installBanner) installBanner.classList.remove('hidden');
});

function triggerPwaInstall() {
  if (window.deferredInstallPrompt) {
    window.deferredInstallPrompt.prompt();
    window.deferredInstallPrompt.userChoice.then((choiceResult) => {
      window.deferredInstallPrompt = null;
      const installBanner = document.getElementById('pwa-install-banner');
      if (installBanner) installBanner.classList.add('hidden');
    });
  } else {
    alert('📲 ¡La App "Comidas Portal" ya está instalada o lista en tu celular!\n\nSi ya tenés el acceso directo en la pantalla de inicio, abrilo directamente desde ahí.\n\nSi querés agregarlo de nuevo: tocá los 3 puntos arriba a la derecha en Chrome y elegí "Agregar a la pantalla principal".');
  }
}

async function emergencyAppReset() {
  const confirmReset = confirm('📱 ¿Deseas reiniciar y limpiar la app por completo en este dispositivo?');
  if (!confirmReset) return;

  try {
    localStorage.clear();
    sessionStorage.clear();

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (let reg of registrations) {
        await reg.unregister();
      }
    }

    window.location.href = window.location.pathname + '?reset=' + Date.now();
  } catch (err) {
    window.location.reload(true);
  }
}

async function forceReinstallApp() {
  return emergencyAppReset();
}

document.addEventListener('DOMContentLoaded', () => {
  closeAllPublicModals();
  loadMenuData();
  loadCartFromStorage();

  if (window.location.search.includes('action=share')) {
    setTimeout(() => {
      shareAppWhatsApp();
    }, 600);
  }
});

// Asegurar cierre de modales si el usuario minimizo y volvio a abrir la app
window.addEventListener('pageshow', () => {
  closeAllPublicModals();
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

function shareAppWhatsApp() {
  const restName = (state.settings && state.settings.restaurant_name) ? state.settings.restaurant_name : 'La Gran Rotisería, Bar & Drugstore 24hs';
  const shareText = `https://spressgastro-ar.com\n\n🍳 *${restName}*\n¡Hola! 👋 Te comparto nuestro Menú Digital 24hs. Mirá los platos, fotos y videos de preparación para pedir online desde tu celular.`;
  
  if (navigator.share) {
    navigator.share({
      title: `${restName} - Comidas Portal`,
      text: shareText,
      url: "https://spressgastro-ar.com"
    }).catch(err => {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
    });
  } else {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
  }
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

      const addr = state.settings.restaurant_address || 'España 1028 (Casi Yrigoyen)';
      const addrEl = document.getElementById('restaurant-address-text');
      if (addrEl) addrEl.textContent = addr;

      const checkoutAddrEl = document.getElementById('checkout-pickup-address-text');
      if (checkoutAddrEl) checkoutAddrEl.textContent = `📍 ${addr}`;

      const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
      const mapEl1 = document.getElementById('restaurant-address-map-link');
      if (mapEl1) mapEl1.href = mapLink;
      const mapEl2 = document.getElementById('checkout-pickup-map-link');
      if (mapEl2) mapEl2.href = mapLink;

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
    <button onclick="selectCategory('all')" class="category-tab px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs ${state.selectedCategory === 'all' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-slate-700 hover:bg-slate-200'}">
      🔥 Todo el Menú
    </button>
  `;

  state.categories.forEach(cat => {
    const isActive = state.selectedCategory === String(cat.id);
    const btn = document.createElement('button');
    btn.onclick = () => selectCategory(String(cat.id));
    btn.className = `category-tab px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs ${isActive ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-slate-700 hover:bg-slate-200'}`;
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
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        ${catProducts.map(p => renderProductCard(p)).join('')}
      </div>
    `;

    container.appendChild(section);
  });
}

function renderProductCard(prod) {
  const cartItem = state.cart.find(item => item.id === prod.id);
  const qty = cartItem ? cartItem.qty : 0;
  const rawImage = prod.image_url ? prod.image_url.trim() : '';
  const fallbackUrl = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200';
  const imageUrl = rawImage.length > 0 ? rawImage : fallbackUrl;
  const hasVideo = prod.video_url && prod.video_url.trim().length > 0;

  return `
    <div class="bg-white rounded-2xl p-2.5 sm:p-3 shadow-xs border border-slate-200/80 flex flex-col justify-between hover:shadow-md transition group">
      <div>
        <!-- Foto HD y Video Badge -->
        <div class="relative w-full aspect-4/3 rounded-xl overflow-hidden bg-slate-100 cursor-pointer group flex-shrink-0 border border-slate-200/60 shadow-xs mb-2" onclick="openPhotoLightboxByProductId(${prod.id})" title="Toca para ampliar foto en pantalla completa HD">
          <img src="${imageUrl}" alt="${prod.name}" onerror="this.onerror=null; this.src='${fallbackUrl}';" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
          
          <span class="absolute top-1.5 left-1.5 bg-slate-900/80 text-white px-1.5 py-0.5 rounded-md text-[9px] font-black backdrop-blur-xs flex items-center gap-0.5 shadow">
            🔍 HD
          </span>

          ${hasVideo ? `
            <button type="button" onclick="event.stopPropagation(); openVideoPlayerByProductId(${prod.id})" class="absolute bottom-1.5 right-1.5 px-2 py-1 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black rounded-lg text-[9px] transition flex items-center gap-1 shadow-md leading-none">
              🎬 Video
            </button>
          ` : ''}
        </div>

        <!-- Título y Descripción -->
        <div class="space-y-1">
          <h3 class="font-extrabold text-slate-900 text-xs sm:text-sm leading-tight cursor-pointer hover:text-orange-600 transition line-clamp-2" onclick="openPhotoLightboxByProductId(${prod.id})">${prod.name}</h3>
          ${prod.description ? `<p class="text-slate-500 text-[10px] sm:text-[11px] leading-snug line-clamp-2 font-normal">${prod.description}</p>` : ''}
        </div>
      </div>

      <!-- Precio y Botón Agregar -->
      <div class="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between gap-1">
        <div class="font-black text-slate-950 text-xs sm:text-sm font-mono tracking-tight">${formatCurrency(prod.price)}</div>
        
        <div>
          ${qty === 0 ? `
            <button onclick="addToCart(${prod.id})" class="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-extrabold text-[11px] sm:text-xs px-2.5 sm:px-3 py-1.5 rounded-xl shadow-xs transition flex items-center gap-0.5">
              <span>+</span> Agregar
            </button>
          ` : `
            <div class="flex items-center bg-slate-900 text-white rounded-xl overflow-hidden shadow-xs">
              <button onclick="updateItemQty(${prod.id}, -1)" class="px-2 py-1 hover:bg-slate-800 font-bold text-xs">-</button>
              <span class="px-1.5 font-black text-xs font-mono text-orange-400">${qty}</span>
              <button onclick="addToCart(${prod.id})" class="px-2 py-1 hover:bg-slate-800 font-bold text-xs">+</button>
            </div>
          `}
        </div>
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
  const pickupInfoContainer = document.getElementById('pickup-info-container');

  if (type === 'delivery') {
    btnDel.className = 'py-2.5 rounded-lg transition bg-orange-500 text-white shadow';
    btnRet.className = 'py-2.5 rounded-lg transition text-slate-600 hover:text-slate-900';
    if (addrContainer) addrContainer.style.display = 'block';
    if (pickupInfoContainer) pickupInfoContainer.classList.add('hidden');
  } else {
    btnRet.className = 'py-2.5 rounded-lg transition bg-orange-500 text-white shadow';
    btnDel.className = 'py-2.5 rounded-lg transition text-slate-600 hover:text-slate-900';
    if (addrContainer) addrContainer.style.display = 'none';
    if (pickupInfoContainer) pickupInfoContainer.classList.remove('hidden');
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
  if (cartBar) {
    if (totalItems > 0) {
      cartBar.classList.remove('translate-y-32', 'opacity-0');
    } else {
      cartBar.classList.add('translate-y-32', 'opacity-0');
      closeCartModal();
    }
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

function pushModalState(name) {
  try {
    history.pushState({ modalOpen: name }, '');
  } catch (e) {}
}

window.addEventListener('popstate', (e) => {
  closeAllPublicModals();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllPublicModals();
  }
});

function closeAllPublicModals() {
  closePhotoLightbox();
  closeVideoPlayer();
  closeCartModal();
  const successModal = document.getElementById('order-success-modal');
  if (successModal && !successModal.classList.contains('opacity-0')) {
    closeOrderSuccessModal();
  }
}

function openCartModal() {
  const modal = document.getElementById('cart-modal');
  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeCartModal() {
  const modal = document.getElementById('cart-modal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

function closeOrderSuccessModal() {
  const modal = document.getElementById('order-success-modal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
  state.cart = [];
  saveCartToStorage();
  updateCartUI();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function saveCartToStorage() {
  try {
    localStorage.setItem('rotiseria_cart', JSON.stringify(state.cart));
  } catch (e) {}
}

function loadCartFromStorage() {
  state.cart = [];
  try {
    localStorage.removeItem('rotiseria_cart');
  } catch (e) {}
  updateCartUI();
}

function clearCart() {
  state.cart = [];
  saveCartToStorage();
  updateCartUI();
  closeCartModal();
  const errorBox = document.getElementById('checkout-form-error');
  if (errorBox) errorBox.classList.add('hidden');
}

function showCheckoutError(msg, elementIdToFocus) {
  const errorBox = document.getElementById('checkout-form-error');
  const errorText = document.getElementById('checkout-form-error-text');
  if (errorBox && errorText) {
    errorText.textContent = '⚠️ ' + msg;
    errorBox.classList.remove('hidden');
  }
  if (elementIdToFocus) {
    const el = document.getElementById(elementIdToFocus);
    if (el) el.focus();
  }
}

function formatCurrency(val) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
}

// ENVIAR PEDIDO A LA BASE DE DATOS Y WHATSAPP
async function submitOrderToWhatsApp() {
  const errorBox = document.getElementById('checkout-form-error');
  if (errorBox) errorBox.classList.add('hidden');

  if (state.cart.length === 0) {
    showCheckoutError('Tu carrito está vacío. Agregá comidas antes de continuar.');
    return;
  }

  const name = document.getElementById('cust-name').value.trim();
  const rawPhone = document.getElementById('cust-phone').value.trim();
  const address = document.getElementById('cust-address').value.trim();
  const paymentMethod = document.getElementById('cust-payment').value;
  const paymentNote = document.getElementById('cust-payment-note').value.trim();
  const notes = document.getElementById('cust-notes').value.trim();

  if (!name) {
    showCheckoutError('Por favor ingresá tu Nombre Completo.', 'cust-name');
    return;
  }

  if (!rawPhone) {
    showCheckoutError('Por favor ingresá tu Celular / WhatsApp.', 'cust-phone');
    return;
  }

  if (state.deliveryType === 'delivery' && !address) {
    showCheckoutError('Por favor ingresá la Dirección de Envío para el Delivery.', 'cust-address');
    return;
  }

  if (paymentMethod.includes('Cuenta Corriente') && !paymentNote) {
    showCheckoutError('Por favor ingresá tu DNI / CUIT para la Cuenta Corriente.', 'cust-payment-note');
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

// ==========================================
// VISOR DE FOTO FULLSCREEN (LIGHTBOX) & REPRODUCTOR DE VIDEO
// ==========================================

function openPhotoLightboxByProductId(productId) {
  closeAllPublicModals();
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;
  const imageUrl = prod.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200';

  const modal = document.getElementById('photo-lightbox-modal');
  const img = document.getElementById('lightbox-img');
  const titleElem = document.getElementById('lightbox-title');
  const descElem = document.getElementById('lightbox-desc');

  if (img) img.src = imageUrl;
  if (titleElem) titleElem.textContent = prod.name;
  if (descElem) descElem.textContent = prod.description || 'Ampliación HD al ancho de pantalla';

  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
}

function openPhotoLightbox(imageUrl, title, desc) {
  closeAllPublicModals();
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

function getEmbedVideoInfo(videoUrl) {
  if (!videoUrl) return null;
  const url = videoUrl.trim();

  // 1. YouTube Shorts (https://www.youtube.com/shorts/VIDEO_ID)
  if (url.includes('youtube.com/shorts/')) {
    const parts = url.split('youtube.com/shorts/')[1];
    const id = parts.split('?')[0].split('/')[0];
    return { type: 'iframe', src: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` };
  }

  // 2. YouTube Standard Watch / Mobile (https://www.youtube.com/watch?v=VIDEO_ID)
  if (url.includes('youtube.com/watch') || url.includes('m.youtube.com/watch')) {
    const match = url.match(/[?&]v=([^&]+)/);
    if (match && match[1]) {
      return { type: 'iframe', src: `https://www.youtube.com/embed/${match[1]}?autoplay=1&rel=0` };
    }
  }

  // 3. YouTube Shortened (https://youtu.be/VIDEO_ID)
  if (url.includes('youtu.be/')) {
    const parts = url.split('youtu.be/')[1];
    const id = parts.split('?')[0].split('/')[0];
    return { type: 'iframe', src: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` };
  }

  // 4. Vimeo (https://vimeo.com/VIDEO_ID)
  if (url.includes('vimeo.com/')) {
    const match = url.match(/vimeo\.com\/(\d+)/);
    if (match && match[1]) {
      return { type: 'iframe', src: `https://player.vimeo.com/video/${match[1]}?autoplay=1` };
    }
  }

  // 5. Archivo de Video Directo (MP4, WebM, OGG, MOV)
  if (url.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i)) {
    return { type: 'video', src: url };
  }

  // 6. Enlace Web Genérico (TikTok, Instagram Reels, Google Drive, Facebook, etc.)
  return { type: 'link', src: url };
}

function openVideoPlayerByProductId(productId) {
  closeAllPublicModals();
  const prod = state.products.find(p => p.id === productId);
  if (!prod || !prod.video_url) {
    return;
  }

  openVideoPlayer(prod.video_url, prod.name);
}

function openVideoPlayer(videoUrl, title) {
  const modal = document.getElementById('video-modal');
  const titleElem = document.getElementById('video-modal-title');
  const contentElem = document.getElementById('video-player-content');

  if (titleElem) titleElem.textContent = `🎬 Video de Preparación: ${title || 'Producto'}`;

  const info = getEmbedVideoInfo(videoUrl);

  if (contentElem && info) {
    if (info.type === 'iframe') {
      contentElem.innerHTML = `
        <iframe src="${info.src}" class="w-full h-full border-0 aspect-video rounded-2xl" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      `;
    } else if (info.type === 'video') {
      contentElem.innerHTML = `
        <video src="${info.src}" controls autoplay class="w-full max-h-[75vh] object-contain rounded-2xl"></video>
      `;
    } else {
      contentElem.innerHTML = `
        <div class="w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950 text-white text-center space-y-4 rounded-2xl">
          <div class="w-16 h-16 bg-red-600/20 text-red-500 rounded-full flex items-center justify-center text-3xl mx-auto shadow-inner">
            🎬
          </div>
          <h4 class="font-extrabold text-lg text-amber-400">Ver Video de Preparación (${title || 'Plato'})</h4>
          <p class="text-xs text-slate-400 max-w-sm">Presiona el botón a continuación para abrir y reproducir el video de demostración directamente:</p>
          <a href="${info.src}" target="_blank" rel="noopener noreferrer" class="px-6 py-3.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black rounded-2xl text-sm transition shadow-lg flex items-center gap-2">
            ▶️ Reproducir Video Externo en Nueva Pestaña
          </a>
        </div>
      `;
    }
  }

  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
  pushModalState('video');
}

function closeVideoPlayer() {
  const modal = document.getElementById('video-modal');
  const contentElem = document.getElementById('video-player-content');
  if (contentElem) contentElem.innerHTML = '';
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}
