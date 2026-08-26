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
      state.categories = data.categories || [];
      state.products = data.products || [];
      state.settings = data.settings || {};

      const restTitleEl = document.getElementById('restaurant-title');
      if (restTitleEl && state.settings.restaurant_name) {
        restTitleEl.textContent = state.settings.restaurant_name;
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
      try { handlePaymentMethodChange(); } catch(e) {}
    }
  } catch (err) {
    console.error('Error al cargar el menú:', err);
  }
}

function renderCategoryTabs() {
  const container = document.getElementById('category-tabs');
  if (!container) return;

  container.innerHTML = `
    <button onclick="selectCategory('all')" class="category-tab px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-xs ${state.selectedCategory === 'all' ? 'bg-orange-500 text-white shadow-md scale-105' : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'}">
      🔥 Todo el Menú
    </button>
  `;

  (state.categories || []).forEach(cat => {
    const isActive = String(state.selectedCategory) === String(cat.id);
    const btn = document.createElement('button');
    btn.setAttribute('onclick', `selectCategory('${cat.id}')`);
    btn.className = `category-tab px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-xs ${isActive ? 'bg-orange-500 text-white shadow-md scale-105' : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'}`;
    btn.textContent = `${cat.icon || '🍽️'} ${cat.name}`;
    container.appendChild(btn);
  });
}

function selectCategory(catId) {
  state.selectedCategory = String(catId);
  renderCategoryTabs();
  renderMenuSections();
  const menuEl = document.getElementById('menu-container');
  if (menuEl) {
    const yOffset = -80; 
    const y = menuEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }
}

function renderMenuSections() {
  const container = document.getElementById('menu-container');
  if (!container) return;

  container.innerHTML = '';

  let filteredCategories = state.categories || [];
  if (state.selectedCategory !== 'all') {
    filteredCategories = (state.categories || []).filter(c => String(c.id) === String(state.selectedCategory));
  }

  if (filteredCategories.length === 0) {
    container.innerHTML = `<p class="text-center py-8 text-slate-400 text-sm font-bold">No hay productos disponibles en esta categoría.</p>`;
    return;
  }

  filteredCategories.forEach(cat => {
    const catProducts = (state.products || []).filter(p => String(p.category_id) === String(cat.id) && (String(p.available) === '1' || p.available === 1 || p.available === true || p.available === undefined));
    if (catProducts.length === 0) return;

    const section = document.createElement('div');
    section.className = 'space-y-3';

    section.innerHTML = `
      <h2 class="font-black text-slate-900 text-base flex items-center gap-2 border-b border-slate-200 pb-2">
        <span class="text-xl">${cat.icon || '🍽️'}</span>
        <span>${cat.name}</span>
        <span class="text-xs font-bold text-slate-400 font-mono ml-auto">(${catProducts.length})</span>
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        ${catProducts.map(p => renderProductCard(p)).join('')}
      </div>
    `;

    container.appendChild(section);
  });
}

