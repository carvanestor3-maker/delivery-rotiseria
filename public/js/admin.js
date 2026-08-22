let products = [];
let categories = [];
let settings = {};
let cashOrders = [];
let customerAccounts = [];
let rawMaterials = [];
let suppliers = [];
let selectedAdminCat = 'all';

document.addEventListener('DOMContentLoaded', () => {
  loadData();
});

async function loadData() {
  await Promise.all([loadCashSummary(), loadProducts(), loadCategories(), loadSettings(), loadAccounts(), loadStockMaterials()]);
}

// Cargar Insumos y Stock General
async function loadStockMaterials() {
  try {
    const res = await fetch('/api/admin/stock');
    const data = await res.json();
    if (data.success) {
      rawMaterials = data.raw_materials || [];
      suppliers = data.suppliers || [];
      renderMaterialsTable();
      populateAdjustStockSelect();
    }
  } catch (err) {
    console.error('Error al cargar materias primas:', err);
  }
}

function renderMaterialsTable() {
  const tbody = document.getElementById('materials-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (rawMaterials.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400">No hay insumos registrados en el stock general.</td></tr>`;
    return;
  }

  rawMaterials.forEach(m => {
    const isLow = (m.current_stock || 0) <= (m.min_stock || 0);
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';

    tr.innerHTML = `
      <td class="p-4 font-extrabold text-slate-900 flex items-center gap-2">
        <span>📦 ${m.name}</span>
        ${isLow ? `<span class="bg-red-100 text-red-700 text-[10px] font-black px-2 py-0.5 rounded-md">⚠️ Stock Bajo</span>` : ''}
      </td>
      <td class="p-4 text-xs font-bold text-slate-600 uppercase">
        ${m.unit}
      </td>
      <td class="p-4 font-mono">
        <span class="text-base font-black ${isLow ? 'text-red-600' : 'text-slate-900'}">
          ${m.current_stock || 0} ${m.unit}
        </span>
      </td>
      <td class="p-4 font-mono text-xs text-slate-500 font-bold">
        ${m.min_stock || 0} ${m.unit}
      </td>
      <td class="p-4 text-right space-x-2">
        <button onclick="openAdjustStockModal(${m.id})" class="px-2.5 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 font-extrabold rounded-lg text-xs transition" title="Conciliar Stock Real (Exclusivo Nivel 3)">
          👑 Conciliar (Nivel 3)
        </button>
        <button onclick="editRawMaterial(${m.id})" class="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition" title="Editar Insumo">
          <i data-lucide="edit-2" class="w-4 h-4"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  lucide.createIcons();
}

function populateAdjustStockSelect() {
  const sel = document.getElementById('adj-material-id');
  if (!sel) return;
  sel.innerHTML = rawMaterials.map(m => `<option value="${m.id}">${m.name} (Stock Virtual Actual: ${m.current_stock} ${m.unit})</option>`).join('');
}

function openAdjustStockModal(matId = null) {
  loadStockMaterials();
  const modal = document.getElementById('adjust-stock-modal');
  const form = document.getElementById('adjust-stock-form');
  form.reset();

  if (matId) {
    document.getElementById('adj-material-id').value = matId;
    const mat = rawMaterials.find(m => m.id === matId);
    if (mat) document.getElementById('adj-real-stock').value = mat.current_stock || 0;
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeAdjustStockModal() {
  const modal = document.getElementById('adjust-stock-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

async function submitStockAdjustment(e) {
  e.preventDefault();
  const raw_material_id = document.getElementById('adj-material-id').value;
  const real_stock = document.getElementById('adj-real-stock').value;
  const reason = document.getElementById('adj-reason').value.trim();
  const pin = document.getElementById('adj-pin').value.trim();

  try {
    const res = await fetch('/api/admin/stock/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_material_id, real_stock, reason, pin })
    });
    const data = await res.json();
    if (data.success) {
      closeAdjustStockModal();
      const diffSign = data.difference >= 0 ? `+${data.difference}` : `${data.difference}`;
      alert(`⚖️ CONCILIACIÓN NIVEL 3 AUTORIZADA EXITOSAMENTE:\n\nInsumo: ${data.raw_material_name}\nStock anterior: ${data.old_stock}\nStock real nuevo: ${data.new_stock}\nDiferencia/Ajuste: ${diffSign}`);
      await loadStockMaterials();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al conciliar stock:', err);
  }
}

function openRawMaterialModal(mat = null) {
  const modal = document.getElementById('material-modal');
  const title = document.getElementById('material-modal-title');
  const form = document.getElementById('material-form');

  form.reset();
  if (mat) {
    title.textContent = 'Editar Insumo de Stock';
    document.getElementById('mat-id').value = mat.id;
    document.getElementById('mat-name').value = mat.name;
    document.getElementById('mat-unit').value = mat.unit || 'kg';
    document.getElementById('mat-min').value = mat.min_stock || 5;
    document.getElementById('mat-current').value = mat.current_stock || 0;
  } else {
    title.textContent = 'Nuevo Insumo de Stock';
    document.getElementById('mat-id').value = '';
    document.getElementById('mat-unit').value = 'kg';
    document.getElementById('mat-min').value = 5;
    document.getElementById('mat-current').value = 0;
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeRawMaterialModal() {
  const modal = document.getElementById('material-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

function editRawMaterial(id) {
  const mat = rawMaterials.find(m => m.id === id);
  if (mat) openRawMaterialModal(mat);
}

async function saveRawMaterial(e) {
  e.preventDefault();
  const id = document.getElementById('mat-id').value;
  const name = document.getElementById('mat-name').value.trim();
  const unit = document.getElementById('mat-unit').value;
  const min_stock = document.getElementById('mat-min').value;
  const current_stock = document.getElementById('mat-current').value;
  const pin = document.getElementById('mat-pin').value.trim();

  try {
    const res = await fetch('/api/admin/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id ? parseInt(id) : null, name, unit, min_stock, current_stock, pin })
    });
    const data = await res.json();
    if (data.success) {
      closeRawMaterialModal();
      await loadStockMaterials();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al guardar insumo:', err);
  }
}

// Cargar Cuentas Corrientes
async function loadAccounts() {
  try {
    const res = await fetch('/api/admin/accounts');
    const data = await res.json();
    if (data.success) {
      customerAccounts = data.accounts;
      renderAccountsTable();
    }
  } catch (err) {
    console.error('Error al cargar cuentas corrientes:', err);
  }
}

function renderAccountsTable() {
  const tbody = document.getElementById('accounts-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (customerAccounts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">No hay clientes registrados en Cuenta Corriente.</td></tr>`;
    return;
  }

  customerAccounts.forEach(a => {
    const isExceeded = (a.balance || 0) > (a.credit_limit || 0);
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';

    tr.innerHTML = `
      <td class="p-4">
        <div class="font-extrabold text-slate-900">${a.name}</div>
        <div class="text-xs font-mono text-slate-400">DNI: ${a.dni}</div>
      </td>
      <td class="p-4 text-xs">
        <div class="font-bold text-slate-700">📞 ${a.phone}</div>
        <div class="text-slate-400">${a.address || 'Sin domicilio registrado'}</div>
      </td>
      <td class="p-4 text-xs font-extrabold uppercase">
        <span class="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700">
          🗓️ ${a.payment_term}
        </span>
      </td>
      <td class="p-4 font-mono">
        <span class="text-base font-black ${a.balance > 0 ? (isExceeded ? 'text-red-600' : 'text-amber-600') : 'text-emerald-600'}">
          ${formatCurrency(a.balance || 0)}
        </span>
        ${isExceeded ? `<span class="block text-[10px] font-bold text-red-500">⚠️ Excede Límite</span>` : ''}
      </td>
      <td class="p-4 font-mono font-bold text-slate-700">
        ${formatCurrency(a.credit_limit || 0)}
      </td>
      <td class="p-4 text-right space-x-2">
        <button onclick="openPaymentModal(${a.id})" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs shadow-sm transition">
          💰 Registrar Cobro
        </button>
        <button onclick="editAccount(${a.id})" class="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition" title="Editar (Nivel 3)">
          <i data-lucide="edit-2" class="w-4 h-4"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  lucide.createIcons();
}

function openAccountModal(acc = null) {
  const modal = document.getElementById('account-modal');
  const title = document.getElementById('account-modal-title');
  const form = document.getElementById('account-form');

  form.reset();
  if (acc) {
    title.textContent = 'Editar Cliente en Cuenta Corriente (Nivel 3)';
    document.getElementById('acc-id').value = acc.id;
    document.getElementById('acc-name').value = acc.name;
    document.getElementById('acc-dni').value = acc.dni;
    document.getElementById('acc-phone').value = acc.phone;
    document.getElementById('acc-address').value = acc.address || '';
    document.getElementById('acc-term').value = acc.payment_term || 'quincenal';
    document.getElementById('acc-limit').value = acc.credit_limit || 20000;
  } else {
    title.textContent = 'Registrar Cliente en CC (Exclusivo Nivel 3)';
    document.getElementById('acc-id').value = '';
    document.getElementById('acc-limit').value = 20000;
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeAccountModal() {
  const modal = document.getElementById('account-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

function editAccount(id) {
  const acc = customerAccounts.find(a => a.id === id);
  if (acc) openAccountModal(acc);
}

async function saveAccount(e) {
  e.preventDefault();
  const id = document.getElementById('acc-id').value;
  const name = document.getElementById('acc-name').value.trim();
  const dni = document.getElementById('acc-dni').value.trim();
  const phone = document.getElementById('acc-phone').value.trim();
  const address = document.getElementById('acc-address').value.trim();
  const payment_term = document.getElementById('acc-term').value;
  const credit_limit = document.getElementById('acc-limit').value;
  const pin = document.getElementById('acc-pin').value.trim();

  try {
    const res = await fetch('/api/admin/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id ? parseInt(id) : null, name, dni, phone, address, payment_term, credit_limit, pin })
    });
    const data = await res.json();
    if (data.success) {
      closeAccountModal();
      await loadAccounts();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al guardar cliente en CC:', err);
  }
}

function openPaymentModal(accId) {
  const acc = customerAccounts.find(a => a.id === accId);
  if (!acc) return;

  const modal = document.getElementById('payment-modal');
  document.getElementById('pay-acc-id').value = acc.id;
  document.getElementById('pay-acc-name').textContent = `Cliente: ${acc.name}`;
  document.getElementById('pay-acc-dni').textContent = `DNI: ${acc.dni}`;
  document.getElementById('pay-acc-balance').textContent = `Deuda Total: ${formatCurrency(acc.balance || 0)}`;

  document.getElementById('pay-type').value = 'parcial';
  document.getElementById('pay-amount').value = Math.min(5000, acc.balance || 0);

  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closePaymentModal() {
  const modal = document.getElementById('payment-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

function handlePayTypeChange() {
  const accId = parseInt(document.getElementById('pay-acc-id').value);
  const acc = customerAccounts.find(a => a.id === accId);
  const payType = document.getElementById('pay-type').value;
  const amountInput = document.getElementById('pay-amount');

  if (acc && payType === 'total') {
    amountInput.value = acc.balance || 0;
  }
}

async function submitAccountPayment(e) {
  e.preventDefault();
  const accId = parseInt(document.getElementById('pay-acc-id').value);
  const amount = parseFloat(document.getElementById('pay-amount').value);
  const payment_type = document.getElementById('pay-type').value;
  const notes = document.getElementById('pay-notes').value.trim();

  try {
    const res = await fetch(`/api/admin/accounts/${accId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, payment_type, notes })
    });
    const data = await res.json();
    if (data.success) {
      closePaymentModal();
      await loadAccounts();
      await loadCashSummary();
      alert(`✅ Cobro de ${formatCurrency(amount)} registrado con éxito e ingresado a Caja.`);
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al registrar cobro:', err);
  }
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
      document.getElementById('set-encargado-pin').value = settings.encargado_pin || '2222';
      document.getElementById('set-admin-pin').value = settings.admin_pin || '9999';
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
        <button onclick="editProduct(${p.id})" class="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition" title="Editar (Nivel 3)">
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
    title.textContent = 'Editar Producto (Exclusivo Nivel 3)';
    document.getElementById('prod-id').value = prod.id;
    document.getElementById('prod-name').value = prod.name;
    document.getElementById('prod-category').value = prod.category_id;
    document.getElementById('prod-price').value = prod.price;
    document.getElementById('prod-desc').value = prod.description || '';
    document.getElementById('prod-image').value = prod.image_url || '';
    showImagePreview(prod.image_url || '');
    document.getElementById('prod-available').checked = prod.available === 1;
  } else {
    title.textContent = 'Nuevo Producto (Exclusivo Nivel 3)';
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
  const pin = document.getElementById('prod-pin').value.trim();

  try {
    const res = await fetch('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: id ? parseInt(id) : null,
        name, category_id, price, description, image_url, available, pin
      })
    });
    const data = await res.json();
    if (data.success) {
      closeProductModal();
      await loadProducts();
    } else {
      alert(`⚠️ ${data.error}`);
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
  const encargado_pin = document.getElementById('set-encargado-pin').value.trim();
  const admin_pin = document.getElementById('set-admin-pin').value.trim();
  const epson_printer_ip = document.getElementById('set-epson-ip').value.trim();
  const auto_print_epson = document.getElementById('set-auto-print').checked ? '1' : '0';

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_name, whatsapp_phone, delivery_cost, encargado_pin, admin_pin, epson_printer_ip, auto_print_epson })
    });
    const data = await res.json();
    if (data.success) {
      alert('¡Configuración y Claves PIN (Nivel 2 y Nivel 3) guardadas correctamente!');
    }
  } catch (err) {
    console.error('Error al guardar ajustes:', err);
  }
}

