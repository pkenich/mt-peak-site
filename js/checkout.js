/* MT. PEAK — checkout page: addresses, promo preview, place order.
   Reads the shared cart from localStorage (same store cart.js uses). */
(() => {
  const $ = s => document.querySelector(s);
  const msg = $('#formMsg');
  const items = (() => { try { return JSON.parse(localStorage.getItem('mtpeak_cart_v2')) || []; } catch { return []; } })();
  let promo = null; // { code, discountPence }

  if (!items.length) {
    $('#coGrid').hidden = true;
    $('#coEmpty').hidden = false;
    return;
  }

  // must be signed in to check out
  fetch('/api/auth/me').then(r => r.json()).then(({ user }) => {
    if (!user) location.replace('/login?next=checkout');
    else if (!$('#shName').value) $('#shName').value = user.name || '';
  }).catch(() => {});

  const gbp = p => '£' + (p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, '');
  const subtotal = items.reduce((s, i) => s + i.p * i.q, 0) * 100;

  function renderTotals() {
    const discount = promo ? promo.discountPence : 0;
    $('#coSubtotal').textContent = gbp(subtotal);
    $('#coDiscountRow').hidden = !discount;
    if (discount) $('#coDiscount').textContent = '−' + gbp(discount);
    $('#coTotal').textContent = gbp(subtotal - discount);
  }
  $('#coItems').innerHTML = items.map(i =>
    `<div class="co-line"><div class="nm">${i.n}<small>Quantity · ${i.q}</small></div>
     <div class="pr">${gbp(i.p * i.q * 100)}</div></div>`).join('');
  renderTotals();

  /* billing same-as toggle */
  const billFields = $('#billFields');
  $('#billSame').addEventListener('change', (e) => {
    billFields.hidden = e.target.checked;
    for (const inp of billFields.querySelectorAll('input')) inp.required = !e.target.checked && inp.id !== 'biLine2';
  });

  /* promo preview */
  const note = $('#promoNote');
  async function applyPromo() {
    const code = $('#promoInput').value.trim();
    note.className = 'co-promo-note';
    if (!code) { promo = null; note.textContent = ''; renderTotals(); return; }
    try {
      const res = await fetch('/api/promo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotalPence: subtotal }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not check that code.');
      promo = { code: data.code, discountPence: data.discountPence };
      note.textContent = `${data.code} applied — ${data.description}`;
      note.className = 'co-promo-note ok';
    } catch (e) {
      promo = null;
      note.textContent = e.message;
      note.className = 'co-promo-note err';
    }
    renderTotals();
  }
  $('#promoApply').addEventListener('click', applyPromo);
  $('#promoInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } });

  /* address autocomplete (Photon/OpenStreetMap — free, no key).
     Silent no-op if the service is unreachable; typing normally always works. */
  function attachAutocomplete(inputId, prefix) {
    const input = $(`#${inputId}`);
    const list = $(`#${inputId}Ac`);
    let timer, results = [], sel = -1, aborter;
    const hide = () => { list.hidden = true; sel = -1; };

    function fill(r) {
      const p = r.properties;
      input.value = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
      const city = p.city || p.town || p.village || p.district || '';
      if (city) $(`#${prefix}City`).value = city;
      if (p.postcode) $(`#${prefix}Postcode`).value = p.postcode;
      if (p.country) $(`#${prefix}Country`).value = p.country;
      hide();
    }

    function render() {
      if (!results.length) { hide(); return; }
      list.innerHTML = results.map((r, i) => {
        const p = r.properties;
        const line = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
        const rest = [p.city || p.town || p.village, p.postcode, p.country].filter(Boolean).join(', ');
        return `<div class="ac-item${i === sel ? ' sel' : ''}" data-i="${i}">${line}<small>${rest}</small></div>`;
      }).join('');
      list.hidden = false;
      for (const el of list.querySelectorAll('.ac-item')) {
        el.addEventListener('mousedown', (e) => { e.preventDefault(); fill(results[+el.dataset.i]); });
      }
    }

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const qy = input.value.trim();
      if (qy.length < 3) { hide(); return; }
      timer = setTimeout(async () => {
        try {
          aborter?.abort();
          aborter = new AbortController();
          const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(qy)}&limit=5&lang=en`,
            { signal: aborter.signal });
          if (!res.ok) return;
          const data = await res.json();
          results = (data.features || []).filter(f => f.properties?.street || f.properties?.name);
          sel = -1;
          render();
        } catch { /* offline or blocked — plain typing still works */ }
      }, 280);
    });
    input.addEventListener('keydown', (e) => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); fill(results[sel]); }
      else if (e.key === 'Escape') hide();
    });
    input.addEventListener('blur', () => setTimeout(hide, 150));
  }
  attachAutocomplete('shLine1', 'sh');
  attachAutocomplete('biLine1', 'bi');

  /* place order */
  const addr = (p) => ({
    name: $(`#${p}Name`).value, line1: $(`#${p}Line1`).value, line2: $(`#${p}Line2`).value,
    city: $(`#${p}City`).value, postcode: $(`#${p}Postcode`).value, country: $(`#${p}Country`).value,
  });

  $('#coForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#coPlace');
    btn.disabled = true; btn.textContent = 'Placing your order…';
    msg.className = 'form-msg';
    try {
      const same = $('#billSame').checked;
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({ slug: i.s, q: i.q })),
          shipping: addr('sh'),
          billingSameAsShipping: same,
          ...(same ? {} : { billing: addr('bi') }),
          ...(promo ? { promo: promo.code } : {}),
          giftNote: $('#giftNote').value.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = '/login?next=checkout'; return; }
      if (!res.ok) throw new Error(data.error || 'Checkout failed — please try again.');
      localStorage.removeItem('mtpeak_cart_v2');
      if (data.mode === 'stripe' && data.url) { location.href = data.url; return; }
      location.href = `/account?placed=${encodeURIComponent(data.orderId)}`;
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'form-msg err';
      btn.disabled = false; btn.textContent = 'Place order';
      scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
})();
