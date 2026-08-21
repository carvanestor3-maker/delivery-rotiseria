let products = [];
let categories = [];
let settings = {};
let cashOrders = [];
let selectedAdminCat = 'all';

document.addEventListener('DOMContentLoaded', () => {
  loadData();
});

async function loadData() {
  await Promise.all([loadCashSummary(), loadProducts(), loadCategories(), loadSettings()]);
}

// Lector de fotos de la PC / Celular
function handleImageFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    document.getElementById('prod-image').value = dataUrl;
    showImagePreview(dataUrl);
  };
  reader.readAsDataURL(file);
}

function showImagePreview(url) {
  const container = document.getElementById('image-preview-container');
  const img = document.getElementById('image-preview');
  if (url) {
    img.src = url;
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
}

// Cargar reporte de caja del día
async function loadCashSummary() {
  try {
    const res = await fetch('/api/cash/summary');
    const data = await res.json();
    if (data.success) {
      const s = data.summary;
      cashOrders = data.orders;

      document.getElementById('cash-collected-val').textContent = formatCurrency(s.cash_collected);
      document.getElementById('cash-pending-val').textContent = formatCurrency(s.cash_pending);
      document.getElementById('card-total-val').textContent = formatCurrency(s.card_total);
      document.getElementById('digital-total-val').textContent = formatCurrency(s.digital_total);
      document.getElementById('cash-orders-count').textContent = `${s.orders_count} pedidos registrados`;

      renderCashOrdersTable();
    }
  } catch (err) {
    console.error('Error al cargar reporte de caja:', err);
  }
}

function renderCashOrdersTable() {
  const tbody = document.getElementById('cash-orders-table-body');
  tbody.innerHTML = '';

  if (cashOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">No hay transacciones registradas hoy.</td></tr>`;
    return;
  }

  cashOrders.forEach(o => {
    const isPaid = o.paid === 1;
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';

    tr.innerHTML = `
      <td class="p-3 font-mono font-bold text-orange-600">
        ${o.order_number}
      </td>
      <td class="p-3">
        <div class="font-bold text-slate-900">${o.customer_name}</div>
        <div class="text-xs text-slate-400">${o.customer_phone}</div>
      </td>
      <td class="p-3 font-medium text-slate-700 text-xs">
        ${o.payment_method} ${o.payment_note ? `<span class="text-slate-400">(${o.payment_note})</span>` : ''}
      </td>
      <td class="p-3 font-mono font-bold text-slate-900">
        ${formatCurrency(o.total)}
      </td>
      <td class="p-3 text-xs font-bold">
        <span class="px-2 py-0.5 rounded-full ${o.status === 'entregado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
          ${o.status.toUpperCase()}
        </span>
      </td>
      <td class="p-3 text-right">
        <button onclick="toggleCashPaid(${o.id}, ${!isPaid})" class="px-3 py-1.5 rounded-xl text-xs font-extrabold shadow-sm transition ${isPaid ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-orange-500 hover:bg-orange-600 text-white'}">
          ${isPaid ? '✅ Ingresado a Caja' : '💰 Ingresar a Caja'}
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

async function toggleCashPaid(orderId, newPaidStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}/paid`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: newPaidStatus })
    });
    const data = await res.json();
    if (data.success) {
      await loadCashSummary();
    }
  } catch (err) {
    console.error('Error al cambiar ingreso a caja:', err);
  }
}

async function loadProducts() {
  try {
    const res = await fetch('/api/admin/products');
    const data = await res.json();
    if (data.success) {
      products = data.products;
      renderProductsTable();
    }
  } catch (e) {
    console.error('Error al cargar productos:', e);
  }
}

async function loadCategories() {
  try {
    const res = await fetch('/api/menu');
    const data = await res.json();
    if (data.success) {
      categories = data.categories;
      populateCategorySelect();
      renderAdminCategoryFilters();
    }
  } catch (e) {
    console.error('Error al cargar categorías:', e);
  }
}

