// ==========================================================================
// PROMOS ARMABLES: constructor compartido por el portal de pedidos (index.html)
// y la Caja / POS (caja.html). La promo se define una vez en el Admin con
// cupos (ej. 1 pizza + 12 empanadas, o pan + carne + papas). Cada cupo puede
// tener una cantidad exacta o un rango (mín–máx), y sus opciones pueden ser
// platos o pre-armados en porciones (150 g, 250 g…) con su propio precio.
// Hay descuento por cantidad: cuantas más unidades, mayor porcentaje.
// El servidor vuelve a calcular todo y descuenta el stock al vender.
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

  function optKey(opt) { return opt.key || ('p' + opt.id); }
  function slotMin(slot) { return Number.isInteger(slot.min) ? slot.min : slot.qty; }
  function slotMax(slot) { return Number.isInteger(slot.max) ? slot.max : slot.qty; }

  // Identifica una combinación de gustos: si es la misma, se suma la cantidad en el carrito.
  window.promoSignature = function (selections) {
    return (selections || []).map(function (s) {
      return s.slot + '_' + (s.item_key || s.product_id) + 'x' + s.qty;
    }).sort().join('-');
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

  // "1", "1 a 3", "hasta 5": texto del rango de un cupo
  window.promoSlotQtyText = function (slot) {
    var mn = slotMin(slot), mx = slotMax(slot);
    if (mn === mx) return String(mx);
    if (mn === 0) return 'hasta ' + mx;
    return mn + ' a ' + mx;
  };

  // Mismo cálculo que el servidor. counts[i][clave] = cantidad elegida.
  window.promoCompute = function (promo, counts) {
    var subtotal = Number(promo.price) || 0;
    var slotCounts = promo.slots.map(function (slot, i) {
      var n = 0;
      slot.options.forEach(function (opt) {
        var q = (counts[i] && counts[i][optKey(opt)]) || 0;
        n += q;
        subtotal += q * (Number(opt.price) || 0);
      });
      return n;
    });
    var d = promo.discount;
    var pct = 0, count = 0, next = null;
    if (d && d.tiers && d.tiers.length) {
      count = slotCounts.reduce(function (a, n, i) {
        return a + ((d.slot === null || d.slot === undefined || d.slot === i) ? n : 0);
      }, 0);
      d.tiers.forEach(function (t) { if (count >= t.min && t.percent > pct) pct = t.percent; });
      for (var k = 0; k < d.tiers.length; k++) {
        if (d.tiers[k].min > count) { next = { missing: d.tiers[k].min - count, percent: d.tiers[k].percent }; break; }
      }
    }
    subtotal = parseFloat(subtotal.toFixed(2));
    var total = pct > 0 ? Math.round(subtotal * (1 - pct / 100)) : subtotal;
    return { subtotal: subtotal, pct: pct, total: total, count: count, next: next, slotCounts: slotCounts };
  };

  // Precio para mostrar en las tarjetas: exacto, o "Desde $X" si depende de lo que se elija.
  window.promoPriceLabel = function (promo) {
    var from = Number(promo.price) || 0;
    var variable = false;
    promo.slots.forEach(function (slot) {
      var prices = slot.options.map(function (o) { return Number(o.price) || 0; });
      if (prices.some(function (p) { return p > 0; })) variable = true;
      if (slotMin(slot) !== slotMax(slot)) variable = true;
      if (prices.length) from += slotMin(slot) * Math.min.apply(null, prices);
    });
    return variable ? 'Desde ' + window.promoMoney(from) : window.promoMoney(promo.price);
  };

  // promo: { id, name, description, price, discount, slots:[{index,label,qty,min,max,options:[{id,key,type,name,price}]}] }
  // onAdd(item): recibe el ítem listo para el carrito.
  // Agrupa las promos que comparten "grupo" (ej. "Armá tu comida": hamburguesa, sándwich de
  // milanesa, lomito...) en una sola tarjeta. Devuelve [{isGroup, name, promos, promo}].
  window.promoGroupEntries = function (promos) {
    var out = [], groups = {};
    (promos || []).forEach(function (pr) {
      var g = String(pr.group || '').trim();
      if (!g) { out.push({ isGroup: false, promo: pr }); return; }
      var k = g.toLowerCase();
      if (!groups[k]) { groups[k] = { isGroup: true, name: g, promos: [] }; out.push(groups[k]); }
      groups[k].promos.push(pr);
    });
    // un grupo con una sola promo se muestra como promo común
    return out.map(function (e) { return e.isGroup && e.promos.length === 1 ? { isGroup: false, promo: e.promos[0] } : e; });
  };

  // Primer paso: "¿Qué querés armar?". Al elegir, se abre el armador de esa promo (con "Volver").
  window.openPromoGroup = function (entry, onAdd) {
    var old = document.getElementById('promo-group-overlay');
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'promo-group-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.8);z-index:99997;display:flex;align-items:center;justify-content:center;padding:12px;font-family:Arial,Helvetica,sans-serif;';
    function imgOf(pr) {
      if (pr.image_url) return pr.image_url;
      for (var i = 0; i < pr.slots.length; i++) {
        for (var j = 0; j < pr.slots[i].options.length; j++) { if (pr.slots[i].options[j].image_url) return pr.slots[i].options[j].image_url; }
      }
      return '';
    }
    function show() {
      ov.innerHTML = '<div style="background:#fff;color:#0f172a;border-radius:16px;max-width:520px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.5);overflow:hidden;">' +
        '<div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">' +
          '<div><div style="font-size:11px;font-weight:800;color:#c2410c;letter-spacing:.5px;">' + esc(entry.name).toUpperCase() + '</div>' +
          '<div style="font-size:17px;font-weight:800;">¿Qué querés armar?</div></div>' +
          '<button type="button" id="pg-close" aria-label="Cerrar" style="border:0;background:#f1f5f9;border-radius:8px;width:30px;height:30px;font-size:16px;font-weight:800;cursor:pointer;">✕</button></div>' +
        '<div style="padding:12px 16px;overflow-y:auto;">' +
          entry.promos.map(function (pr, i) {
            var im = imgOf(pr);
            return '<button type="button" data-pick="' + i + '" style="display:flex;gap:12px;align-items:center;width:100%;text-align:left;padding:10px;border:1px solid #fdba74;background:#fff7ed;border-radius:12px;margin-bottom:8px;cursor:pointer;color:#0f172a;">' +
              '<span style="width:56px;height:56px;border-radius:12px;overflow:hidden;background:#fed7aa;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;color:#9a3412;">' +
                (im ? '<img src="' + esc(im) + '" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display=\'none\'">' : esc(String(pr.name).charAt(0).toUpperCase())) + '</span>' +
              '<span style="min-width:0;flex:1;"><span style="display:block;font-weight:800;font-size:14px;">' + esc(pr.name) + '</span>' +
                (pr.description ? '<span style="display:block;font-size:12px;color:#64748b;margin-top:1px;">' + esc(pr.description) + '</span>' : '') +
                '<span style="display:block;font-size:12px;font-weight:800;color:#c2410c;margin-top:2px;">' + window.promoPriceLabel(pr) + '</span></span>' +
              '<span style="font-size:18px;color:#c2410c;font-weight:800;">›</span></button>';
          }).join('') + '</div></div>';
      ov.querySelector('#pg-close').onclick = close;
      ov.querySelectorAll('[data-pick]').forEach(function (b) {
        b.onclick = function () {
          var pr = entry.promos[parseInt(b.getAttribute('data-pick'))];
          ov.style.display = 'none';
          window.openPromoBuilder(pr, function (item) { close(); onAdd(item); }, { onBack: function () { ov.style.display = 'flex'; }, onClose: close });
        };
      });
    }
    function close() { document.removeEventListener('keydown', onKey); ov.remove(); }
    function onKey(e) { if (e.key === 'Escape' && ov.style.display !== 'none') close(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
    show();
  };

  window.openPromoBuilder = function (promo, onAdd, opts) {
    opts = opts || {};
    var old = document.getElementById('promo-builder-overlay');
    if (old) old.remove();

    // counts[slotIndex][clave de opción] = cantidad
    var counts = promo.slots.map(function (slot) {
      var c = {};
      if (slotMin(slot) === slotMax(slot) && slot.options.length === 1) c[optKey(slot.options[0])] = slotMax(slot); // única opción: ya queda elegida
      return c;
    });

    function slotTotal(i) {
      return Object.keys(counts[i]).reduce(function (s, k) { return s + counts[i][k]; }, 0);
    }
    function missing() {
      return promo.slots.reduce(function (s, slot, i) { return s + Math.max(0, slotMin(slot) - slotTotal(i)); }, 0);
    }
    function nothingChosen() {
      return promo.slots.every(function (slot, i) { return slotTotal(i) === 0; });
    }

    var overlay = document.createElement('div');
    overlay.id = 'promo-builder-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.8);z-index:99998;display:flex;align-items:center;justify-content:center;padding:12px;font-family:Arial,Helvetica,sans-serif;';
    overlay.innerHTML =
      '<div style="background:#fff;color:#0f172a;border-radius:16px;max-width:520px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.5);overflow:hidden;">' +
        '<div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">' +
          '<div style="min-width:0;">' + (opts.onBack ? '<button type="button" id="promo-b-back" style="border:0;background:none;color:#c2410c;font-weight:800;font-size:12px;cursor:pointer;padding:0 0 2px;">‹ Cambiar de producto</button>' : '') + '<div style="font-size:11px;font-weight:800;color:#c2410c;letter-spacing:.5px;">ARMÁ EL TUYO</div>' +
          '<div style="font-size:17px;font-weight:800;line-height:1.2;">' + esc(promo.name) + '</div>' +
          (promo.description ? '<div style="font-size:12px;color:#64748b;margin-top:2px;">' + esc(promo.description) + '</div>' : '') + '</div>' +
          '<button type="button" id="promo-b-close" aria-label="Cerrar" style="border:0;background:#f1f5f9;border-radius:8px;width:30px;height:30px;font-size:16px;font-weight:800;cursor:pointer;flex-shrink:0;">✕</button>' +
        '</div>' +
        '<div id="promo-b-preview" style="display:none;padding:8px 16px 6px;border-bottom:1px solid #e2e8f0;background:linear-gradient(#fff7ed,#fff);"></div>' +
        '<div id="promo-b-body" style="padding:12px 16px;overflow-y:auto;flex:1;"></div>' +
        '<div style="padding:12px 16px;border-top:1px solid #e2e8f0;background:#f8fafc;">' +
          '<div id="promo-b-tiers" style="font-size:11px;color:#475569;margin-bottom:6px;"></div>' +
          '<div id="promo-b-sum" style="font-size:12px;margin-bottom:6px;"></div>' +
          '<div id="promo-b-hint" style="font-size:12px;font-weight:700;margin-bottom:8px;"></div>' +
          '<button type="button" id="promo-b-add" style="width:100%;padding:12px;border:0;border-radius:10px;font-weight:800;font-size:14px;cursor:pointer;"></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var body = overlay.querySelector('#promo-b-body');
    var addBtn = overlay.querySelector('#promo-b-add');
    var hint = overlay.querySelector('#promo-b-hint');
    var sum = overlay.querySelector('#promo-b-sum');
    var tiersEl = overlay.querySelector('#promo-b-tiers');
    var previewEl = overlay.querySelector('#promo-b-preview');

    // Foto de una opción: la propia (pre-armados) o la del plato en el menú (platos).
    function optImage(opt) {
      if (opt.image_url) return opt.image_url;
      if (opt.type === 'product') {
        var lists = [];
        try { if (typeof state !== 'undefined' && state && state.products) lists.push(state.products); } catch (e) {}
        try { if (typeof posProducts !== 'undefined' && posProducts) lists.push(posProducts); } catch (e) {}
        for (var k = 0; k < lists.length; k++) {
          var f = lists[k].find(function (p) { return p.id === opt.id; });
          if (f && f.image_url) return f.image_url;
        }
      }
      return '';
    }
    var promoHasPhotos = promo.slots.some(function (slot) { return slot.options.some(function (o) { return !!optImage(o); }); });

    // Vista estimativa: las fotos de lo elegido, en el orden de los cupos, apiladas sobre un "plato".
    function renderPreview() {
      if (!promoHasPhotos) { previewEl.style.display = 'none'; return; }
      var tokens = [];
      promo.slots.forEach(function (slot, i) {
        slot.options.forEach(function (opt) {
          var n = counts[i][optKey(opt)] || 0;
          if (n > 0) tokens.push({ opt: opt, n: n });
        });
      });
      var shown = tokens.slice(0, 8);
      var inner;
      if (tokens.length === 0) {
        inner = '<div style="font-size:12px;color:#9a3412;font-weight:700;padding:14px 0;text-align:center;">Elegí tus ingredientes y mirá cómo te va quedando 👇</div>';
      } else {
        inner = '<div style="display:flex;justify-content:center;align-items:center;padding:4px 8px 0;min-height:70px;">' +
          shown.map(function (tk, idx) {
            var src = optImage(tk.opt);
            var face = src
              ? '<img src="' + esc(src) + '" alt="' + esc(tk.opt.name) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display=\'none\';this.parentNode.style.background=\'#fed7aa\';this.parentNode.setAttribute(\'data-fallback\',\'1\')">'
              : '';
            var initial = '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;color:#9a3412;z-index:0;">' + esc(String(tk.opt.name || '?').charAt(0).toUpperCase()) + '</span>';
            return '<div title="' + esc(tk.opt.name) + '" style="position:relative;width:62px;height:62px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.28);background:#fed7aa;margin-left:' + (idx === 0 ? '0' : '-16px') + ';z-index:' + (20 - idx) + ';flex-shrink:0;overflow:visible;">' +
              '<div style="position:absolute;inset:0;border-radius:50%;overflow:hidden;">' + initial + (src ? '<div style="position:absolute;inset:0;z-index:1;">' + face + '</div>' : '') + '</div>' +
              (tk.n > 1 ? '<span style="position:absolute;right:-4px;bottom:-4px;background:#f97316;color:#fff;font-size:11px;font-weight:800;border-radius:99px;padding:1px 6px;border:2px solid #fff;z-index:30;">×' + tk.n + '</span>' : '') +
            '</div>';
          }).join('') +
          (tokens.length > shown.length ? '<span style="margin-left:6px;font-size:12px;font-weight:800;color:#9a3412;">+' + (tokens.length - shown.length) + '</span>' : '') +
        '</div>';
      }
      previewEl.innerHTML = inner + '<div style="text-align:center;font-size:10px;color:#94a3b8;margin-top:3px;">Imagen estimativa · el producto real puede variar un poco</div>';
      previewEl.style.display = 'block';
    }

    function close() {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      if (opts.onClose) opts.onClose();
    }
    var backBtn = overlay.querySelector('#promo-b-back');
    if (backBtn) backBtn.onclick = function () {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      opts.onBack();
    };
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('#promo-b-close').onclick = close;

    function tiersText() {
      var d = promo.discount;
      if (!d || !d.tiers || !d.tiers.length) return '';
      var what = (d.slot === null || d.slot === undefined) ? 'unidades' : String(promo.slots[d.slot] ? promo.slots[d.slot].label : 'unidades').toLowerCase();
      return '🎯 <b>Descuento por cantidad</b> (' + esc(what) + '): ' + d.tiers.map(function (t) {
        return 'desde ' + t.min + ' → <b>' + t.percent + '%</b>';
      }).join(' · ');
    }

    function render() {
      var scroll = body.scrollTop;
      body.innerHTML = promo.slots.map(function (slot, i) {
        var mn = slotMin(slot), mx = slotMax(slot);
        var total = slotTotal(i);
        var done = total >= mn && total <= mx;
        var full = total >= mx;
        var title = mn === mx ? 'elegí ' + mx : (mn === 0 ? 'hasta ' + mx + ' (opcional)' : 'elegí de ' + mn + ' a ' + mx);
        return '<div style="margin-bottom:14px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<div style="font-weight:800;font-size:14px;">' + esc(slot.label) + ' <span style="font-weight:600;color:#64748b;font-size:12px;">· ' + title + '</span></div>' +
            '<div style="font-size:12px;font-weight:800;padding:2px 8px;border-radius:99px;' + (done ? 'background:#dcfce7;color:#166534;' : 'background:#ffedd5;color:#9a3412;') + '">' + total + ' / ' + mx + '</div>' +
          '</div>' +
          slot.options.map(function (opt) {
            var key = optKey(opt);
            var n = counts[i][key] || 0;
            var price = Number(opt.price) || 0;
            var plusOff = full && mx > 1;
            return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;border:1px solid ' + (n > 0 ? '#fdba74' : '#e2e8f0') + ';background:' + (n > 0 ? '#fff7ed' : '#fff') + ';border-radius:10px;margin-bottom:5px;">' +
              '<div style="min-width:0;">' +
                '<div style="font-size:13px;font-weight:' + (n > 0 ? '800' : '600') + ';overflow-wrap:anywhere;">' + esc(opt.name) + '</div>' +
                (price > 0 ? '<div style="font-size:11px;color:#c2410c;font-weight:700;">+ ' + window.promoMoney(price) + '</div>' : '') +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">' +
                '<button type="button" data-act="minus" data-slot="' + i + '" data-key="' + esc(key) + '" aria-label="Quitar ' + esc(opt.name) + '" style="width:30px;height:30px;border:0;border-radius:8px;background:#e2e8f0;font-weight:800;font-size:16px;cursor:pointer;"' + (n === 0 ? ' disabled' : '') + '>−</button>' +
                '<span style="min-width:24px;text-align:center;font-weight:800;font-family:monospace;font-size:14px;">' + n + '</span>' +
                '<button type="button" data-act="plus" data-slot="' + i + '" data-key="' + esc(key) + '" aria-label="Sumar ' + esc(opt.name) + '" style="width:30px;height:30px;border:0;border-radius:8px;background:' + (plusOff ? '#e2e8f0' : '#f97316') + ';color:' + (plusOff ? '#94a3b8' : '#fff') + ';font-weight:800;font-size:16px;cursor:pointer;"' + (plusOff ? ' disabled' : '') + '>+</button>' +
              '</div></div>';
          }).join('') +
        '</div>';
      }).join('');
      body.scrollTop = scroll;

      renderPreview();
      var calc = window.promoCompute(promo, counts);
      var m = missing();
      var blocked = m > 0 || nothingChosen() || calc.total <= 0;

      tiersEl.innerHTML = tiersText();
      var lines = '';
      if (calc.pct > 0 || calc.subtotal !== calc.total) {
        lines += '<div style="display:flex;justify-content:space-between;"><span style="color:#64748b;">Subtotal</span><span style="font-family:monospace;">' + window.promoMoney(calc.subtotal) + '</span></div>';
        if (calc.pct > 0) lines += '<div style="display:flex;justify-content:space-between;color:#166534;font-weight:800;"><span>Descuento ' + calc.pct + '%</span><span style="font-family:monospace;">− ' + window.promoMoney(calc.subtotal - calc.total) + '</span></div>';
      }
      if (calc.next) {
        lines += '<div style="color:#9a3412;font-weight:700;margin-top:2px;">Sumá ' + calc.next.missing + ' más y tenés ' + calc.next.percent + '% de descuento.</div>';
      }
      sum.innerHTML = lines;

      hint.textContent = m > 0 ? 'Te faltan ' + m + ' por elegir.' : (nothingChosen() ? 'Elegí al menos una opción.' : 'Lista para agregar.');
      hint.style.color = blocked ? '#9a3412' : '#166534';
      addBtn.disabled = blocked;
      addBtn.style.background = blocked ? '#cbd5e1' : '#f97316';
      addBtn.style.color = blocked ? '#64748b' : '#fff';
      addBtn.style.cursor = blocked ? 'not-allowed' : 'pointer';
      addBtn.textContent = 'Agregar · ' + window.promoMoney(calc.total);
    }

    body.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn || btn.disabled) return;
      var i = parseInt(btn.getAttribute('data-slot'));
      var key = btn.getAttribute('data-key');
      var slot = promo.slots[i];
      var cur = counts[i][key] || 0;
      if (btn.getAttribute('data-act') === 'plus') {
        if (slotTotal(i) >= slotMax(slot)) {
          // cupo de 1 sola opción posible: tocar otra opción la reemplaza
          if (slotMax(slot) === 1) { counts[i] = {}; counts[i][key] = 1; render(); }
          return;
        }
        counts[i][key] = cur + 1;
      } else if (cur > 0) {
        counts[i][key] = cur - 1;
        if (counts[i][key] === 0) delete counts[i][key];
      }
      render();
    });

    addBtn.onclick = function () {
      if (missing() > 0 || nothingChosen()) return;
      var selections = [];
      promo.slots.forEach(function (slot, i) {
        slot.options.forEach(function (opt) {
          var n = counts[i][optKey(opt)] || 0;
          if (n <= 0) return;
          var sel = { slot: i, label: slot.label, name: opt.name, qty: n, unit_price: Number(opt.price) || 0 };
          if (opt.type === 'item') sel.item_key = opt.key; else sel.product_id = opt.id;
          selections.push(sel);
        });
      });
      var calc = window.promoCompute(promo, counts);
      var detail = window.promoDetailText(selections) + (calc.pct > 0 ? ' | Descuento ' + calc.pct + '%' : '');
      var item = {
        id: 'promo-' + promo.id + '-' + window.promoSignature(selections),
        promo_id: promo.id,
        name: promo.name,
        price: calc.total,
        qty: 1,
        selections: selections,
        detail: detail
      };
      close();
      onAdd(item);
    };

    render();
  };
})();