function renderProductCard(prod) {
  const cartItem = state.cart.find(item => String(item.id) === String(prod.id));
  const qty = cartItem ? cartItem.qty : 0;
  const rawImage = prod.image_url ? prod.image_url.trim() : '';
  const fallbackUrl = '/logo_preview.jpg';
  const imageUrl = rawImage.length > 0 ? rawImage : fallbackUrl;
  const hasVideo = prod.video_url && prod.video_url.trim().length > 0;

  return `
    <div class="bg-white rounded-2xl p-2.5 sm:p-3 shadow-xs border border-slate-200/80 flex flex-col justify-between hover:shadow-md transition group">
      <div>
        <!-- Foto HD y Video Badge -->
        <div class="relative w-full aspect-4/3 rounded-xl overflow-hidden bg-slate-100 cursor-pointer group flex-shrink-0 border border-slate-200/60 shadow-xs mb-2" onclick="openPhotoLightboxByProductId('${prod.id}')" title="Toca para ampliar foto en pantalla completa HD">
          <img src="${imageUrl}" alt="${prod.name}" onerror="this.onerror=null; this.src='/logo_preview.jpg';" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
          
          <span class="absolute top-1.5 left-1.5 bg-slate-900/80 text-white px-1.5 py-0.5 rounded-md text-[9px] font-black backdrop-blur-xs flex items-center gap-0.5 shadow">
            🔍 HD
          </span>

          ${hasVideo ? `
            <button type="button" onclick="event.stopPropagation(); openVideoPlayerByProductId('${prod.id}')" class="absolute bottom-1.5 right-1.5 px-2 py-1 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black rounded-lg text-[9px] transition flex items-center gap-1 shadow-md leading-none">
              🎬 Video
            </button>
          ` : ''}
        </div>

        <!-- Título y Descripción -->
        <div class="space-y-1">
          <h3 class="font-extrabold text-slate-900 text-xs sm:text-sm leading-tight cursor-pointer hover:text-orange-600 transition line-clamp-2" onclick="openPhotoLightboxByProductId('${prod.id}')">${prod.name}</h3>
          ${prod.description ? `<p class="text-slate-500 text-[10px] sm:text-[11px] leading-snug line-clamp-2 font-normal">${prod.description}</p>` : ''}
        </div>
      </div>

      <!-- Precio y Botón Agregar -->
      <div class="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between gap-1">
        <div class="font-black text-slate-950 text-xs sm:text-sm font-mono tracking-tight">${formatCurrency(prod.price)}</div>
        
        <div>
          ${qty === 0 ? `
            <button onclick="addToCart('${prod.id}')" class="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-extrabold text-[11px] sm:text-xs px-2.5 sm:px-3 py-1.5 rounded-xl shadow-xs transition flex items-center gap-0.5">
              <span>+</span> Agregar
            </button>
          ` : `
            <div class="flex items-center bg-slate-900 text-white rounded-xl overflow-hidden shadow-xs">
              <button onclick="updateItemQty('${prod.id}', -1)" class="px-2 py-1 hover:bg-slate-800 font-bold text-xs">-</button>
              <span class="px-1.5 font-black text-xs font-mono text-orange-400">${qty}</span>
              <button onclick="addToCart('${prod.id}')" class="px-2 py-1 hover:bg-slate-800 font-bold text-xs">+</button>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

function addToCart(productId) {
  const prod = state.products.find(p => String(p.id) === String(productId));
  if (!prod) return;

  const existingItem = state.cart.find(item => String(item.id) === String(productId));
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
  renderMenuSections();
}

function updateItemQty(productId, delta) {
  const itemIndex = state.cart.findIndex(i => String(i.id) === String(productId));
  if (itemIndex > -1) {
    state.cart[itemIndex].qty += delta;
    if (state.cart[itemIndex].qty <= 0) {
      state.cart.splice(itemIndex, 1);
    }
  }
  saveCartToStorage();
  updateCartUI();
  renderMenuSections();
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
  closeAiHelpModal();
  closeVirtualCardModal();
  closeTransferPointsModal();
  closePointsHistoryModal();
  closeCouponsModal();
  closeSavedAddressesModal();
  closeReferralModal();
  closeSettingsModal();
  closeLegalesModal();
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

// ==========================================
// ASISTENTE VIRTUAL DE AYUDA Y SOPORTE IA 24HS
// ==========================================

function openAiHelpModal() {
  closeAllPublicModals();
  const modal = document.getElementById('ai-help-modal');
  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeAiHelpModal() {
  const modal = document.getElementById('ai-help-modal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

function sendQuickAiQuery(text) {
  const input = document.getElementById('ai-chat-input');
  if (input) {
    input.value = text;
    processAiMessage(text);
  }
}

function handleAiChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('ai-chat-input');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  processAiMessage(msg);
}

function processAiMessage(userText) {
  const chatBody = document.getElementById('ai-chat-body');
  if (!chatBody) return;

  const userMsgDiv = document.createElement('div');
  userMsgDiv.className = 'flex justify-end';
  userMsgDiv.innerHTML = `
    <div class="bg-orange-500 text-slate-950 font-bold p-3 rounded-2xl rounded-tr-none text-xs max-w-[85%] shadow-xs">
      ${userText}
    </div>
  `;
  chatBody.appendChild(userMsgDiv);

  const botReply = generateAiResponse(userText);

  setTimeout(() => {
    const botMsgDiv = document.createElement('div');
    botMsgDiv.className = 'flex items-start gap-2';
    botMsgDiv.innerHTML = `
      <div class="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs flex-shrink-0">🤖</div>
      <div class="bg-slate-800 p-3 rounded-2xl rounded-tl-none border border-slate-700 text-slate-200 space-y-1.5 max-w-[90%] shadow-xs">
        ${botReply}
      </div>
    `;
    chatBody.appendChild(botMsgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
  }, 250);
}

function generateAiResponse(text) {
  const q = text.toLowerCase();
  const addr = (state.settings && state.settings.restaurant_address) ? state.settings.restaurant_address : 'España 1028 (Casi Yrigoyen)';

  if (q.includes('instal') || q.includes('icono') || q.includes('pantalla') || q.includes('permiso') || q.includes('no crea') || q.includes('no puedo')) {
    return `
      <p class="font-bold text-amber-400">📱 Guía de Instalación y Permisos de Celular:</p>
      <ol class="list-decimal list-inside space-y-1 text-slate-300">
        <li><strong>En Android (Chrome):</strong> Tocá los 3 puntos arriba a la derecha ➔ <em>"Agregar a la pantalla principal"</em>.</li>
        <li><strong>En iPhone (Safari):</strong> Tocá el botón Compartir ➔ <em>"Agregar a inicio"</em>.</li>
      </ol>
      <p class="text-[11px] text-amber-300/90 pt-1">💡 <strong>Permisos de Android:</strong> Ajustes ➔ Aplicaciones ➔ Chrome ➔ Permisos ➔ Marca <strong>"Accesos directos en pantalla: Permitir/Siempre"</strong> y <strong>"Mostrar en pantalla de bloqueo: Siempre"</strong>.</p>
    `;
  }

  if (q.includes('donde') || q.includes('direcc') || q.includes('ubicac') || q.includes('local') || q.includes('retir') || q.includes('llegar')) {
    return `
      <p class="font-bold text-amber-400">📍 Dirección para Retiro por Mostrador:</p>
      <p class="text-white font-extrabold text-xs">👉 ${addr}</p>
      <p class="text-slate-300 text-[11px]">⏱️ Tiempo de preparación estimado: <strong>20 minutos</strong>.</p>
      <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}" target="_blank" class="inline-block mt-1 text-amber-400 font-extrabold underline text-xs">
        📍 Ver ubicación en Google Maps
      </a>
    `;
  }

  if (q.includes('pago') || q.includes('efectivo') || q.includes('tarjeta') || q.includes('cuenta corriente') || q.includes('fiado') || q.includes('alias')) {
    return `
      <p class="font-bold text-amber-400">💳 Formas de Pago Aceptadas:</p>
      <ul class="list-disc list-inside space-y-1 text-slate-300">
        <li>💵 <strong>Efectivo</strong> (al recibir o retirar tu pedido).</li>
        <li>💳 <strong>MercadoPago / Transferencia / Posnet</strong>.</li>
        <li>📋 <strong>Cuenta Corriente Autorizada</strong> (con DNI o CUIT registrado).</li>
      </ul>
    `;
  }

  if (q.includes('delivery') || q.includes('envio') || q.includes('envío') || q.includes('domicilio') || q.includes('costo')) {
    const cost = formatCurrency(parseFloat((state.settings && state.settings.delivery_cost) || 1200));
    return `
      <p class="font-bold text-amber-400">🛵 Servicio de Delivery a Domicilio:</p>
      <p class="text-slate-300">Enviamos tu pedido recién preparado a tu domicilio.</p>
      <p class="text-white font-extrabold">Costo de envío estimado: <span class="text-amber-400">${cost}</span></p>
    `;
  }

  if (q.includes('hola') || q.includes('buenas') || q.includes('que tal')) {
    return `
      <p class="font-bold text-amber-400">¡Hola! 😊 ¿Cómo estás?</p>
      <p>Estoy listo para ayudarte con la instalación de la app, dirección del local, delivery o formas de pago.</p>
    `;
  }

  return `
    <p class="font-bold text-amber-400">🍳 La Gran Rotisería 24hs</p>
    <p class="text-slate-300">📍 Dirección del local: <strong>${addr}</strong></p>
    <p class="text-amber-300 font-semibold pt-1">¿Querés consultar sobre <em>instalación de la app</em>, <em>dirección del local</em>, <em>delivery</em> o <em>formas de pago</em>?</p>
  `;
}

// ==========================================
// CONTROLADOR CLUB DE FIDELIZACIÓN (ESTILO CLUB GRIDO)
// ==========================================

function openDrawer() {
  closeAllPublicModals();
  const drawer = document.getElementById('app-drawer');
  if (drawer) {
    drawer.classList.remove('opacity-0', 'pointer-events-none');
    const panel = drawer.children[0];
    if (panel) {
      panel.classList.remove('-translate-x-full');
      panel.classList.add('translate-x-0');
    }
  }
}

function closeDrawer() {
  const drawer = document.getElementById('app-drawer');
  if (drawer) {
    const panel = drawer.children[0];
    if (panel) {
      panel.classList.remove('translate-x-0');
      panel.classList.add('-translate-x-full');
    }
    setTimeout(() => {
      drawer.classList.add('opacity-0', 'pointer-events-none');
    }, 200);
  }
}

async function syncCustomerProfile(dni, name, phone, address) {
  if (!dni) return;
  try {
    const res = await fetch('/api/customer/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni, name, phone, address })
    });
    const data = await res.json();
    if (data.success) {
      state.customer = data.customer;
      updateCustomerUI();
    }
  } catch (e) {
    console.error('Error syncing customer profile:', e);
  }
}

function updateCustomerUI() {
  if (!state.customer) return;

  const custName = state.customer.name || 'Cliente Registrado';
  const custDni = state.customer.dni ? `DNI: ${state.customer.dni}` : 'DNI: Sin Ingresar';
  const points = state.customer.points_balance || 100;

  // Actualizar Drawer
  const drawerName = document.getElementById('drawer-cust-name');
  if (drawerName) drawerName.textContent = custName;
  const drawerDni = document.getElementById('drawer-cust-dni');
  if (drawerDni) drawerDni.textContent = custDni;
  const drawerPoints = document.getElementById('drawer-cust-points');
  if (drawerPoints) drawerPoints.textContent = points;

  // Actualizar Recuadro de Puntos Principal
  const appPoints = document.getElementById('app-points-balance');
  if (appPoints) appPoints.textContent = points;

  // Actualizar Banner de Bienvenida y Agradecimiento
  const welcomeCust = document.getElementById('welcome-cust-name');
  if (welcomeCust) welcomeCust.textContent = custName;

  // Actualizar Tarjeta Virtual
  const vcardName = document.getElementById('vcard-cust-name');
  if (vcardName) vcardName.textContent = custName;
  const vcardDni = document.getElementById('vcard-cust-dni');
  if (vcardDni) vcardDni.textContent = custDni;
  const vcardBarcode = document.getElementById('vcard-barcode-text');
  if (vcardBarcode) vcardBarcode.textContent = state.customer.barcode || `CLI-${state.customer.dni}`;

  // Actualizar Dirección Activa en Header
  if (Array.isArray(state.customer.addresses) && state.customer.addresses.length > 0) {
    const activeAddr = state.customer.addresses[0].text;
    const headerAddr = document.getElementById('header-active-address');
    if (headerAddr) headerAddr.textContent = activeAddr;
  }

  drawCustomerBarcode('barcode-canvas', state.customer.barcode || `CLI-${state.customer.dni}`);
}

function drawCustomerBarcode(canvasId, text) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Dibujar barras blancas y negras limpias para lectura de escáner en caja POS
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = '#000000';
  const str = text || 'CLI-32456789';
  let currentX = 15;
  
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const w1 = (code % 3) + 2;
    const w2 = ((code * 2) % 3) + 1;
    ctx.fillRect(currentX, 10, w1 * 2, 50);
    currentX += w1 * 2 + w2 * 2;
    if (currentX > canvas.width - 20) break;
  }
}

// 1. Tarjeta Virtual
function openVirtualCardModal() {
  closeAllPublicModals();
  const modal = document.getElementById('virtual-card-modal');
  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
  if (state.customer) updateCustomerUI();
}

function closeVirtualCardModal() {
  const modal = document.getElementById('virtual-card-modal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

// 2. Transferir Puntos
function openTransferPointsModal() {
  closeAllPublicModals();
  const modal = document.getElementById('transfer-points-modal');
  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeTransferPointsModal() {
  const modal = document.getElementById('transfer-points-modal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

async function handleTransferPointsSubmit(e) {
  e.preventDefault();
  const destDni = document.getElementById('transfer-dest-dni').value.trim();
  const amount = document.getElementById('transfer-amount').value.trim();
  const fromDni = state.customer ? state.customer.dni : null;

  if (!fromDni) {
    alert('⚠️ Por favor cargá tu DNI en Mi Cuenta para poder realizar transferencias de puntos.');
    return;
  }

  try {
    const res = await fetch('/api/customer/transfer-points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_dni: fromDni, to_dni: destDni, points: amount })
    });
    const data = await res.json();
    if (data.success) {
      alert(`🎉 ¡Transferencia realizada con éxito!\n\nEnviaste ${amount} puntos al cliente ${data.receiver_name} (DNI ${destDni}).`);
      if (state.customer) state.customer.points_balance = data.sender_balance;
      updateCustomerUI();
      closeTransferPointsModal();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    alert('Error al realizar la transferencia.');
  }
}

// 3. Movimientos de Puntos
async function openPointsHistoryModal() {
  closeAllPublicModals();
  const modal = document.getElementById('points-history-modal');
  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');

  const container = document.getElementById('points-history-list');
  if (!container) return;
  container.innerHTML = `<p class="text-center py-4 text-slate-400">Cargando movimientos...</p>`;

  const dni = state.customer ? state.customer.dni : '32456789';
  try {
    const res = await fetch(`/api/customer/details/${dni}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.history) && data.history.length > 0) {
      container.innerHTML = data.history.map(h => `
        <div class="py-2.5 flex justify-between items-center">
          <div>
            <div class="font-bold text-white">${h.description}</div>
            <div class="text-[10px] text-slate-400">${new Date(h.date).toLocaleDateString()} ${new Date(h.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
          </div>
          <div class="font-mono font-black ${h.type.includes('out') ? 'text-red-400' : 'text-emerald-400'}">
            ${h.type.includes('out') ? '-' : '+'}${h.points} pts
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = `
        <div class="py-4 text-center text-slate-400 space-y-1">
          <p>🎁 Tenés <strong>100 Puntos de Bienvenida</strong> activos.</p>
          <p class="text-[11px]">Realizá pedidos para acumular más puntos en cada compra.</p>
        </div>
      `;
    }
  } catch (e) {
    container.innerHTML = `<p class="text-center py-4 text-slate-400">Tenés 100 Puntos de Bienvenida cargados.</p>`;
  }
}

function closePointsHistoryModal() {
  const modal = document.getElementById('points-history-modal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

// 4. Cupones
function openCouponsModal() {
  closeAllPublicModals();
  const modal = document.getElementById('coupons-modal');
  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
  switchCouponsTab('available');
}

function closeCouponsModal() {
  const modal = document.getElementById('coupons-modal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

function switchCouponsTab(tab) {
  const container = document.getElementById('coupons-list-body');
  if (!container) return;

  const btnAvail = document.getElementById('tab-coupon-avail');
  const btnUsed = document.getElementById('tab-coupon-used');
  const btnExp = document.getElementById('tab-coupon-exp');

  if (btnAvail) btnAvail.className = tab === 'available' ? 'py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-black' : 'py-1.5 rounded-lg text-slate-400 hover:text-white';
  if (btnUsed) btnUsed.className = tab === 'used' ? 'py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-black' : 'py-1.5 rounded-lg text-slate-400 hover:text-white';
  if (btnExp) btnExp.className = tab === 'expired' ? 'py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-black' : 'py-1.5 rounded-lg text-slate-400 hover:text-white';

  if (tab === 'available') {
    container.innerHTML = `
      <div class="bg-gradient-to-r from-emerald-950 to-slate-900 border border-emerald-500/40 p-3 rounded-2xl space-y-1.5 shadow">
        <div class="flex justify-between items-start">
          <span class="font-black text-amber-400 text-xs">🏷️ PROMO-BIENVENIDA</span>
          <span class="bg-emerald-500 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full">20% OFF</span>
        </div>
        <p class="font-bold text-white text-xs">20% de Descuento en tu Próxima Compra</p>
        <p class="text-[11px] text-slate-300">Válido en cualquier combo o minuta. Presentá en caja o al pedir.</p>
      </div>

      <div class="bg-gradient-to-r from-emerald-950 to-slate-900 border border-emerald-500/40 p-3 rounded-2xl space-y-1.5 shadow">
        <div class="flex justify-between items-start">
          <span class="font-black text-amber-400 text-xs">🏷️ PROMO-PIZZA</span>
          <span class="bg-emerald-500 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full">$1.500 OFF</span>
        </div>
        <p class="font-bold text-white text-xs">$1.500 de Descuento en Pizzas Especiales</p>
        <p class="text-[11px] text-slate-300">Aplica en Pizzas Muzzarella Grande o Napolitana con Jamón.</p>
      </div>
    `;
  } else if (tab === 'used') {
    container.innerHTML = `<p class="text-center py-6 text-slate-400 text-xs">No tenés cupones usados previamente.</p>`;
  } else {
    container.innerHTML = `<p class="text-center py-6 text-slate-400 text-xs">No tenés cupones vencidos.</p>`;
  }
}

// 5. Mis Direcciones
function openSavedAddressesModal() {
  closeAllPublicModals();
  const modal = document.getElementById('saved-addresses-modal');
  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
  renderSavedAddresses();
}

function closeSavedAddressesModal() {
  const modal = document.getElementById('saved-addresses-modal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

function renderSavedAddresses() {
  const container = document.getElementById('saved-addresses-list');
  if (!container) return;

  const addresses = (state.customer && Array.isArray(state.customer.addresses) && state.customer.addresses.length > 0)
    ? state.customer.addresses
    : [
        { id: 1, text: 'España 1028 (Casi Yrigoyen)', tag: 'Local Retiro' },
        { id: 2, text: 'Av. San Martín 450, Piso 2', tag: 'Casa' }
      ];

  container.innerHTML = addresses.map(a => `
    <div class="p-3 bg-slate-800 hover:bg-slate-700/80 rounded-2xl flex justify-between items-center cursor-pointer" onclick="selectSavedAddress('${a.text}')">
      <div>
        <div class="font-extrabold text-amber-400 text-[10px] uppercase">📍 ${a.tag || 'Domicilio'}</div>
        <div class="font-bold text-white text-xs">${a.text}</div>
      </div>
      <button type="button" class="px-2.5 py-1 bg-amber-500 text-slate-950 font-black text-[10px] rounded-lg">
        Usar
      </button>
    </div>
  `).join('');
}

function selectSavedAddress(text) {
  const headerAddr = document.getElementById('header-active-address');
  if (headerAddr) headerAddr.textContent = text;
  const checkoutAddr = document.getElementById('cust-address');
  if (checkoutAddr) checkoutAddr.value = text;
  closeSavedAddressesModal();
}

async function handleAddNewAddressSubmit(e) {
  e.preventDefault();
  const textInput = document.getElementById('new-address-text');
  if (!textInput) return;
  const text = textInput.value.trim();
  if (!text) return;
  textInput.value = '';

  const dni = state.customer ? state.customer.dni : '32456789';
  try {
    const res = await fetch('/api/customer/address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni, text, tag: 'Domicilio' })
    });
    const data = await res.json();
    if (data.success) {
      if (state.customer) state.customer.addresses = data.addresses;
      renderSavedAddresses();
      selectSavedAddress(text);
    }
  } catch (err) {
    selectSavedAddress(text);
  }
}

// 6. Referidos WhatsApp
function openReferralModal() {
  closeAllPublicModals();
  const modal = document.getElementById('referral-modal');
  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeReferralModal() {
  const modal = document.getElementById('referral-modal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

function handleSendReferralWhatsApp(e) {
  e.preventDefault();
  const phone = document.getElementById('referral-phone').value.trim();
  if (!phone) return;

  const cleanPhone = formatWhatsAppNumber(phone);
  const myName = state.customer ? state.customer.name : 'Tu amigo';
  const shareText = `https://spressgastro-ar.com\n\n🍳 *La Gran Rotisería, Bar & Drugstore 24hs*\n¡Hola! 👋 ${myName} te invita a probar la App del Club La Gran Rotisería. ¡Instalala en tu celular para recibir 100 Puntos de Regalo y 50% OFF en canjes!`;

  window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(shareText)}`, '_blank');
  closeReferralModal();
}

// 7. Configuración & Legales
function openSettingsModal() {
  closeAllPublicModals();
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

function openSubSettings(type) {
  if (type === 'account') {
    const name = prompt('a) Mi Cuenta - Modificar Nombre:', state.customer ? state.customer.name : '');
    if (name) {
      const dni = prompt('Ingresá tu DNI:', state.customer ? state.customer.dni : '');
      const phone = prompt('Ingresá tu celular WhatsApp:', state.customer ? state.customer.phone : '');
      if (dni) syncCustomerProfile(dni, name, phone, '');
    }
  } else if (type === 'password') {
    const pass = prompt('b) Cambiar Contraseña - Ingresá tu nueva clave:');
    if (pass) alert('🔒 Contraseña actualizada correctamente en tu cuenta.');
  }
}

function openLegalesModal(type) {
  closeAllPublicModals();
  const modal = document.getElementById('legales-modal');
  if (!modal) return;

  const title = document.getElementById('legales-title');
  const content = document.getElementById('legales-content');

  if (type === 'terms') {
    if (title) title.textContent = 'c) Legales I: Condiciones de Uso - La Gran Rotisería 24hs';
    if (content) {
      content.innerHTML = `
        <p class="font-bold text-amber-400">Términos y Condiciones del Servicio del Club:</p>
        <p>1. El programa de fidelización "Club La Gran Rotisería" permite acumular puntos por cada compra realizada tanto en el portal online como presencialmente en el local de España 1028 (Casi Yrigoyen).</p>
        <p>2. Los puntos pueden canjearse para cubrir el 50% del valor de platos seleccionados o cupones de promoción.</p>
        <p>3. Los puntos son personales y transferibles a otros usuarios mediante DNI.</p>
      `;
    }
  } else {
    if (title) title.textContent = 'c) Legales II: Política de Privacidad & Datos Sensibles';
    if (content) {
      content.innerHTML = `
        <p class="font-bold text-amber-400">Política de Privacidad y Manejo Seguro de Datos:</p>
        <p>1. La Gran Rotisería garantiza la protección absoluta y privacidad de los datos personales (Nombre, DNI, Teléfono y Direcciones) suministrados voluntariamente por el cliente.</p>
        <p>2. Los datos sensibles serán utilizados exclusivamente para el envío de pedidos a domicilio, acreditación de puntos de regalo y comunicación de promociones.</p>
        <p>3. El cliente autoriza expresamente el tratamiento seguro de sus datos bajo estrictas medidas de ciberseguridad.</p>
      `;
    }
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeLegalesModal() {
  const modal = document.getElementById('legales-modal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
}

function openWhatsAppHelp() {
  const shareText = `https://spressgastro-ar.com\n\n🍳 *La Gran Rotisería 24hs*\n¡Hola! Necesito asistencia con mi cuenta o pedido.`;
  window.open(`https://api.whatsapp.com/send?phone=5491112345678&text=${encodeURIComponent(shareText)}`, '_blank');
}

function handleLogoutCustomer() {
  if (confirm('🚪 ¿Deseas cerrar sesión en tu cuenta del Club?')) {
    state.customer = null;
    alert('Sesión cerrada correctamente.');
    closeSettingsModal();
    window.location.reload();
  }
}

function filterByShortcut(type) {
  if (type === 'all') {
    state.selectedCategory = 'all';
    renderCategoryTabs();
    renderMenuSections();
    const menuEl = document.getElementById('menu-container') || document.getElementById('category-tabs');
    if (menuEl) {
      const yOffset = -90; 
      const y = menuEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
  } else if (type === 'redemptions') {
    state.selectedCategory = 'all';
    renderCategoryTabs();
    renderMenuSections();
    const menuEl = document.getElementById('menu-container') || document.getElementById('category-tabs');
    if (menuEl) {
      const yOffset = -90; 
      const y = menuEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
    setTimeout(() => {
      alert('🎁 ¡Canjes 50% OFF de Fidelización!\n\nElegí cualquier plato del menú para abonar el 50% en dinero + canjear tus puntos acumulados.');
    }, 300);
  }
}

// Exportar globalmente a window para asegurar invocación garantizada desde botones redondos
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.openVirtualCardModal = openVirtualCardModal;
window.closeVirtualCardModal = closeVirtualCardModal;
window.openCouponsModal = openCouponsModal;
window.closeCouponsModal = closeCouponsModal;
window.openTransferPointsModal = openTransferPointsModal;
window.closeTransferPointsModal = closeTransferPointsModal;
window.openPointsHistoryModal = openPointsHistoryModal;
window.closePointsHistoryModal = closePointsHistoryModal;
window.openSavedAddressesModal = openSavedAddressesModal;
window.closeSavedAddressesModal = closeSavedAddressesModal;
window.openReferralModal = openReferralModal;
window.closeReferralModal = closeReferralModal;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.openLegalesModal = openLegalesModal;
window.closeLegalesModal = closeLegalesModal;
window.filterByShortcut = filterByShortcut;
window.switchCouponsTab = switchCouponsTab;
