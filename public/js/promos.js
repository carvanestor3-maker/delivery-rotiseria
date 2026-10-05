// ==========================================================================
// PROMOS ARMABLES: constructor compartido por el portal de pedidos (index.html)
// y la Caja / POS (caja.html). La promo se define una vez en el Admin con
// cupos (ej. 1 pizza + 12 empanadas). Acá se eligen los gustos de cada cupo.
// Al vender, el servidor descuenta la ficha técnica de cada plato elegido.
// ==========================================================================
(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  window.promoMoney = function (n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
  };

  // Identifica una combinación de gustos: si es la misma, se suma la cantidad en el carrito.
  window.promoSignature = function (selections) {
    return (selections || []).map(function (s) { return s.slot + '_' + s.product_id + 'x' + s.qty; }).sort().join('-');
  };

  window.promoDetailText = function (selections) {
    var groups = [];
    (selections || []).forEach(function (sel) {
      var g = groups.find(function (x) { return x.slot === sel.slot; });
      if (!g) { g = { slot: sel.slot, label: sel.label, parts: [] }; groups.push(g); }
      g.parts.push(sel.qty > 1 ? sel.qty + ' ' + sel.name : sel.name);
    });
    return groups.map(function (g) { return g.label + ': ' + g.parts.join(', '); }).join(' | ');
  };

  // promo: { id, name, description, price, slots:[{index,label,qty,options:[{id,name}]}] }
  // onAdd(item): recibe el ítem listo para el carrito.
  window.openPromoBuilder = function (promo, onAdd) {
    var old = document.getElementById('promo-builder-overlay');
    if (old) old.remove();

    // counts[slotIndex][productId] = cantidad
    var counts = promo.slots.map(function (slot) {
      var c = {};
      if (slot.options.length === 1) c[slot.options[0].id] = slot.qty; // única opción: ya queda elegida
      return c;
    });

    function slotTotal(i) {
      return Object.keys(counts[i]).reduce(function (s, k) { return s + counts[i][k]; }, 0);
    }
    function missing() {
      return promo.slots.reduce(function (s, slot, i) { return s + (slot.qty - slotTotal(i)); }, 0);
    }

    var overlay = document.createElement('div');
    overlay.id = 'promo-builder-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.8);z-index:99998;display:flex;align-items:center;justify-content:center;padding:12px;font-family:Arial,Helvetica,sans-serif;';
    overlay.innerHTML =
      '<div style="background:#fff;color:#0f172a;border-radius:16px;max-width:520px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.5);overflow:hidden;">' +
        '<div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">' +
          '<div style="min-width:0;"><div style="font-size:11px;font-weight:800;color:#c2410c;letter-spacing:.5px;">ARMÁ TU PROMO</div>' +
          '<div style="font-size:17px;font-weight:800;line-height:1.2;">' + esc(promo.name) + '</div>' +
          (promo.description ? '<div style="font-size:12px;color:#64748b;margin-top:2px;">' + esc(promo.description) + '</div>' : '') + '</div>' +
          '<button type="button" id="promo-b-close" aria-label="Cerrar" style="border:0;background:#f1f5f9;border-radius:8px;width:30px;height:30px;font-size:16px;font-weight:800;cursor:pointer;flex-shrink:0;">✕</button>' +
        '</div>' +
        '<div id="promo-b-body" style="padding:12px 16px;overflow-y:auto;flex:1;"></div>' +
        '<div style="padding:12px 16px;border-top:1px solid #e2e8f0;background:#f8fafc;">' +
          '<div id="promo-b-hint" style="font-size:12px;font-weight:700;margin-bottom:8px;"></div>' +
          '<button type="button" id="promo-b-add" style="width:100%;padding:12px;border:0;border-radius:10px;font-weight:800;font-size:14px;cursor:pointer;"></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var body = overlay.querySelector('#promo-b-body');
    var addBtn = overlay.querySelector('#promo-b-add');
    var hint = overlay.querySelector('#promo-b-hint');

    function close() {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('#promo-b-close').onclick = close;

    function render() {
      var scroll = body.scrollTop;
      body.innerHTML = promo.slots.map(function (slot, i) {
        var done = slotTotal(i) === slot.qty;
        var full = slotTotal(i) >= slot.qty;
        return '<div style="margin-bottom:14px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<div style="font-weight:800;font-size:14px;">' + esc(slot.label) + ' <span style="font-weight:600;color:#64748b;font-size:12px;">· elegí ' + slot.qty + '</span></div>' +
            '<div style="font-size:12px;font-weight:800;padding:2px 8px;border-radius:99px;' + (done ? 'background:#dcfce7;color:#166534;' : 'background:#ffedd5;color:#9a3412;') + '">' + slotTotal(i) + ' / ' + slot.qty + '</div>' +
          '</div>' +
          slot.options.map(function (opt) {
            var n = counts[i][opt.id] || 0;
            return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;border:1px solid ' + (n > 0 ? '#fdba74' : '#e2e8f0') + ';background:' + (n > 0 ? '#fff7ed' : '#fff') + ';border-radius:10px;margin-bottom:5px;">' +
              '<div style="font-size:13px;font-weight:' + (n > 0 ? '800' : '600') + ';min-width:0;overflow-wrap:anywhere;">' + esc(opt.name) + '</div>' +
              '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">' +
                '<button type="button" data-act="minus" data-slot="' + i + '" data-pid="' + opt.id + '" aria-label="Quitar ' + esc(opt.name) + '" style="width:30px;height:30px;border:0;border-radius:8px;background:#e2e8f0;font-weight:800;font-size:16px;cursor:pointer;"' + (n === 0 ? ' disabled' : '') + '>−</button>' +
                '<span style="min-width:24px;text-align:center;font-weight:800;font-family:monospace;font-size:14px;">' + n + '</span>' +
                '<button type="button" data-act="plus" data-slot="' + i + '" data-pid="' + opt.id + '" aria-label="Sumar ' + esc(opt.name) + '" style="width:30px;height:30px;border:0;border-radius:8px;background:' + (full ? '#e2e8f0' : '#f97316') + ';color:' + (full ? '#94a3b8' : '#fff') + ';font-weight:800;font-size:16px;cursor:pointer;"' + (full ? ' disabled' : '') + '>+</button>' +
              '</div></div>';
          }).join('') +
        '</div>';
      }).join('');
      body.scrollTop = scroll;

      var m = missing();
      hint.textContent = m > 0 ? 'Te faltan ' + m + ' por elegir.' : 'Lista para agregar.';
      hint.style.color = m > 0 ? '#9a3412' : '#166534';
      addBtn.disabled = m > 0;
      addBtn.style.background = m > 0 ? '#cbd5e1' : '#f97316';
      addBtn.style.color = m > 0 ? '#64748b' : '#fff';
      addBtn.style.cursor = m > 0 ? 'not-allowed' : 'pointer';
      addBtn.textContent = 'Agregar · ' + window.promoMoney(promo.price);
    }

    body.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn || btn.disabled) return;
      var i = parseInt(btn.getAttribute('data-slot'));
      var pid = btn.getAttribute('data-pid');
      var cur = counts[i][pid] || 0;
      if (btn.getAttribute('data-act') === 'plus') {
        if (slotTotal(i) >= promo.slots[i].qty) return;
        counts[i][pid] = cur + 1;
      } else if (cur > 0) {
        counts[i][pid] = cur - 1;
        if (counts[i][pid] === 0) delete counts[i][pid];
      }
      render();
    });

    addBtn.onclick = function () {
      if (missing() > 0) return;
      var selections = [];
      promo.slots.forEach(function (slot, i) {
        slot.options.forEach(function (opt) {
          var n = counts[i][opt.id] || 0;
          if (n > 0) selections.push({ slot: i, label: slot.label, product_id: opt.id, name: opt.name, qty: n });
        });
      });
      var item = {
        id: 'promo-' + promo.id + '-' + window.promoSignature(selections),
        promo_id: promo.id,
        name: promo.name,
        price: promo.price,
        qty: 1,
        selections: selections,
        detail: window.promoDetailText(selections)
      };
      close();
      onAdd(item);
    };

    render();
  };
})();
