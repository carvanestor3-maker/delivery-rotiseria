let products = [];
let categories = [];
let settings = {};
let cashOrders = [];
let customerAccounts = [];
let rawMaterials = [];
let suppliers = [];
let staffUsers = [];
let selectedAdminCat = 'all';
let currentActiveShift = null;

if (typeof io !== 'undefined') {
  const socket = io();
  socket.on('cash_shift_updated', () => {
    loadCashSummary();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadData();
});

async function loadData() {
  await Promise.all([loadCashSummary(), loadProducts(), loadCategories(), loadSettings(), loadAccounts(), loadStockMaterials(), loadUsers()]);
}

// Descargar Copia de Seguridad ZIP en el Disco Local (Exclusivo Nivel 3)
function downloadSystemBackup() {
  const pin = prompt('👑 Descarga de Respaldo del Sistema:\nIngrese su PIN Personal de Gerente / Dueño (Nivel 3):');
  if (!pin) return;

  window.location.href = `/api/admin/backup/download?pin=${encodeURIComponent(pin)}`;
}

// Cargar Usuarios / Personal Nombrado
async function loadUsers() {
  try {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    if (data.success) {
      staffUsers = data.users || [];
      await renderUsersLiveMonitor();
      renderUsersTable();
    }
  } catch (err) {
    console.error('Error al cargar personal:', err);
  }
}

async function renderUsersLiveMonitor() {
  const staffListElem = document.getElementById('users-active-staff-list');
  const staffBadgeElem = document.getElementById('users-active-count-badge');
  const shiftsListElem = document.getElementById('users-active-shifts-list');
  const shiftsBadgeElem = document.getElementById('users-active-shifts-count-badge');

  try {
    const resAtt = await fetch('/api/attendance/logs');
    const dataAtt = await resAtt.json();
    if (dataAtt.success) {
      const activeStaff = dataAtt.active_staff || [];
      if (staffBadgeElem) staffBadgeElem.textContent = `${activeStaff.length} activo(s)`;
      if (staffListElem) {
        if (activeStaff.length === 0) {
          staffListElem.innerHTML = `<div class="text-slate-400 italic">No hay personal fichado en turno activo actualmente.</div>`;
        } else {
          staffListElem.innerHTML = activeStaff.map(s => {
            const inTime = new Date(s.clock_in).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            return `
              <div class="flex justify-between items-center bg-white p-2 rounded-xl border border-amber-200 shadow-sm">
                <span class="font-extrabold text-amber-950 flex items-center gap-1.5">🟢 ${s.user_name} <span class="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-[10px] font-extrabold">${s.sector || 'General'}</span> <span class="text-[10px] font-normal text-slate-500">(Nivel ${s.level})</span></span>
                <span class="font-mono text-slate-600 font-bold">Ingreso: ${inTime} hs</span>
              </div>
            `;
          }).join('');
        }
      }
    }
  } catch (e) {
    console.error('Error al renderizar monitor de asistencia:', e);
  }

  if (shiftsBadgeElem) shiftsBadgeElem.textContent = `${activeShiftsList.length} caja(s)`;
  if (shiftsListElem) {
    if (activeShiftsList.length === 0) {
      shiftsListElem.innerHTML = `<div class="text-slate-400 italic">No hay cajas abiertas en este momento.</div>`;
    } else {
      shiftsListElem.innerHTML = activeShiftsList.map(s => {
        const inTime = new Date(s.opened_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        return `
          <div class="flex justify-between items-center bg-white p-2 rounded-xl border border-emerald-200 shadow-sm">
            <span class="font-extrabold text-emerald-950 flex items-center gap-1.5">💰 Caja N° ${s.box_number || 1} <span class="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Cajero: ${s.cashier_name}</span></span>
            <span class="font-mono text-slate-600 font-bold">Abierta: ${inTime} hs</span>
          </div>
        `;
      }).join('');
    }
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (staffUsers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400">No hay personal registrado en el sistema.</td></tr>`;
    return;
  }

  staffUsers.forEach(u => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';

    let levelBadge = '';
    if (u.level === 3) {
      levelBadge = `<span class="bg-purple-100 text-purple-800 border border-purple-300 text-xs font-black px-2.5 py-1 rounded-lg">👑 Nivel 3 (Gerente / Dueño)</span>`;
    } else if (u.level === 2) {
      levelBadge = `<span class="bg-blue-100 text-blue-800 border border-blue-300 text-xs font-bold px-2.5 py-1 rounded-lg">🔑 Nivel 2 (Encargado / Jefe)</span>`;
    } else {
      levelBadge = `<span class="bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold px-2.5 py-1 rounded-lg">📱 Nivel 1 (Operativo / Cajero)</span>`;
    }

    tr.innerHTML = `
      <td class="p-4 font-extrabold text-slate-900">
        👤 ${u.name}
      </td>
      <td class="p-4">
        ${levelBadge}
      </td>
      <td class="p-4 font-mono font-bold text-slate-700">
        •••• (${u.pin})
      </td>
      <td class="p-4">
        <span class="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">🟢 Activo</span>
      </td>
      <td class="p-4 text-right space-x-2">
        <button onclick="editUser(${u.id})" class="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition" title="Editar Personal">
          <i data-lucide="edit-2" class="w-4 h-4"></i>
        </button>
        <button onclick="deleteUser(${u.id})" class="p-1.5 bg-red-50 hover:bg-red-100 rounded-lg text-red-600 transition" title="Eliminar Personal">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  lucide.createIcons();
}

function openUserModal(usr = null) {
  const modal = document.getElementById('user-modal');
  const title = document.getElementById('user-modal-title');
  const form = document.getElementById('user-form');

  form.reset();
  if (usr) {
    title.textContent = 'Editar Personal y Clave (Nivel 3)';
    document.getElementById('usr-id').value = usr.id;
    document.getElementById('usr-name').value = usr.name;
    document.getElementById('usr-level').value = usr.level;
    document.getElementById('usr-pin').value = usr.pin;
  } else {
    title.textContent = 'Alta de Personal (Exclusivo Nivel 3)';
    document.getElementById('usr-id').value = '';
    document.getElementById('usr-level').value = 2;
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeUserModal() {
  const modal = document.getElementById('user-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

function editUser(id) {
  const usr = staffUsers.find(u => u.id === id);
  if (usr) openUserModal(usr);
}

async function saveUser(e) {
  e.preventDefault();
  const id = document.getElementById('usr-id').value;
  const name = document.getElementById('usr-name').value.trim();
  const level = document.getElementById('usr-level').value;
  const pin = document.getElementById('usr-pin').value.trim();
  const admin_pin = document.getElementById('usr-admin-pin').value.trim();

  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id ? parseInt(id) : null, name, level, pin, admin_pin })
    });
    const data = await res.json();
    if (data.success) {
      closeUserModal();
      await loadUsers();
      alert(`✅ Personal "${name}" (Nivel ${level}) guardado exitosamente.`);
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al guardar personal:', err);
  }
}

async function deleteUser(id) {
  const admin_pin = prompt('Ingrese el PIN de Gerente / Dueño (Nivel 3) para confirmar la baja del personal:');
  if (!admin_pin) return;

  try {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_pin })
    });
    const data = await res.json();
    if (data.success) {
      await loadUsers();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al eliminar personal:', err);
  }
}

// Cargar Bitácora de Auditoría (Exclusivo Nivel 3 - Gerente / Dueño)
async function unlockAuditLogs(e) {
  e.preventDefault();
  const pin = document.getElementById('audit-input-pin').value.trim();

  try {
    const res = await fetch('/api/admin/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('audit-pin-prompt').classList.add('hidden');
      document.getElementById('audit-logs-content').classList.remove('hidden');

      renderBillingMultiPeriod(data.billing || {});
      renderAuditAdjustments(data.stock_adjustments || []);
      renderAuditShifts(data.cash_shifts || []);
      renderAuditEntries(data.stock_entries || []);
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al cargar bitácora:', err);
  }
}

function renderBillingMultiPeriod(b) {
  if (!b) return;

  // Diario
  const d = b.diario || {};
  document.getElementById('bill-day-count').textContent = `${d.count || 0} ped.`;
  document.getElementById('bill-day-total').textContent = formatCurrency(d.total_sales || 0);
  document.getElementById('bill-day-cash').textContent = formatCurrency(d.cash_sales || 0);
  document.getElementById('bill-day-card').textContent = formatCurrency(d.card_sales || 0);
  document.getElementById('bill-day-dig').textContent = formatCurrency(d.digital_sales || 0);

  // Semanal
  const w = b.semanal || {};
  document.getElementById('bill-week-count').textContent = `${w.count || 0} ped.`;
  document.getElementById('bill-week-total').textContent = formatCurrency(w.total_sales || 0);
  document.getElementById('bill-week-cash').textContent = formatCurrency(w.cash_sales || 0);
  document.getElementById('bill-week-card').textContent = formatCurrency(w.card_sales || 0);
  document.getElementById('bill-week-dig').textContent = formatCurrency(w.digital_sales || 0);

  // Quincenal
  const q = b.quincenal || {};
  document.getElementById('bill-fortnight-count').textContent = `${q.count || 0} ped.`;
  document.getElementById('bill-fortnight-total').textContent = formatCurrency(q.total_sales || 0);
  document.getElementById('bill-fortnight-cash').textContent = formatCurrency(q.cash_sales || 0);
  document.getElementById('bill-fortnight-card').textContent = formatCurrency(q.card_sales || 0);
  document.getElementById('bill-fortnight-dig').textContent = formatCurrency(q.digital_sales || 0);

  // Mensual
  const m = b.mensual || {};
  document.getElementById('bill-month-count').textContent = `${m.count || 0} ped.`;
  document.getElementById('bill-month-total').textContent = formatCurrency(m.total_sales || 0);
  document.getElementById('bill-month-cash').textContent = formatCurrency(m.cash_sales || 0);
  document.getElementById('bill-month-card').textContent = formatCurrency(m.card_sales || 0);
  document.getElementById('bill-month-dig').textContent = formatCurrency(m.digital_sales || 0);
}

function renderAuditAdjustments(adjustments) {
  const tbody = document.getElementById('audit-adjustments-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (adjustments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">No hay conciliaciones o mermas registradas.</td></tr>`;
    return;
  }

  adjustments.forEach(adj => {
    const isNeg = adj.difference < 0;
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';

    const dateStr = new Date(adj.date).toLocaleString('es-AR');

    tr.innerHTML = `
      <td class="p-4 text-xs font-mono text-slate-500">${dateStr}</td>
      <td class="p-4 font-black text-slate-900">${adj.raw_material_name}</td>
      <td class="p-4 font-mono text-slate-600">${adj.old_stock} ${adj.unit}</td>
      <td class="p-4 font-mono font-bold text-slate-900">${adj.new_stock} ${adj.unit}</td>
      <td class="p-4 font-mono font-black ${isNeg ? 'text-red-600' : 'text-emerald-600'}">
        ${adj.difference >= 0 ? '+' : ''}${adj.difference} ${adj.unit}
      </td>
      <td class="p-4 text-xs text-slate-700 italic">${adj.reason || 'Sin observación'}</td>
      <td class="p-4 text-xs font-bold text-purple-700">👑 ${adj.registered_by || 'Gerente (Nivel 3)'}</td>
    `;

    tbody.appendChild(tr);
  });
}

function renderAuditShifts(shifts) {
  const tbody = document.getElementById('audit-shifts-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (shifts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">No hay turnos de caja registrados.</td></tr>`;
    return;
  }

  shifts.forEach(s => {
    const isOpen = s.status === 'open';
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';

    const openedStr = s.opened_at ? new Date(s.opened_at).toLocaleString('es-AR') : '-';
    const closedStr = s.closed_at ? new Date(s.closed_at).toLocaleString('es-AR') : 'En curso...';

    tr.innerHTML = `
      <td class="p-4 text-xs font-mono text-slate-600">${openedStr}</td>
      <td class="p-4 text-xs font-mono text-slate-600">${closedStr}</td>
      <td class="p-4 font-mono font-bold text-slate-900">${formatCurrency(s.initial_cash || 0)}</td>
      <td class="p-4 font-mono font-bold text-emerald-600">${s.final_cash !== null ? formatCurrency(s.final_cash) : '-'}</td>
      <td class="p-4">
        <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}">
          ${isOpen ? '🟢 Abierta' : '🔒 Cerrada'}
        </span>
      </td>
      <td class="p-4 text-xs font-bold text-amber-800">🔑 ${s.opened_by || 'Encargado'}</td>
    `;

    tbody.appendChild(tr);
  });
}

function renderAuditEntries(entries) {
  const tbody = document.getElementById('audit-entries-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400">No hay entregas de proveedores registradas.</td></tr>`;
    return;
  }

  entries.forEach(e => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';

    const dateStr = new Date(e.date).toLocaleString('es-AR');

    tr.innerHTML = `
      <td class="p-4 text-xs font-mono text-slate-500">${dateStr}</td>
      <td class="p-4 font-bold text-slate-900">${e.supplier_name}</td>
      <td class="p-4 font-bold text-blue-900">${e.raw_material_name}</td>
      <td class="p-4 font-mono font-black text-emerald-600">+${e.quantity} ${e.unit}</td>
      <td class="p-4 text-xs font-bold text-blue-700">🔑 ${e.registered_by || 'Encargado'}</td>
    `;

    tbody.appendChild(tr);
  });
}

// Apertura / Cierre de Caja por Número de Caja (Nivel 2 o 3)
function openOpenShiftModal() {
  document.getElementById('open-shift-form').reset();
  
  const selBox = document.getElementById('shift-box-number');
  if (selBox) {
    const openBoxNums = activeShiftsList.map(s => s.box_number || 1);
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
  const initial_cash = document.getElementById('shift-initial-cash').value;
  const pin = document.getElementById('shift-open-pin').value.trim();

  try {
    const res = await fetch('/api/cash/shift/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ box_number, cashier_name, initial_cash, pin })
    });
    const data = await res.json();
    if (data.success) {
      closeOpenShiftModal();
      alert(`✅ Caja N° ${data.box_number} Abierta con éxito:\n\nCajero Asignado: ${data.cashier_name}\nAutorizado por: ${data.user_name}\nCambio Inicial: ${formatCurrency(initial_cash)}`);
      await loadCashSummary();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al abrir caja:', err);
  }
}

function openCloseShiftModal() {
  if (activeShiftsList.length === 0) {
    alert(`⚠️ NO SE PUEDE CERRAR CAJA: No hay ningún turno de caja abierto en este momento.`);
    return;
  }

  document.getElementById('close-shift-form').reset();

  const selCloseBox = document.getElementById('shift-close-box-id');
  if (selCloseBox) {
    selCloseBox.innerHTML = activeShiftsList.map(s => 
      `<option value="${s.id}">Caja N° ${s.box_number || 1} - Cajero: ${s.cashier_name || 'Sin asignar'} (Autorizó: ${s.opened_by}) - ${formatCurrency(s.initial_cash || 0)} cambio</option>`
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

let productionEntriesList = [];

// Cargar Insumos y Stock General
async function loadStockMaterials() {
  try {
    const res = await fetch('/api/admin/stock');
    const data = await res.json();
    if (data.success) {
      rawMaterials = data.raw_materials || [];
      suppliers = data.suppliers || [];
      productionEntriesList = data.production_entries || [];
      renderMaterialsTable();
      populateAdjustStockSelect();
      renderProductionEntriesHistory();
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
      <td class="p-4 font-mono font-bold text-slate-700 text-xs">
        <span class="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-black text-slate-800">
          🏷️ ${m.code || `INS-${String(m.id).padStart(3, '0')}`}
        </span>
      </td>
      <td class="p-4 font-extrabold text-slate-900 flex items-center gap-2">
        <span>📦 ${m.name}</span>
        ${isLow ? `<span class="bg-red-100 text-red-700 text-[10px] font-black px-2 py-0.5 rounded-md">⚠️ Stock Bajo</span>` : ''}
      </td>
      <td class="p-4 text-xs font-bold text-slate-600 uppercase">
        ${m.unit}
      </td>
      <td class="p-4 font-mono font-black text-slate-900 text-base">
        ${m.current_stock !== undefined ? m.current_stock : 0} ${m.unit}
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
  sel.innerHTML = rawMaterials.map(m => `<option value="${m.id}">[${m.code || `INS-${String(m.id).padStart(3, '0')}`}] ${m.name} (Stock Virtual Actual: ${m.current_stock} ${m.unit})</option>`).join('');
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
      alert(`⚖️ CONCILIACIÓN AUTORIZADA POR "${data.user_name}":\n\nInsumo: ${data.raw_material_name}\nStock anterior: ${data.old_stock}\nStock real nuevo: ${data.new_stock}\nDiferencia/Ajuste: ${diffSign}`);
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
    title.textContent = 'Editar Insumo de Stock (Nivel 2)';
    document.getElementById('mat-id').value = mat.id;
    document.getElementById('mat-code').value = mat.code || `INS-${String(mat.id).padStart(3, '0')}`;
    document.getElementById('mat-name').value = mat.name;
    document.getElementById('mat-unit').value = mat.unit || 'kg';
    document.getElementById('mat-min').value = mat.min_stock || 5;
    document.getElementById('mat-current').value = mat.current_stock !== undefined ? mat.current_stock : 0;
  } else {
    title.textContent = 'Nuevo Insumo de Stock (Nivel 2)';
    document.getElementById('mat-id').value = '';
    document.getElementById('mat-code').value = '';
    document.getElementById('mat-min').value = '10';
    document.getElementById('mat-current').value = '';
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function generateMnemonicCode(nameText, itemsList) {
  if (!nameText || nameText.trim().length < 2) return '';
  
  const clean = nameText.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9\s]/g, '');
  const words = clean.split(/\s+/).filter(w => w.length >= 2 && !['PARA', 'CON', 'DEL', 'POR', 'LAS', 'LOS', 'UNA', 'UNO', 'DESDE'].includes(w));
  
  let familyPrefix = '';
  if (words.length >= 2) {
    familyPrefix = words[0].substring(0, 3) + '-' + words[1].substring(0, 3);
  } else if (words.length === 1) {
    familyPrefix = words[0].substring(0, 4);
  } else {
    familyPrefix = 'INS';
  }

  const existingMatches = itemsList.filter(item => {
    const code = (item.code || item.barcode || '').toUpperCase();
    return code.startsWith(familyPrefix);
  });

  const nextSeq = existingMatches.length + 1;
  return `${familyPrefix}-${String(nextSeq).padStart(3, '0')}`;
}

function handleMatNameInput() {
  const nameVal = document.getElementById('mat-name').value;
  const codeInput = document.getElementById('mat-code');
  if (!codeInput) return;

  const smartCode = generateMnemonicCode(nameVal, rawMaterials);
  if (smartCode) {
    codeInput.value = smartCode;
  }
}

function generateMaterialAutoCode() {
  const nameElem = document.getElementById('mat-name');
  const nameVal = nameElem ? nameElem.value.trim() : '';

  if (!nameVal) {
    alert('⚠️ POR FAVOR INGRESA PRIMERO EL NOMBRE DEL INSUMO:\n\nDebes escribir el nombre a la izquierda (ej: "Carne Vacuna para Milanesas") para poder presionar ⚡ Auto y generar la familia de códigos SKU.');
    if (nameElem) nameElem.focus();
    return;
  }

  const codeInput = document.getElementById('mat-code');
  if (!codeInput) return;

  const smartCode = generateMnemonicCode(nameVal, rawMaterials);
  if (smartCode) {
    codeInput.value = smartCode;
  } else {
    const nextCodeNum = rawMaterials.length > 0 ? Math.max(...rawMaterials.map(m => m.id)) + 1 : 1;
    codeInput.value = `INS-${String(nextCodeNum).padStart(3, '0')}`;
  }
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
  const code = document.getElementById('mat-code').value.trim();
  const name = document.getElementById('mat-name').value.trim();
  const unit = document.getElementById('mat-unit').value;
  const min_stock = document.getElementById('mat-min').value;
  const current_stock = document.getElementById('mat-current').value;
  const pin = document.getElementById('mat-pin').value.trim();

  if (!code) {
    alert('⚠️ EL CÓDIGO / SKU DEL INSUMO ES OBLIGATORIO:\n\nPor favor pasa la pistola escáner de código de barras de fábrica o presiona el botón ⚡ Auto para generarlo.');
    document.getElementById('mat-code').focus();
    return;
  }
  if (!name) {
    alert('⚠️ El nombre del insumo genérico es obligatorio.');
    document.getElementById('mat-name').focus();
    return;
  }
  if (min_stock === '' || isNaN(parseFloat(min_stock))) {
    alert('⚠️ El stock mínimo de alerta es obligatorio.');
    document.getElementById('mat-min').focus();
    return;
  }
  if (current_stock === '' || isNaN(parseFloat(current_stock))) {
    alert('⚠️ El stock inicial actual es obligatorio.');
    document.getElementById('mat-current').focus();
    return;
  }
  if (!pin) {
    alert('⚠️ La clave PIN personal autorizante es obligatoria.');
    document.getElementById('mat-pin').focus();
    return;
  }

  try {
    const res = await fetch('/api/admin/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id ? parseInt(id) : null, code, name, unit, min_stock, current_stock, pin })
    });
    const data = await res.json();
    if (data.success) {
      closeRawMaterialModal();
      await loadStockMaterials();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al guardar materia prima:', err);
  }
}

// ==========================================
// GESTIÓN DE PRODUCCIÓN Y MERMAS DE COMIDA ELABORADA
// ==========================================

function loadPreparedStock() {
  const tbody = document.getElementById('prepared-stock-tbody');
  if (!tbody) return;

  const preparedProds = products;
  if (!preparedProds || preparedProds.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400 font-bold text-xs">No hay comidas preparadas configuradas.</td></tr>`;
  } else {
    tbody.innerHTML = preparedProds.map(p => `
      <tr class="hover:bg-slate-50 transition">
        <td class="p-4 font-bold text-slate-900 flex items-center gap-2">
          <span class="text-base">🍳</span>
          <div>
            <div>[${p.code || `PROD-${p.id}`}] ${p.name}</div>
            <div class="text-[11px] text-slate-400 font-mono">${p.barcode ? `📊 ${p.barcode}` : p.plu_code ? `🏷️ PLU: ${p.plu_code}` : ''}</div>
          </div>
        </td>
        <td class="p-4 text-xs font-bold text-slate-700">
          <span class="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-mono">${p.unit_type === 'kg' ? '⚖️ Por Kilo' : '📦 Por Unidad'}</span>
        </td>
        <td class="p-4 font-mono font-black text-slate-900 text-base">
          ${(p.stock_prepared || 0).toFixed(2)} ${p.unit_type === 'kg' ? 'kg' : 'unidades'}
        </td>
        <td class="p-4 font-mono font-bold text-slate-700">
          ${formatCurrency(p.price)}${p.unit_type === 'kg' ? '/kg' : ''}
        </td>
        <td class="p-4 text-right">
          <button onclick="openProductionModal(${p.id})" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-extrabold rounded-xl text-xs transition shadow inline-flex items-center gap-1">
            ➕ Cargar Producción
          </button>
        </td>
      </tr>
    `).join('');
  }

  renderProductionEntriesHistory();
}

function renderProductionEntriesHistory() {
  const tbody = document.getElementById('production-history-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (!productionEntriesList || productionEntriesList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400 text-xs">No hay cargas de producción registradas hoy por la cocina.</td></tr>`;
    return;
  }

  productionEntriesList.forEach(e => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';

    const dateStr = e.date ? new Date(e.date).toLocaleString('es-AR') : '-';
    const matDeductedHtml = Array.isArray(e.deducted_materials) && e.deducted_materials.length > 0
      ? e.deducted_materials.map(m => `<span class="bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded text-[11px] font-mono block mb-0.5">-${m.qty_deducted} ${m.unit} (${m.material_name})</span>`).join('')
      : '<span class="text-slate-400 italic text-xs">Sin receta de insumos vinculada</span>';

    tr.innerHTML = `
      <td class="p-3 text-xs font-mono text-slate-600">${dateStr}</td>
      <td class="p-3 font-bold text-slate-900 text-xs">${e.product_name || 'Plato'}</td>
      <td class="p-3 font-mono font-black text-emerald-700 text-sm">+${e.quantity} ${e.unit_type === 'kg' ? 'kg' : 'unidades'}</td>
      <td class="p-3 text-xs">${matDeductedHtml}</td>
      <td class="p-3 text-right text-xs">
        <div class="font-extrabold text-slate-900">👨‍🍳 ${e.operator_name || 'Cocinero'}</div>
        <div class="text-[10px] text-amber-800 font-bold">🔑 Autorizó: ${e.registered_by || 'Encargado'}</div>
      </td>
    `;

    tbody.appendChild(tr);
  });
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

function generateProductAutoEan() {
  const input = document.getElementById('prod-barcode');
  if (!input) return;
  
  const randomSuffix = String(Math.floor(10000000 + Math.random() * 90000000));
  const code12 = `7790${randomSuffix}`;
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const num = parseInt(code12[i]);
    sum += (i % 2 === 0) ? num : num * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  
  input.value = `${code12}${checkDigit}`;
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
      activeShiftsList = data.active_shifts || (data.active_shift ? [data.active_shift] : []);
      currentActiveShift = activeShiftsList.length > 0 ? activeShiftsList[0] : null;

      const badge = document.getElementById('shift-status-badge');
      const btnOpen = document.getElementById('btn-open-shift');
      const btnClose = document.getElementById('btn-close-shift');

      if (activeShiftsList.length > 0) {
        const boxSummaryStr = activeShiftsList.map(s => `Caja N°${s.box_number || 1}: ${s.cashier_name || s.opened_by.split(' ')[0]}`).join(' | ');
        if (badge) {
          badge.textContent = `🟢 ${activeShiftsList.length} Caja(s) Abierta(s) [${boxSummaryStr}]`;
          badge.className = 'bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold px-2.5 py-0.5 rounded-full';
        }
        if (btnOpen) {
          btnOpen.disabled = false;
          btnOpen.className = 'px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow transition flex items-center gap-1 cursor-pointer';
          btnOpen.title = 'Abrir otra estación de caja (Caja N° 2, 3...)';
        }
        if (btnClose) {
          btnClose.disabled = false;
          btnClose.className = 'px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-extrabold shadow transition flex items-center gap-1 cursor-pointer';
          btnClose.title = 'Cerrar una caja abierta';
        }
      } else {
        if (badge) {
          badge.textContent = `🔴 Sin Turnos de Caja Abiertos`;
          badge.className = 'bg-red-100 text-red-800 border border-red-300 text-xs font-bold px-2.5 py-0.5 rounded-full';
        }
        if (btnOpen) {
          btnOpen.disabled = false;
          btnOpen.className = 'px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow transition flex items-center gap-1 cursor-pointer';
          btnOpen.title = 'Abrir turno de caja';
        }
        if (btnClose) {
          btnClose.disabled = true;
          btnClose.className = 'px-3 py-2 bg-slate-200 text-slate-400 border border-slate-300 rounded-xl text-xs font-bold cursor-not-allowed opacity-50 flex items-center gap-1';
          btnClose.title = 'No hay turno de caja abierto para cerrar';
        }
      }

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
    const wrap = document.createElement('div');
    wrap.className = `flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition ${isActive ? 'bg-orange-500 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`;

    wrap.innerHTML = `
      <button onclick="setAdminCatFilter('${c.id}')" class="flex items-center gap-1 outline-none">
        <span>${c.icon || '🍽️'} ${c.name}</span>
      </button>
      <button onclick="openCategoryModal(categories.find(cat => cat.id === ${c.id}))" class="ml-1 text-[10px] opacity-70 hover:opacity-100 transition" title="Editar Categoría (Nivel 3)">
        ✏️
      </button>
    `;

    container.appendChild(wrap);
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
      if (document.getElementById('set-restaurant-address')) {
        document.getElementById('set-restaurant-address').value = settings.restaurant_address || 'España 1028 (Casi Yrigoyen)';
      }
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
    const isAvail = p.available === 1 || p.available === true || p.available === undefined || p.available === '1';
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';

    tr.innerHTML = `
      <td class="p-4 font-bold text-slate-900 flex items-center gap-3">
        <img src="${p.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100'}" class="w-10 h-10 rounded-lg object-cover bg-slate-100 flex-shrink-0">
        <div>
          <div class="flex items-center gap-1.5">
            <span>${p.name}</span>
            ${p.unit_type === 'kg' ? `<span class="bg-purple-100 text-purple-800 border border-purple-300 text-[10px] font-black px-1.5 py-0.2 rounded-md">⚖️ Venta x Kg</span>` : ''}
          </div>
          <div class="text-xs font-normal text-slate-400 line-clamp-1">${p.description || ''}</div>
          <div class="flex items-center gap-2 mt-0.5 font-mono text-[11px] text-slate-500">
            ${p.barcode ? `<span class="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">📊 Barcode: ${p.barcode}</span>` : ''}
            ${p.plu_code ? `<span class="bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200 font-bold">🏷️ PLU: ${p.plu_code}</span>` : ''}
          </div>
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
  if (sel) sel.innerHTML = categories.map(c => `<option value="${c.id}">${c.icon || '🍽️'} ${c.name}</option>`).join('');
}

function openCategoryModal(cat = null) {
  const modal = document.getElementById('category-modal');
  const title = document.getElementById('cat-modal-title');
  const form = document.getElementById('category-form');

  if (form) form.reset();
  if (cat) {
    if (title) title.textContent = 'Editar Categoría / Rubro (Nivel 3)';
    document.getElementById('cat-id').value = cat.id;
    document.getElementById('cat-name').value = cat.name;
    document.getElementById('cat-icon').value = cat.icon || '🍽️';
    document.getElementById('cat-sector').value = cat.sector || 'kitchen';
  } else {
    if (title) title.textContent = 'Nueva Categoría (Nivel 3)';
    document.getElementById('cat-id').value = '';
    document.getElementById('cat-icon').value = '🍽️';
    document.getElementById('cat-sector').value = 'kitchen';
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function selectQuickEmoji(char) {
  const input = document.getElementById('cat-icon');
  if (input) input.value = char;
}

function closeCategoryModal() {
  const modal = document.getElementById('category-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

async function saveCategory(e) {
  e.preventDefault();
  const id = document.getElementById('cat-id').value;
  const name = document.getElementById('cat-name').value.trim();
  const icon = document.getElementById('cat-icon').value.trim();
  const sector = document.getElementById('cat-sector').value;
  const pin = document.getElementById('cat-pin').value.trim();

  if (!name) {
    alert('⚠️ El nombre de la categoría es obligatorio.');
    return;
  }
  if (!pin) {
    alert('⚠️ La clave PIN Nivel 3 de Gerente/Dueño es obligatoria.');
    return;
  }

  try {
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id ? parseInt(id) : null, name, icon, sector, pin })
    });
    const data = await res.json();
    if (data.success) {
      closeCategoryModal();
      alert(`📂 Categoría "${name}" guardada con éxito por ${data.user_name}!`);
      await loadCategories();
      await loadProducts();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al guardar categoría:', err);
  }
}

function generateProductAutoCode() {
  const nameElem = document.getElementById('prod-name');
  const name = nameElem ? nameElem.value.trim() : '';

  if (!name) {
    alert('⚠️ POR FAVOR INGRESA PRIMERO EL NOMBRE DEL PLATO O BEBIDA:\n\nDebes escribir el nombre a la izquierda (ej: "Empanada de Carne Molida") para poder presionar ⚡ Auto y generar la familia de códigos SKU.');
    if (nameElem) nameElem.focus();
    return;
  }

  const code = generateMnemonicCode(name, products);
  const codeElem = document.getElementById('prod-code');
  if (codeElem) codeElem.value = code;
}

function handleProductNameInput() {
  const name = document.getElementById('prod-name').value.trim();
  const codeElem = document.getElementById('prod-code');
  if (name && codeElem && !codeElem.value) {
    const code = generateMnemonicCode(name, products);
    if (code) codeElem.value = code;
  }
}

function openProductModal(prod = null) {
  const modal = document.getElementById('product-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('product-form');

  if (form) form.reset();
  showImagePreview('');
  populateCategorySelect();

  if (prod) {
    if (title) title.textContent = 'Editar Producto / Plato (Exclusivo Nivel 3)';
    document.getElementById('prod-id').value = prod.id;
    document.getElementById('prod-code').value = prod.code || prod.barcode || `PROD-${String(prod.id).padStart(3, '0')}`;
    document.getElementById('prod-name').value = prod.name;
    if (prod.category_id) {
      document.getElementById('prod-category').value = String(prod.category_id);
    }
    document.getElementById('prod-price').value = prod.price;
    document.getElementById('prod-unit-type').value = prod.unit_type || 'unidad';
    document.getElementById('prod-desc').value = prod.description || '';
    document.getElementById('prod-image').value = prod.image_url || '';
    if (document.getElementById('prod-video-url')) document.getElementById('prod-video-url').value = prod.video_url || '';
    showImagePreview(prod.image_url || '');
    showVideoPreview(prod.video_url || '');
    document.getElementById('prod-available').checked = prod.available === 1;
  } else {
    if (title) title.textContent = 'Nuevo Producto / Plato (Exclusivo Nivel 3)';
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-code').value = '';
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-price').value = '';
    document.getElementById('prod-desc').value = '';
    document.getElementById('prod-image').value = '';
    if (document.getElementById('prod-video-url')) document.getElementById('prod-video-url').value = '';
    showImagePreview('');
    showVideoPreview('');
    document.getElementById('prod-unit-type').value = 'unidad';
    document.getElementById('prod-available').checked = true;
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function handleVideoFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const fileName = file.name.toLowerCase();

  // Si el usuario seleccionó un archivo HTML guardado (ej: página web o iframe guardado)
  if (fileName.endsWith('.html') || fileName.endsWith('.htm') || file.type === 'text/html') {
    const textReader = new FileReader();
    textReader.onload = function(e) {
      const htmlContent = e.target.result;
      const match = htmlContent.match(/(https?:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)[^\s"'<>]+)/i) ||
                    htmlContent.match(/src=["'](https?:\/\/[^"']+\.(mp4|webm|ogg|mov)[^"']*)["']/i) ||
                    htmlContent.match(/src=["'](https?:\/\/[^"']+)["']/i);
      if (match && match[1]) {
        const extractedUrl = match[1];
        const urlInput = document.getElementById('prod-video-url');
        if (urlInput) urlInput.value = extractedUrl;
        showVideoPreview(extractedUrl);
        alert(`✅ ENLACE EXTRAÍDO DEL ARCHIVO HTML:\n\nSe detectó el video: ${extractedUrl}`);
      } else {
        alert('⚠️ No se encontró un enlace de video válido dentro de este archivo HTML. Por favor pega directamente la dirección web o selecciona un video .MP4.');
      }
    };
    textReader.readAsText(file);
    return;
  }

  if (file.size > 80 * 1024 * 1024) {
    alert('⚠️ EL ARCHIVO DE VIDEO EXCEDE LOS 80MB:\n\nPara mejor velocidad, selecciona un video comprimido en .MP4 o ingresa el enlace web.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    const urlInput = document.getElementById('prod-video-url');
    if (urlInput) urlInput.value = dataUrl;
    showVideoPreview(dataUrl);
  };
  reader.readAsDataURL(file);
}

function handleVideoUrlInput(event) {
  const url = event.target.value.trim();
  showVideoPreview(url);
}

function showVideoPreview(url) {
  const container = document.getElementById('video-preview-container');
  const player = document.getElementById('video-preview-player');

  if (!container || !player) return;

  if (url && url.length > 0) {
    if (url.startsWith('data:video/') || url.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i)) {
      player.src = url;
      player.style.display = 'block';
    } else {
      player.src = '';
      player.style.display = 'none';
    }
    container.classList.remove('hidden');
  } else {
    player.src = '';
    container.classList.add('hidden');
  }
}

function clearVideoPreview() {
  const urlInput = document.getElementById('prod-video-url');
  const fileInput = document.getElementById('prod-video-file-input');
  if (urlInput) urlInput.value = '';
  if (fileInput) fileInput.value = '';
  showVideoPreview('');
}

function closeProductModal() {
  const modal = document.getElementById('product-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

function editProduct(id) {
  const prod = products.find(p => p.id === id);
  if (prod) openProductModal(prod);
}

async function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('prod-id').value;
  const code = document.getElementById('prod-code').value.trim();
  const name = document.getElementById('prod-name').value.trim();
  const category_id = document.getElementById('prod-category').value;
  const price = document.getElementById('prod-price').value;
  const unit_type = document.getElementById('prod-unit-type').value;
  const description = document.getElementById('prod-desc').value.trim();
  const image_url = document.getElementById('prod-image').value.trim();
  const video_url = document.getElementById('prod-video-url') ? document.getElementById('prod-video-url').value.trim() : '';
  const available = document.getElementById('prod-available').checked;
  const pin = document.getElementById('prod-pin').value.trim();

  if (!code) {
    alert('⚠️ EL CÓDIGO / SKU DEL PRODUCTO ES OBLIGATORIO:\n\nPor favor presiona el botón ⚡ Auto para generarlo.');
    document.getElementById('prod-code').focus();
    return;
  }
  if (!name) {
    alert('⚠️ El nombre del plato o producto es obligatorio.');
    document.getElementById('prod-name').focus();
    return;
  }
  if (!category_id) {
    alert('⚠️ La categoría del plato o producto es obligatoria.');
    document.getElementById('prod-category').focus();
    return;
  }
  if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
    alert('⚠️ El precio de venta debe ser mayor a $0.');
    document.getElementById('prod-price').focus();
    return;
  }
  if (!pin) {
    alert('⚠️ La clave PIN de Nivel 3 de Gerente/Dueño es obligatoria.');
    document.getElementById('prod-pin').focus();
    return;
  }

  try {
    const res = await fetch('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: id ? parseInt(id) : null,
        code, name, category_id, price, unit_type, description, image_url, video_url, available, pin
      })
    });
    const data = await res.json();
    if (data.success) {
      closeProductModal();
      alert(`🍕 Producto "${name}" guardado con éxito por ${data.user_name}!`);
      await loadProducts();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al guardar producto:', err);
    alert(`⚠️ Error al guardar producto: ${err.message}`);
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
  const restaurant_address = document.getElementById('set-restaurant-address') ? document.getElementById('set-restaurant-address').value.trim() : '';
  const whatsapp_phone = document.getElementById('set-whatsapp-phone').value.trim();
  const delivery_cost = document.getElementById('set-delivery-cost').value.trim();
  const epson_printer_ip = document.getElementById('set-epson-ip').value.trim();
  const auto_print_epson = document.getElementById('set-auto-print').checked ? '1' : '0';

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_name, restaurant_address, whatsapp_phone, delivery_cost, epson_printer_ip, auto_print_epson })
    });
    const data = await res.json();
    if (data.success) {
      alert('¡Ajustes guardados correctamente!');
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
  const usrSection = document.getElementById('tab-users');
  const uSection = document.getElementById('tab-audit');
  const prodAnalyticsSection = document.getElementById('tab-production-analytics');
  const sSection = document.getElementById('tab-settings');
  
  const cBtn = document.getElementById('tab-btn-cash');
  const aBtn = document.getElementById('tab-btn-accounts');
  const kBtn = document.getElementById('tab-btn-stock');
  const pBtn = document.getElementById('tab-btn-products');
  const usrBtn = document.getElementById('tab-btn-users');
  const uBtn = document.getElementById('tab-btn-audit');
  const prodAnalyticsBtn = document.getElementById('tab-btn-production-analytics');
  const sBtn = document.getElementById('tab-btn-settings');

  if (cSection) cSection.classList.add('hidden');
  if (aSection) aSection.classList.add('hidden');
  if (kSection) kSection.classList.add('hidden');
  if (pSection) pSection.classList.add('hidden');
  if (usrSection) usrSection.classList.add('hidden');
  if (uSection) uSection.classList.add('hidden');
  if (prodAnalyticsSection) prodAnalyticsSection.classList.add('hidden');
  if (sSection) sSection.classList.add('hidden');

  if (cBtn) cBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';
  if (aBtn) aBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';
  if (kBtn) kBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';
  if (pBtn) pBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';
  if (usrBtn) usrBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';
  if (uBtn) uBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';
  if (prodAnalyticsBtn) prodAnalyticsBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';
  if (sBtn) sBtn.className = 'tab-btn pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 font-bold';

  if (tab === 'cash') {
    if (cSection) cSection.classList.remove('hidden');
    if (cBtn) cBtn.className = 'tab-btn pb-3 border-b-2 border-orange-500 text-orange-600 flex items-center gap-2 font-bold';
    loadCashSummary();
  } else if (tab === 'accounts') {
    if (aSection) aSection.classList.remove('hidden');
    if (aBtn) aBtn.className = 'tab-btn pb-3 border-b-2 border-orange-500 text-orange-600 flex items-center gap-2 font-bold';
    loadAccounts();
  } else if (tab === 'stock') {
    if (kSection) kSection.classList.remove('hidden');
    if (kBtn) kBtn.className = 'tab-btn pb-3 border-b-2 border-orange-500 text-orange-600 flex items-center gap-2 font-bold';
    loadStockMaterials();
    loadPreparedStock();
  } else if (tab === 'products') {
    if (pSection) pSection.classList.remove('hidden');
    if (pBtn) pBtn.className = 'tab-btn pb-3 border-b-2 border-orange-500 text-orange-600 flex items-center gap-2 font-bold';
  } else if (tab === 'users') {
    if (usrSection) usrSection.classList.remove('hidden');
    if (usrBtn) usrBtn.className = 'tab-btn pb-3 border-b-2 border-purple-600 text-purple-700 flex items-center gap-2 font-bold';
    loadUsers();
  } else if (tab === 'audit') {
    if (uSection) uSection.classList.remove('hidden');
    if (uBtn) uBtn.className = 'tab-btn pb-3 border-b-2 border-purple-600 text-purple-700 flex items-center gap-2 font-bold';
    loadAuditLogs();
  } else if (tab === 'production-analytics') {
    if (prodAnalyticsSection) prodAnalyticsSection.classList.remove('hidden');
    if (prodAnalyticsBtn) prodAnalyticsBtn.className = 'tab-btn pb-3 border-b-2 border-amber-500 text-amber-700 flex items-center gap-2 font-bold';
    loadProductionAnalyticsAdmin();
  } else {
    if (sSection) sSection.classList.remove('hidden');
    if (sBtn) sBtn.className = 'tab-btn pb-3 border-b-2 border-orange-500 text-orange-600 flex items-center gap-2 font-bold';
  }
}

async function loadProductionAnalyticsAdmin() {
  try {
    const res = await fetch('/api/production/batches');
    const data = await res.json();
    if (data.success) {
      renderProductionAnalyticsAdmin(data.batches || []);
    }
  } catch (err) {
    console.error('Error al cargar análisis de producción en admin:', err);
  }
}

function renderProductionAnalyticsAdmin(batches = []) {
  const tbody = document.getElementById('admin-prod-batches-table-body');
  const countBadge = document.getElementById('admin-prod-batches-count');
  if (!tbody) return;

  const completedBatches = batches.filter(b => b.status === 'completed');
  if (countBadge) countBadge.textContent = `${completedBatches.length} lotes auditados`;

  let totalMat = 0;
  let totalLabor = 0;
  let unitCostSum = 0;
  let marginSum = 0;
  let countWithCost = 0;

  completedBatches.forEach(b => {
    if (b.cost_analysis) {
      totalMat += (b.cost_analysis.raw_material_cost_total || 0);
      totalLabor += (b.cost_analysis.labor_cost_total || 0);
      unitCostSum += (b.cost_analysis.unit_cost_real || 0);
      marginSum += (b.cost_analysis.profit_margin_percent || 0);
      countWithCost++;
    }
  });

  const elemMat = document.getElementById('admin-prod-mat-cost');
  const elemLabor = document.getElementById('admin-prod-labor-cost');
  const elemAvgUnit = document.getElementById('admin-prod-avg-unit-cost');
  const elemAvgMargin = document.getElementById('admin-prod-avg-margin');

  if (elemMat) elemMat.textContent = formatCurrency(totalMat);
  if (elemLabor) elemLabor.textContent = formatCurrency(totalLabor);
  if (elemAvgUnit) elemAvgUnit.textContent = countWithCost > 0 ? `${formatCurrency(unitCostSum / countWithCost)} / unid` : '$0';
  if (elemAvgMargin) elemAvgMargin.textContent = countWithCost > 0 ? `${(marginSum / countWithCost).toFixed(1)}%` : '0.0%';

  if (completedBatches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400 font-bold">No hay lotes de producción concluidos para auditar todavía.</td></tr>`;
    return;
  }

  tbody.innerHTML = completedBatches.map(b => {
    const durationSec = b.duration_seconds || 0;
    const min = Math.floor(durationSec / 60);
    const sec = durationSec % 60;
    const durationText = `${min}m ${sec}s`;

    const c = b.cost_analysis || {};
    const matCost = c.raw_material_cost_total || 0;
    const laborCost = c.labor_cost_total || 0;
    const totalCost = c.total_batch_cost || (matCost + laborCost);
    const unitCost = c.unit_cost_real || 0;
    const sellPrice = c.selling_price_unit || 0;
    const margin = c.profit_margin_percent || 0;

    let marginBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (margin < 30) {
      marginBadgeClass = 'bg-red-100 text-red-800 border-red-300';
    } else if (margin < 50) {
      marginBadgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
    }

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="p-3 font-mono font-black text-amber-700 text-xs">${b.batch_number}</td>
        <td class="p-3 font-extrabold text-slate-900">
          ${b.product_name}
          <div class="text-[10px] text-slate-400 font-normal">${b.category_sector}</div>
        </td>
        <td class="p-3 font-mono font-bold text-emerald-700">${b.quantity} ${b.unit_type || 'kg'}</td>
        <td class="p-3 text-xs">
          <div class="font-bold text-slate-800">${b.operator_name}</div>
          <div class="text-[10px] text-slate-500 font-mono">⏱️ ${durationText}</div>
        </td>
        <td class="p-3 font-mono text-xs">
          <div class="font-bold text-slate-900">${formatCurrency(totalCost)}</div>
          <div class="text-[10px] text-slate-400">Insumos: ${formatCurrency(matCost)} + MO: ${formatCurrency(laborCost)}</div>
        </td>
        <td class="p-3 font-mono font-black text-purple-700 text-sm">
          ${formatCurrency(unitCost)} <span class="text-[10px] font-normal text-slate-400">/ ${b.unit_type || 'unid'}</span>
        </td>
        <td class="p-3 font-mono font-bold text-slate-900">
          ${formatCurrency(sellPrice)}
        </td>
        <td class="p-3 text-right">
          <span class="px-2.5 py-1 rounded-lg border font-mono font-black text-xs ${marginBadgeClass}">
            📈 ${margin}%
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

function formatCurrency(val) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
}

// ==========================================
// GESTIÓN DE PRODUCCIÓN Y MERMAS DE COMIDA ELABORADA
// ==========================================

function loadPreparedStock() {
  const tbody = document.getElementById('prepared-stock-tbody');
  if (!tbody) return;

  const preparedProds = products.filter(p => p.unit_type === 'kg' || p.is_prepared_food === 1);
  if (preparedProds.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400 font-bold text-xs">No hay comidas preparadas configuradas. Asigna "Por Kilo" a un producto en el menú para controlar su producción y mermas.</td></tr>`;
    return;
  }

  tbody.innerHTML = preparedProds.map(p => `
    <tr class="hover:bg-slate-50 transition">
      <td class="p-4 font-bold text-slate-900 flex items-center gap-2">
        <span class="text-base">🍳</span>
        <div>
          <div>${p.name}</div>
          <div class="text-[11px] text-slate-400 font-mono">${p.barcode ? `📊 ${p.barcode}` : p.plu_code ? `🏷️ PLU: ${p.plu_code}` : ''}</div>
        </div>
      </td>
      <td class="p-4 text-xs font-bold text-slate-700">
        <span class="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-mono">${p.unit_type === 'kg' ? '⚖️ Por Kilo' : '📦 Por Unidad'}</span>
      </td>
      <td class="p-4 font-mono font-black text-slate-900 text-base">
        ${(p.stock_prepared || 0).toFixed(3)} ${p.unit_type === 'kg' ? 'kg' : 'unidades'}
      </td>
      <td class="p-4 font-mono font-bold text-slate-700">
        ${formatCurrency(p.price)}${p.unit_type === 'kg' ? '/kg' : ''}
      </td>
      <td class="p-4 text-right">
        <button onclick="openProductionModal(${p.id})" class="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded-lg text-xs transition">
          ➕ Cargar Producción
        </button>
      </td>
    </tr>
  `).join('');
}

function openProductionModal(selectedId = null) {
  const modal = document.getElementById('production-modal');
  const sel = document.getElementById('prod-entry-product');

  const preparedProds = products.filter(p => p.unit_type === 'kg' || p.is_prepared_food === 1 || p.available === 1);
  sel.innerHTML = preparedProds.map(p => `<option value="${p.id}" ${selectedId === p.id ? 'selected' : ''}>${p.name} (Stock actual: ${(p.stock_prepared || 0).toFixed(3)} ${p.unit_type || 'kg'})</option>`).join('');

  document.getElementById('production-form').reset();
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeProductionModal() {
  const modal = document.getElementById('production-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

async function submitProductionEntry(e) {
  e.preventDefault();
  const product_id = document.getElementById('prod-entry-product').value;
  const quantity = document.getElementById('prod-entry-qty').value;
  const operator_name = document.getElementById('prod-entry-operator') ? document.getElementById('prod-entry-operator').value.trim() : '';
  const notes = document.getElementById('prod-entry-notes').value.trim();
  const pin = document.getElementById('prod-entry-pin').value.trim();

  try {
    const res = await fetch('/api/production/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id, quantity, notes, operator_name, pin })
    });
    const data = await res.json();
    if (data.success) {
      closeProductionModal();
      alert(`🍳 Producción agregada con éxito! "${data.product.name}" ahora tiene ${data.product.stock_prepared} ${data.product.unit_type || 'kg'} disponibles.`);
      await loadProducts();
      loadPreparedStock();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al guardar producción:', err);
  }
}

async function loadAuditLogs() {
  try {
    const res = await fetch('/api/cash/summary');
    const data = await res.json();
    if (data.success) {
      loadFoodWasteAuditLogs(data.waste_logs || []);
    }
  } catch (err) {
    console.error('Error al cargar bitácoras de auditoría:', err);
  }
}

function loadFoodWasteAuditLogs(wasteLogs = []) {
  const tbody = document.getElementById('audit-food-waste-tbody');
  if (!tbody) return;

  if (!wasteLogs || wasteLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400 font-bold text-xs">No hay conciliaciones de mermas, reprocesados u ofertas registradas.</td></tr>`;
    return;
  }

  tbody.innerHTML = wasteLogs.map(w => {
    const isOffer = w.action === 'offer';
    const isReprocess = w.action === 'reprocess';
    const badgeClass = isOffer ? 'bg-purple-100 text-purple-900 border-purple-300' : isReprocess ? 'bg-blue-100 text-blue-900 border-blue-300' : 'bg-red-100 text-red-900 border-red-300';
    
    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="p-4 text-xs font-mono text-slate-600">${new Date(w.date).toLocaleString()}</td>
        <td class="p-4 text-xs font-extrabold text-slate-900">Caja N° ${w.box_number || 1}</td>
        <td class="p-4 font-bold text-slate-900">
          <div>${w.product_name}</div>
          ${w.scale_ean ? `<div class="text-[10px] font-mono text-purple-700 font-bold">📊 Barcode Balanza: ${w.scale_ean}</div>` : ''}
        </td>
        <td class="p-4 font-mono font-bold text-slate-600">${w.expected_kg} ${w.unit_type || 'kg'}</td>
        <td class="p-4 font-mono font-bold text-emerald-700">${w.measured_kg} ${w.unit_type || 'kg'}</td>
        <td class="p-4 text-xs">
          <span class="px-2.5 py-1 rounded-lg border font-black text-xs ${badgeClass}">
            ${w.action_label || (w.waste_kg > 0 ? `${w.waste_kg} kg Tirados` : 'Procesado')}
          </span>
        </td>
        <td class="p-4 text-xs font-bold text-slate-700">${w.registered_by}</td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// FORMULARIO DE INGRESO DE MERCADERÍA DE PROVEEDOR CON ESCÁNER SKU
// ==========================================

function openStockEntryModal() {
  const modal = document.getElementById('stock-entry-modal');
  const sel = document.getElementById('entry-raw-material-id');
  const form = document.getElementById('stock-entry-form');
  
  if (form) form.reset();

  if (sel) {
    sel.innerHTML = rawMaterials.map(m => `
      <option value="${m.id}" data-sku="${m.code || ''}">
        [${m.code || `INS-${String(m.id).padStart(3, '0')}`}] ${m.name} (Stock Actual: ${m.current_stock || 0} ${m.unit})
      </option>
    `).join('');
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
  setTimeout(() => {
    const input = document.getElementById('entry-sku-input');
    if (input) input.focus();
  }, 200);
}

function closeStockEntryModal() {
  const modal = document.getElementById('stock-entry-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

function handleEntrySkuKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    searchRawMaterialBySku();
  }
}

function searchRawMaterialBySku() {
  const input = document.getElementById('entry-sku-input');
  if (!input) return;
  
  const query = input.value.trim().toLowerCase();
  if (!query) return;

  const mat = rawMaterials.find(m => 
    (m.code && m.code.toLowerCase() === query) ||
    String(m.id) === query ||
    m.name.toLowerCase().includes(query)
  );

  if (mat) {
    const sel = document.getElementById('entry-raw-material-id');
    if (sel) sel.value = mat.id;
    document.getElementById('entry-qty').focus();
  } else {
    alert(`⚠️ No se encontró ningún insumo con el código o nombre "${query}".`);
  }
}

async function submitStockEntry(e) {
  e.preventDefault();
  const raw_material_id = document.getElementById('entry-raw-material-id').value;
  const quantity = document.getElementById('entry-qty').value;
  const unit_cost = document.getElementById('entry-unit-cost').value;
  const notes = document.getElementById('entry-notes').value.trim();
  const pin = document.getElementById('entry-pin').value.trim();

  try {
    const res = await fetch('/api/stock/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_material_id, quantity, unit_cost, notes, pin })
    });
    const data = await res.json();
    if (data.success) {
      closeStockEntryModal();
      alert(`🚚 Mercadería ingresada correctamente! Se sumaron ${quantity} ${data.raw_material.unit} a "${data.raw_material.name}".`);
      await loadStockMaterials();
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al ingresar mercadería:', err);
  }
}

// ==========================================
// FICHA TÉCNICA Y RECETAS (ESCANDELLO) PARA ARTÍCULOS GENERADOS
// ==========================================

let activeRecipes = [];

async function openRecipeModal(selectedProductId = null) {
  const modal = document.getElementById('recipe-modal');
  const sel = document.getElementById('rec-product-id');
  
  if (!products || products.length === 0) {
    await loadProducts();
  }
  if (!rawMaterials || rawMaterials.length === 0) {
    await loadStockMaterials();
  }

  try {
    const res = await fetch('/api/admin/recipes');
    const data = await res.json();
    if (data.success) {
      activeRecipes = data.recipes || [];
    }
  } catch (e) {
    console.error('Error al cargar recetas:', e);
  }

  const genProducts = products || [];
  if (sel) {
    sel.innerHTML = genProducts.map(p => `
      <option value="${p.id}" ${selectedProductId === p.id ? 'selected' : ''}>
        [${p.code || `PROD-${String(p.id).padStart(3, '0')}`}] ${p.name} (${p.unit_type === 'kg' ? 'x Kg' : 'x Unidad'})
      </option>
    `).join('');
  }

  loadProductRecipeDetails();
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeRecipeModal() {
  const modal = document.getElementById('recipe-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

function loadProductRecipeDetails() {
  const sel = document.getElementById('rec-product-id');
  const container = document.getElementById('recipe-ingredients-container');
  if (!sel || !container) return;

  const pid = parseInt(sel.value);
  const currentProductRecipes = activeRecipes.filter(r => r.product_id === pid);

  container.innerHTML = '';

  if (currentProductRecipes.length === 0) {
    addRecipeIngredientRow();
  } else {
    currentProductRecipes.forEach(r => {
      addRecipeIngredientRow(r.raw_material_id, r.qty_per_portion);
    });
  }
}

function addRecipeIngredientRow(rawMatId = null, qtyPerPortion = null) {
  const container = document.getElementById('recipe-ingredients-container');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'recipe-ingredient-row flex gap-2 items-center bg-white p-2 rounded-xl border border-slate-200 shadow-sm';

  const matOptionsHtml = rawMaterials.map(m => `
    <option value="${m.id}" ${rawMatId === m.id ? 'selected' : ''}>
      [${m.code || `INS-${String(m.id).padStart(3, '0')}`}] ${m.name} (${m.unit})
    </option>
  `).join('');

  row.innerHTML = `
    <select class="rec-raw-material-id flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold bg-white text-slate-800">
      ${matOptionsHtml}
    </select>
    <div class="flex items-center gap-1">
      <input type="number" step="0.001" class="rec-qty-per-portion w-24 px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900" placeholder="Cant (ej 0.25)" value="${qtyPerPortion !== null ? qtyPerPortion : ''}">
      <span class="text-[10px] text-slate-400 font-bold">por porción/kg</span>
    </div>
    <button type="button" onclick="this.parentElement.remove()" class="p-1 text-red-500 hover:bg-red-50 rounded-lg transition" title="Quitar ingrediente">
      <i data-lucide="trash-2" class="w-4 h-4"></i>
    </button>
  `;

  container.appendChild(row);
  lucide.createIcons();
}

function applyRecipePercentageScale() {
  const pctInput = document.getElementById('rec-pct-input');
  if (!pctInput) return;

  const pct = parseFloat(pctInput.value);
  if (isNaN(pct) || pct === 0) {
    alert('⚠️ Ingrese un porcentaje % válido (ej: 10 para aumentar 10% o -15 para reducir 15%).');
    return;
  }

  const multiplier = 1 + (pct / 100);
  const rows = document.querySelectorAll('.recipe-ingredient-row');

  if (rows.length === 0) {
    alert('⚠️ No hay insumos en la receta para aplicar el porcentaje.');
    return;
  }

  rows.forEach(row => {
    const qtyInput = row.querySelector('.rec-qty-per-portion');
    if (qtyInput && qtyInput.value) {
      const currentQty = parseFloat(qtyInput.value);
      if (!isNaN(currentQty) && currentQty > 0) {
        const newQty = parseFloat((currentQty * multiplier).toFixed(4));
        qtyInput.value = newQty;
      }
    }
  });

  alert(`⚡ Cantidades ajustadas en un ${pct >= 0 ? '+' : ''}${pct}% correctamente!`);
  pctInput.value = '';
}

async function saveRecipe(e) {
  e.preventDefault();
  const pid = parseInt(document.getElementById('rec-product-id').value);
  const pin = document.getElementById('rec-pin').value.trim();
  const rows = document.querySelectorAll('.recipe-ingredient-row');

  const ingredients = [];
  rows.forEach(row => {
    const raw_material_id = row.querySelector('.rec-raw-material-id').value;
    const qty_per_portion = row.querySelector('.rec-qty-per-portion').value;
    if (raw_material_id && qty_per_portion) {
      ingredients.push({
        raw_material_id: parseInt(raw_material_id),
        qty_per_portion: parseFloat(qty_per_portion)
      });
    }
  });

  try {
    const res = await fetch('/api/admin/recipes/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: pid, ingredients, pin })
    });
    const data = await res.json();
    if (data.success) {
      closeRecipeModal();
      alert('👨‍🍳 FICHA TÉCNICA Y RECETA GUARDADAS CORRECTAMENTE!\n\nAl cargar producción o vender este plato, el sistema descontará automáticamente los insumos componentes del stock.');
    } else {
      alert(`⚠️ ${data.error}`);
    }
  } catch (err) {
    console.error('Error al guardar receta:', err);
  }
}

// ==========================================
// FICHAJE DE ASISTENCIA Y CÓMPUTO DE HORAS TRABAJADAS
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

function goToUserRegistration() {
  closeAttendanceModal();
  switchTab('users');
}

async function submitClockIn() {
  const pinInput = document.getElementById('att-pin-input');
  const sectorInput = document.getElementById('att-sector-input');
  const pin = pinInput ? pinInput.value.trim() : '';
  const sector = sectorInput ? sectorInput.value : '👑 Administración';

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
      if (data.error && data.error.includes('PIN personal no válido')) {
        const confirmGo = confirm('⚠️ TU PIN NO ESTÁ REGISTRADO AÚN EN EL SISTEMA.\n\nPara poder fichar entrada/salida y calcular tus horas trabajadas, primero debes solicitar que te asignen tu clave registrada en la sección de Personal.\n\n¿Deseas ir ahora a la pestaña "👤 Personal, Usuarios & PINs" para registrar la clave?');
        if (confirmGo) {
          goToUserRegistration();
        }
      } else {
        alert(`⚠️ ${data.error}`);
      }
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
      if (data.error && data.error.includes('PIN personal no válido')) {
        const confirmGo = confirm('⚠️ TU PIN NO ESTÁ REGISTRADO AÚN EN EL SISTEMA.\n\n¿Deseas ir ahora a la pestaña "👤 Personal, Usuarios & PINs" para registrar tu clave?');
        if (confirmGo) {
          goToUserRegistration();
        }
      } else {
        alert(`⚠️ ${data.error}`);
      }
    }
  } catch (err) {
    console.error('Error al fichar salida:', err);
  }
}
