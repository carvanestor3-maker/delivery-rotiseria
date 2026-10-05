// ==========================================================================
// ADMIN: PROMOS ARMABLES (combos con cupos)
// Se dibuja dentro de <div id="promos-admin-root"> en la pestaña Productos.
// Cada promo tiene cupos: nombre, cantidad y de dónde se elige (una categoría
// completa o una lista de platos ya cargados). No lleva ficha técnica propia:
// al venderla se descuenta la ficha técnica de cada plato elegido.
// ==========================================================================
(function () {
  var promos = [];
  var menuProducts = [];
  var menuCategories = [];
  var form = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR'); }
  function root() { return document.getElementById('promos-admin-root'); }

  async function load() {
    var r = root();
    if (!r) return;
    try {
      var results = await Promise.all([fetch('/api/admin/promos'), fetch('/api/menu')]);
      var pd = await results[0].json();
      var md = await results[1].json();
      promos = pd.success ? (pd.promos || []) : [];
      menuProducts = md.success ? (md.products || []) : [];
      menuCategories = md.success ? (md.categories || []) : [];
    } catch (err) {
      console.error('No se pudieron cargar las promos:', err);
    }
    renderList();
  }

  function slotSummary(slot) {
    var from;
    if (slot.product_ids && slot.product_ids.length) {
      from = slot.product_ids.length === 1 ? '1 plato' : slot.product_ids.length + ' platos';
    } else {
      var cat = menuCategories.find(function (c) { return c.id === slot.category_id; });
      from = cat ? 'categoría ' + cat.name : 'categoría';
    }
    return esc(slot.label) + ' × ' + slot.qty + ' <span style="color:#94a3b8;">(' + esc(from) + ')</span>';
  }

  function renderList() {
    var r = root();
    if (!r) return;
    var rows = promos.length === 0
      ? '<div style="padding:22px;text-align:center;color:#64748b;font-size:13px;">Todavía no hay promos armables. Creá la primera con el botón de arriba.</div>'
      : promos.map(function (p) {
          return '<div style="padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between;">' +
            '<div style="min-width:0;flex:1 1 260px;">' +
              '<div style="font-weight:800;font-size:14px;">' + esc(p.name) + ' <span style="font-family:monospace;color:#0f172a;">' + money(p.price) + '</span> ' +
              (p.available === 0 ? '<span style="background:#fee2e2;color:#991b1b;font-size:10px;font-weight:800;padding:2px 6px;border-radius:6px;">PAUSADA</span>' : '<span style="background:#dcfce7;color:#166534;font-size:10px;font-weight:800;padding:2px 6px;border-radius:6px;">ACTIVA</span>') + '</div>' +
              '<div style="font-size:12px;color:#475569;margin-top:2px;">' + p.slots.map(slotSummary).join(' + ') + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
              '<button type="button" data-pa="edit" data-id="' + p.id + '" style="padding:6px 10px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;">✏️ Editar</button>' +
              '<button type="button" data-pa="toggle" data-id="' + p.id + '" style="padding:6px 10px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;">' + (p.available === 0 ? '▶ Activar' : '⏸ Pausar') + '</button>' +
              '<button type="button" data-pa="delete" data-id="' + p.id + '" style="padding:6px 10px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;">🗑 Borrar</button>' +
            '</div></div>';
        }).join('');

    r.innerHTML =
      '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.05);margin-top:16px;">' +
        '<div style="padding:14px 16px;display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap;">' +
          '<div><div style="font-weight:800;font-size:16px;">🎁 Promos armables</div>' +
          '<div style="font-size:12px;color:#64748b;max-width:560px;">Combos con cupos (ej. 1 pizza + 12 empanadas, o 2 hamburguesas + 1 guarnición). El cliente y el cajero eligen los gustos, y el stock se descuenta de la ficha técnica de cada plato elegido. No hace falta cargar nada como plato nuevo.</div></div>' +
          '<button type="button" data-pa="new" style="background:#f97316;color:#fff;border:0;border-radius:10px;padding:9px 14px;font-weight:800;font-size:12px;cursor:pointer;">➕ Nueva promo</button>' +
        '</div>' + rows +
      '</div>';
  }

  function askPin(message) {
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.7);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Arial,sans-serif;';
      ov.innerHTML = '<div style="background:#fff;border-radius:14px;padding:18px;max-width:340px;width:100%;color:#0f172a;">' +
        '<div style="font-weight:800;margin-bottom:8px;font-size:14px;">' + esc(message) + '</div>' +
        '<input id="pa-pin" type="password" inputmode="numeric" placeholder="PIN (Nivel 2 o superior)" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;box-sizing:border-box;">' +
        '<div style="display:flex;gap:8px;margin-top:12px;"><button id="pa-pin-cancel" type="button" style="flex:1;padding:9px;border:0;background:#e2e8f0;border-radius:8px;font-weight:700;cursor:pointer;">Cancelar</button>' +
        '<button id="pa-pin-ok" type="button" style="flex:1;padding:9px;border:0;background:#0f172a;color:#fff;border-radius:8px;font-weight:700;cursor:pointer;">Confirmar</button></div></div>';
      document.body.appendChild(ov);
      var input = ov.querySelector('#pa-pin');
      input.focus();
      function done(v) { ov.remove(); resolve(v); }
      ov.querySelector('#pa-pin-cancel').onclick = function () { done(null); };
      ov.querySelector('#pa-pin-ok').onclick = function () { done(input.value.trim() || null); };
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') done(input.value.trim() || null); });
    });
  }

  async function send(method, url, body) {
    var res = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.json();
  }

  // ---------- Formulario ----------
  function emptyForm() {
    return { id: null, name: '', description: '', price: '', available: 1, slots: [{ label: '', qty: 1, mode: 'category', category_id: menuCategories.length ? menuCategories[0].id : null, product_ids: [] }] };
  }

  function editForm(p) {
    return {
      id: p.id, name: p.name, description: p.description || '', price: p.price, available: p.available === 0 ? 0 : 1,
      slots: p.slots.map(function (s) {
        var list = s.product_ids && s.product_ids.length > 0;
        return { label: s.label, qty: s.qty, mode: list ? 'list' : 'category', category_id: s.category_id, product_ids: (s.product_ids || []).slice() };
      })
    };
  }

  function openForm(f) {
    form = f;
    var old = document.getElementById('promo-admin-form');
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'promo-admin-form';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px;font-family:Arial,sans-serif;';
    ov.innerHTML = '<div style="background:#fff;color:#0f172a;border-radius:16px;max-width:640px;width:100%;max-height:94vh;display:flex;flex-direction:column;overflow:hidden;">' +
      '<div style="padding:14px 18px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;"><div style="font-weight:800;font-size:16px;">' + (form.id ? '✏️ Editar promo' : '🎁 Nueva promo') + '</div>' +
      '<button type="button" id="pf-close" aria-label="Cerrar" style="border:0;background:#f1f5f9;border-radius:8px;width:30px;height:30px;font-size:16px;font-weight:800;cursor:pointer;">✕</button></div>' +
      '<div id="pf-body" style="padding:14px 18px;overflow-y:auto;flex:1;"></div>' +
      '<div style="padding:12px 18px;border-top:1px solid #e2e8f0;background:#f8fafc;display:flex;gap:8px;justify-content:flex-end;">' +
      '<button type="button" id="pf-cancel" style="padding:9px 14px;border:0;background:#e2e8f0;border-radius:8px;font-weight:700;cursor:pointer;">Cancelar</button>' +
      '<button type="button" id="pf-save" style="padding:9px 16px;border:0;background:#f97316;color:#fff;border-radius:8px;font-weight:800;cursor:pointer;">Guardar promo</button></div></div>';
    document.body.appendChild(ov);
    ov.querySelector('#pf-close').onclick = closeForm;
    ov.querySelector('#pf-cancel').onclick = closeForm;
    ov.querySelector('#pf-save').onclick = saveForm;
    ov.addEventListener('input', onFormInput);
    ov.addEventListener('change', onFormInput);
    ov.addEventListener('click', onFormClick);
    renderForm();
  }

  function closeForm() {
    var ov = document.getElementById('promo-admin-form');
    if (ov) ov.remove();
    form = null;
  }

  var INPUT = 'width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;box-sizing:border-box;background:#fff;color:#0f172a;';

  function renderForm() {
    var body = document.querySelector('#promo-admin-form #pf-body');
    if (!body) return;
    var scroll = body.scrollTop;
    var catOptions = function (sel) {
      return menuCategories.map(function (c) { return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc((c.icon || '') + ' ' + c.name) + '</option>'; }).join('');
    };
    body.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 140px;gap:10px;margin-bottom:10px;">' +
        '<label style="font-size:12px;font-weight:700;">Nombre de la promo<input data-f="name" value="' + esc(form.name) + '" placeholder="Ej. Pizza + 12 empanadas" style="' + INPUT + '"></label>' +
        '<label style="font-size:12px;font-weight:700;">Precio ($)<input data-f="price" type="number" min="0" step="1" inputmode="decimal" value="' + esc(form.price) + '" style="' + INPUT + '"></label>' +
      '</div>' +
      '<label style="display:block;font-size:12px;font-weight:700;margin-bottom:10px;">Descripción (opcional)<input data-f="description" value="' + esc(form.description) + '" placeholder="Ej. Elegí tu pizza y tus 12 empanadas" style="' + INPUT + '"></label>' +
      '<div style="font-weight:800;font-size:13px;margin:12px 0 6px;">Cupos de la promo</div>' +
      form.slots.map(function (s, i) {
        var picker = s.mode === 'category'
          ? '<select data-s="' + i + '" data-k="category_id" style="' + INPUT + '">' + catOptions(s.category_id) + '</select>'
          : '<input data-pick-filter="' + i + '" placeholder="Buscar plato…" style="' + INPUT + 'margin-bottom:6px;">' +
            '<div data-pick-list="' + i + '" style="max-height:170px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;padding:4px;">' +
            menuProducts.map(function (p) {
              var cat = menuCategories.find(function (c) { return c.id === p.category_id; });
              return '<label data-name="' + esc((p.name + ' ' + (cat ? cat.name : '')).toLowerCase()) + '" style="display:flex;gap:8px;align-items:center;padding:4px 6px;font-size:12px;cursor:pointer;"><input type="checkbox" data-s="' + i + '" data-k="pick" value="' + p.id + '"' + (s.product_ids.indexOf(p.id) > -1 ? ' checked' : '') + '> ' + esc(p.name) + ' <span style="color:#94a3b8;">' + esc(cat ? cat.name : '') + '</span></label>';
            }).join('') + '</div>' +
            '<div style="font-size:11px;color:#64748b;margin-top:4px;">' + s.product_ids.length + ' plato(s) elegido(s)</div>';
        return '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:10px;margin-bottom:8px;background:#f8fafc;">' +
          '<div style="display:grid;grid-template-columns:1fr 90px auto;gap:8px;align-items:end;margin-bottom:8px;">' +
            '<label style="font-size:11px;font-weight:700;">Nombre del cupo<input data-s="' + i + '" data-k="label" value="' + esc(s.label) + '" placeholder="Ej. Pizza, Empanadas, Guarnición" style="' + INPUT + '"></label>' +
            '<label style="font-size:11px;font-weight:700;">Cantidad<input data-s="' + i + '" data-k="qty" type="number" min="1" step="1" value="' + esc(s.qty) + '" style="' + INPUT + '"></label>' +
            (form.slots.length > 1 ? '<button type="button" data-act="rm-slot" data-s="' + i + '" title="Quitar cupo" style="padding:8px 10px;border:0;background:#fee2e2;color:#b91c1c;border-radius:8px;font-weight:800;cursor:pointer;">🗑</button>' : '<span></span>') +
          '</div>' +
          '<div style="display:flex;gap:14px;font-size:12px;font-weight:700;margin-bottom:6px;flex-wrap:wrap;">' +
            '<label style="cursor:pointer;" title="No incluye los artículos cuyo nombre empieza con Promo o Combo"><input type="radio" name="mode-' + i + '" data-s="' + i + '" data-k="mode" value="category"' + (s.mode === 'category' ? ' checked' : '') + '> Elegir de una categoría</label>' +
            '<label style="cursor:pointer;"><input type="radio" name="mode-' + i + '" data-s="' + i + '" data-k="mode" value="list"' + (s.mode === 'list' ? ' checked' : '') + '> Elegir de una lista de platos</label>' +
          '</div>' + picker + '</div>';
      }).join('') +
      '<button type="button" data-act="add-slot" style="padding:8px 12px;border:1px dashed #94a3b8;background:#fff;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;margin-bottom:12px;">➕ Agregar otro cupo</button>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:12px;font-weight:700;margin-bottom:10px;"><input type="checkbox" data-f="available"' + (form.available !== 0 ? ' checked' : '') + '> Promo activa (visible para pedir)</label>' +
      '<label style="display:block;font-size:12px;font-weight:700;">Tu PIN (Nivel 2 o superior)<input id="pf-pin" type="password" inputmode="numeric" style="' + INPUT + 'max-width:200px;" autocomplete="off"></label>' +
      '<div id="pf-error" style="color:#b91c1c;font-size:12px;font-weight:700;margin-top:8px;display:none;"></div>';
    body.scrollTop = scroll;
  }

  function onFormInput(e) {
    var t = e.target;
    if (!form || !t) return;
    if (t.hasAttribute('data-f')) {
      var k = t.getAttribute('data-f');
      form[k] = k === 'available' ? (t.checked ? 1 : 0) : t.value;
      return;
    }
    if (t.hasAttribute('data-pick-filter')) {
      var q = t.value.trim().toLowerCase();
      var list = document.querySelector('[data-pick-list="' + t.getAttribute('data-pick-filter') + '"]');
      if (list) list.querySelectorAll('label').forEach(function (l) { l.style.display = !q || (l.getAttribute('data-name') || '').indexOf(q) > -1 ? 'flex' : 'none'; });
      return;
    }
    if (t.hasAttribute('data-s')) {
      var i = parseInt(t.getAttribute('data-s'));
      var key = t.getAttribute('data-k');
      var slot = form.slots[i];
      if (!slot) return;
      if (key === 'pick') {
        var id = parseInt(t.value);
        var pos = slot.product_ids.indexOf(id);
        if (t.checked && pos === -1) slot.product_ids.push(id);
        if (!t.checked && pos > -1) slot.product_ids.splice(pos, 1);
        // actualizar contador sin redibujar (para no perder el scroll de la lista)
        var info = document.querySelector('[data-pick-list="' + i + '"]');
        if (info && info.nextElementSibling) info.nextElementSibling.textContent = slot.product_ids.length + ' plato(s) elegido(s)';
      } else if (key === 'mode') {
        slot.mode = t.value;
        renderForm();
      } else if (key === 'category_id') {
        slot.category_id = parseInt(t.value);
      } else if (key === 'qty') {
        slot.qty = t.value;
      } else {
        slot[key] = t.value;
      }
    }
  }

  function onFormClick(e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn || !form) return;
    var act = btn.getAttribute('data-act');
    if (act === 'add-slot') {
      if (form.slots.length >= 8) return;
      form.slots.push({ label: '', qty: 1, mode: 'category', category_id: menuCategories.length ? menuCategories[0].id : null, product_ids: [] });
      renderForm();
    } else if (act === 'rm-slot') {
      form.slots.splice(parseInt(btn.getAttribute('data-s')), 1);
      renderForm();
    }
  }

  function showError(msg) {
    var el = document.querySelector('#promo-admin-form #pf-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  async function saveForm() {
    var pin = (document.getElementById('pf-pin') || {}).value;
    if (!form.name.trim()) return showError('Poné un nombre a la promo.');
    if (!(parseFloat(form.price) > 0)) return showError('Poné un precio mayor a 0.');
    for (var i = 0; i < form.slots.length; i++) {
      var s = form.slots[i];
      if (!String(s.label).trim()) return showError('Cada cupo necesita un nombre.');
      if (!(parseInt(s.qty) >= 1)) return showError('La cantidad del cupo "' + s.label + '" tiene que ser 1 o más.');
      if (s.mode === 'list' && s.product_ids.length === 0) return showError('Elegí al menos un plato en el cupo "' + s.label + '".');
    }
    if (!pin) return showError('Ingresá tu PIN para guardar.');
    var payload = {
      id: form.id, name: form.name, description: form.description, price: form.price, available: form.available, pin: pin,
      slots: form.slots.map(function (s) {
        return { label: s.label, qty: parseInt(s.qty), category_id: s.mode === 'category' ? s.category_id : null, product_ids: s.mode === 'list' ? s.product_ids : [] };
      })
    };
    try {
      var data = await send('POST', '/api/admin/promos', payload);
      if (!data.success) return showError(data.error || 'No se pudo guardar.');
      closeForm();
      await load();
    } catch (err) {
      showError('Error de conexión al guardar.');
    }
  }

  // ---------- Acciones de la lista ----------
  document.addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-pa]');
    if (!btn || !root() || !root().contains(btn)) return;
    var act = btn.getAttribute('data-pa');
    var id = parseInt(btn.getAttribute('data-id'));
    var p = promos.find(function (x) { return x.id === id; });
    if (act === 'new') { openForm(emptyForm()); return; }
    if (!p) return;
    if (act === 'edit') { openForm(editForm(p)); return; }
    if (act === 'toggle') {
      var pin = await askPin((p.available === 0 ? 'Activar' : 'Pausar') + ' la promo "' + p.name + '"');
      if (!pin) return;
      var d = await send('POST', '/api/admin/promos', { id: p.id, name: p.name, description: p.description, price: p.price, available: p.available === 0 ? 1 : 0, slots: p.slots, pin: pin });
      if (!d.success) alert('⚠️ ' + d.error);
      await load();
    } else if (act === 'delete') {
      var pin2 = await askPin('Borrar la promo "' + p.name + '". Los pedidos ya hechos no se modifican.');
      if (!pin2) return;
      var d2 = await send('DELETE', '/api/admin/promos/' + p.id, { pin: pin2 });
      if (!d2.success) alert('⚠️ ' + d2.error);
      await load();
    }
  });

  window.loadPromosAdmin = load;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