function renderAdminCategoryFilters() {
  const container = document.getElementById('admin-category-filters');
  if (!container) return;

  container.innerHTML = `
    <button onclick="setAdminCatFilter('all')" class="px-3 py-1 rounded-xl text-xs font-bold transition ${selectedAdminCat === 'all' ? 'bg-orange-500 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
      🔥 Todos
    </button>
  `;

  categories.forEach(c => {
    const isActive = selectedAdminCat === String(c.id);
    const btn = document.createElement('button');
    btn.onclick = () => setAdminCatFilter(String(c.id));
    btn.className = `px-3 py-1 rounded-xl text-xs font-bold transition ${isActive ? 'bg-orange-500 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`;
    btn.textContent = `${c.icon || '🍽️'} ${c.name}`;
    container.appendChild(btn);
  });
}

function setAdminCatFilter(catId) {
  selectedAdminCat = catId;
  renderAdminCategoryFilters();
  renderProductsTable();
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success) {
      settings = data.settings;
      document.getElementById('set-restaurant-name').value = settings.restaurant_name || '';
      document.getElementById('set-whatsapp-phone').value = settings.whatsapp_phone || '';
      document.getElementById('set-delivery-cost').value = settings.delivery_cost || '1200';
      document.getElementById('set-epson-ip').value = settings.epson_printer_ip || '';
      document.getElementById('set-auto-print').checked = settings.auto_print_epson === '1';
    }
  } catch (e) {
    console.error('Error al cargar ajustes:', e);
  }
}