function switchTab(tab) {
  const cSection = document.getElementById('tab-cash');
  const aSection = document.getElementById('tab-accounts');
  const kSection = document.getElementById('tab-stock');
  const pSection = document.getElementById('tab-products');
  const sSection = document.getElementById('tab-settings');
  
  const cBtn = document.getElementById('tab-btn-cash');
  const aBtn = document.getElementById('tab-btn-accounts');
  const kBtn = document.getElementById('tab-btn-stock');
  const pBtn = document.getElementById('tab-btn-products');
  const sBtn = document.getElementById('tab-btn-settings');

  cSection.classList.add('hidden');
  aSection.classList.add('hidden');
  kSection.classList.add('hidden');
  pSection.classList.add('hidden');
  sSection.classList.add('hidden');

  cBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';
  aBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';
  kBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';
  pBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';
  sBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';

  if (tab === 'cash') {
    cSection.classList.remove('hidden');
    cBtn.className = 'tab-btn pb-3 border-b-2 border-orange-500 text-orange-600 flex items-center gap-2 font-bold';
    loadCashSummary();
  } else if (tab === 'accounts') {
    aSection.classList.remove('hidden');
    aBtn.className = 'tab-btn pb-3 border-b-2 border-orange-500 text-orange-600 flex items-center gap-2 font-bold';
    loadAccounts();
  } else if (tab === 'stock') {
    kSection.classList.remove('hidden');
    kBtn.className = 'tab-btn pb-3 border-b-2 border-orange-500 text-orange-600 flex items-center gap-2 font-bold';
    loadStockMaterials();
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