function renderProductsTable() {
  const tbody = document.getElementById('products-table-body');
  tbody.innerHTML = '';

  let filtered = products;
  if (selectedAdminCat !== 'all') {
    filtered = products.filter(p => String(p.category_id) === String(selectedAdminCat));
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400">No hay productos en esta categoría.</td></tr>`;
    return;
  }

  filtered.forEach(p => {
    const isAvail = p.available === 1;
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';

    tr.innerHTML = `
      <td class="p-4 font-bold text-slate-900 flex items-center gap-3">
        <img src="${p.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100'}" class="w-10 h-10 rounded-lg object-cover bg-slate-100 flex-shrink-0">
        <div>
          <div>${p.name}</div>
          <div class="text-xs font-normal text-slate-400 line-clamp-1">${p.description || ''}</div>
        </div>
      </td>
      <td class="p-4 text-xs font-semibold text-slate-600">
        <span class="bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
          ${p.category_icon || '🍽️'} ${p.category_name || 'Sin categoría'}
        </span>
      </td>
      <td class="p-4 font-mono font-bold text-slate-900">
        ${formatCurrency(p.price)}
      </td>
      <td class="p-4">
        <button onclick="toggleAvailability(${p.id})" class="px-2.5 py-1 rounded-full text-xs font-extrabold flex items-center gap-1 transition ${isAvail ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}">
          ${isAvail ? '🟢 Activo' : '🔴 Pausado (Agotado)'}
        </button>
      </td>
      <td class="p-4 text-right space-x-2">
        <button onclick="editProduct(${p.id})" class="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition" title="Editar">
          <i data-lucide="edit-2" class="w-4 h-4"></i>
        </button>
        <button onclick="deleteProduct(${p.id})" class="p-1.5 bg-red-50 hover:bg-red-100 rounded-lg text-red-600 transition" title="Eliminar">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  lucide.createIcons();
}

function populateCategorySelect() {
  const sel = document.getElementById('prod-category');
  sel.innerHTML = categories.map(c => `<option value="${c.id}">${c.icon || '🍽️'} ${c.name}</option>`).join('');
}

function openProductModal(prod = null) {
  const modal = document.getElementById('product-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('product-form');

  form.reset();
  showImagePreview('');

  if (prod) {
    title.textContent = 'Editar Producto';
    document.getElementById('prod-id').value = prod.id;
    document.getElementById('prod-name').value = prod.name;
    document.getElementById('prod-category').value = prod.category_id;
    document.getElementById('prod-price').value = prod.price;
    document.getElementById('prod-desc').value = prod.description || '';
    document.getElementById('prod-image').value = prod.image_url || '';
    showImagePreview(prod.image_url || '');
    document.getElementById('prod-available').checked = prod.available === 1;
  } else {
    title.textContent = 'Nuevo Producto';
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-available').checked = true;
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeProductModal() {
  const modal = document.getElementById('product-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

function openCategoryModal() {
  const modal = document.getElementById('category-modal');
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeCategoryModal() {
  const modal = document.getElementById('category-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

async function saveCategory(e) {
  e.preventDefault();
  const name = document.getElementById('cat-name').value.trim();
  const icon = document.getElementById('cat-icon').value.trim();

  try {
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, icon })
    });
    const data = await res.json();
    if (data.success) {
      closeCategoryModal();
      await loadCategories();
    }
  } catch (err) {
    console.error('Error al guardar categoría:', err);
  }
}

function editProduct(id) {
  const prod = products.find(p => p.id === id);
  if (prod) openProductModal(prod);
}

async function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('prod-id').value;
  const name = document.getElementById('prod-name').value.trim();
  const category_id = document.getElementById('prod-category').value;
  const price = document.getElementById('prod-price').value;
  const description = document.getElementById('prod-desc').value.trim();
  const image_url = document.getElementById('prod-image').value.trim();
  const available = document.getElementById('prod-available').checked;

  try {
    const res = await fetch('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: id ? parseInt(id) : null,
        name, category_id, price, description, image_url, available
      })
    });
    const data = await res.json();
    if (data.success) {
      closeProductModal();
      await loadProducts();
    }
  } catch (err) {
    console.error('Error al guardar producto:', err);
  }
}

async function toggleAvailability(id) {
  try {
    const res = await fetch(`/api/admin/products/${id}/toggle`, { method: 'PUT' });
    const data = await res.json();
    if (data.success) {
      await loadProducts();
    }
  } catch (err) {
    console.error('Error al pausar/activar:', err);
  }
}

async function deleteProduct(id) {
  if (!confirm('¿Seguro que deseas eliminar este producto?')) return;
  try {
    const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      await loadProducts();
    }
  } catch (err) {
    console.error('Error al eliminar producto:', err);
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const restaurant_name = document.getElementById('set-restaurant-name').value.trim();
  const whatsapp_phone = document.getElementById('set-whatsapp-phone').value.trim();
  const delivery_cost = document.getElementById('set-delivery-cost').value.trim();
  const epson_printer_ip = document.getElementById('set-epson-ip').value.trim();
  const auto_print_epson = document.getElementById('set-auto-print').checked ? '1' : '0';

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_name, whatsapp_phone, delivery_cost, epson_printer_ip, auto_print_epson })
    });
    const data = await res.json();
    if (data.success) {
      alert('¡Configuración guardada correctamente!');
    }
  } catch (err) {
    console.error('Error al guardar ajustes:', err);
  }
}

function switchTab(tab) {
  const cSection = document.getElementById('tab-cash');
  const pSection = document.getElementById('tab-products');
  const sSection = document.getElementById('tab-settings');
  
  const cBtn = document.getElementById('tab-btn-cash');
  const pBtn = document.getElementById('tab-btn-products');
  const sBtn = document.getElementById('tab-btn-settings');

  cSection.classList.add('hidden');
  pSection.classList.add('hidden');
  sSection.classList.add('hidden');

  cBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';
  pBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';
  sBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';

  if (tab === 'cash') {
    cSection.classList.remove('hidden');
    cBtn.className = 'tab-btn pb-3 border-b-2 border-orange-500 text-orange-600 flex items-center gap-2 font-bold';
    loadCashSummary();
  } else if (tab === 'products') {
    pSection.classList.remove('hidden');
    pBtn.className = 'tab-btn pb-3 border-b-2 border-orange-500 text-orange-600 flex items-center gap-2 font-bold';
  } else {
    sSection.classList.remove('hidden');
    sBtn.className = 'tab-btn pb-3 border-b-2 border-orange-500 text-orange-600 flex items-center gap-2 font-bold';
  }
}

function formatCurrency(val) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
}
