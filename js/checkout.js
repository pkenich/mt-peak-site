/* MT. PEAK — checkout page: addresses (with UK-aware autocomplete), promo
   preview, live cart sync, place order. Reads the shared cart from
   localStorage (same store cart.js uses). */
(() => {
  const $ = s => document.querySelector(s);
  const msg = $('#formMsg');
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const gbp = p => '£' + (p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, '');

  const loadCart = () => { try { return JSON.parse(localStorage.getItem('mtpeak_cart_v2')) || []; } catch { return []; } };
  let items = loadCart();
  let subtotal = 0;
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

  function renderTotals() {
    const discount = promo ? promo.discountPence : 0;
    $('#coSubtotal').textContent = gbp(subtotal);
    $('#coDiscountRow').hidden = !discount;
    if (discount) $('#coDiscount').textContent = '−' + gbp(discount);
    $('#coTotal').textContent = gbp(subtotal - discount);
  }

  function renderItems() {
    items = loadCart();
    if (!items.length) { $('#coGrid').hidden = true; $('#coEmpty').hidden = false; return; }
    subtotal = items.reduce((s, i) => s + i.p * i.q, 0) * 100;
    $('#coItems').innerHTML = items.map(i =>
      `<div class="co-line"><div class="nm">${esc(i.n)}<small>Quantity · ${Number(i.q) || 1}</small></div>
       <div class="pr">${gbp(i.p * i.q * 100)}</div></div>`).join('');
    renderTotals();
  }
  renderItems();

  // cart edited from the slide-out panel while on this page → resync,
  // and re-price the promo against the new subtotal
  window.addEventListener('mtpeak:cart', () => {
    renderItems();
    if (promo && items.length) applyPromo(true);
  });

  /* billing same-as toggle */
  const billFields = $('#billFields');
  $('#billSame').addEventListener('change', (e) => {
    billFields.hidden = e.target.checked;
    for (const inp of billFields.querySelectorAll('input')) inp.required = !e.target.checked && inp.id !== 'biLine2';
  });

  /* promo preview */
  const note = $('#promoNote');
  async function applyPromo(silent) {
    const code = $('#promoInput').value.trim();
    if (!silent) note.className = 'co-promo-note';
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
  $('#promoApply').addEventListener('click', () => applyPromo(false));
  $('#promoInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(false); } });

  /* ============ address autocomplete ============
     Two sources, one dropdown widget:
     - street fields → Photon (OSM) with UK bounding box + centre bias when
       the country reads as UK; city/postcode context is appended to the
       query; results with house numbers rank first.
     - postcode fields → postcodes.io (official ONS data): suggests real
       postcodes, then fills the city from the lookup.
     Everything fails silent — typing by hand always works. */

  const UK_RE = /^(uk|gb|united kingdom|great britain|england|scotland|wales|northern ireland)$/i;
  const isUK = (prefix) => UK_RE.test($(`#${prefix}Country`).value.trim());

  function dropdown(input, list, { fetcher, onPick }) {
    let timer, results = [], sel = -1, aborter;
    const hide = () => { list.hidden = true; sel = -1; };
    const render = () => {
      if (!results.length) { hide(); return; }
      list.innerHTML = results.map((r, i) =>
        `<div class="ac-item${i === sel ? ' sel' : ''}" data-i="${i}">${esc(r.main)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</div>`).join('');
      list.hidden = false;
      for (const el of list.querySelectorAll('.ac-item')) {
        el.addEventListener('mousedown', (e) => { e.preventDefault(); onPick(results[+el.dataset.i]); hide(); });
      }
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const qy = input.value.trim();
      if (qy.length < 2) { hide(); return; }
      timer = setTimeout(async () => {
        try {
          aborter?.abort();
          aborter = new AbortController();
          results = await fetcher(qy, aborter.signal) || [];
          sel = -1;
          render();
        } catch { /* silent */ }
      }, 250);
    });
    input.addEventListener('keydown', (e) => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      else if (e.key === 'Enter') { if (sel >= 0) { e.preventDefault(); onPick(results[sel]); hide(); } }
      else if (e.key === 'Escape') hide();
    });
    input.addEventListener('blur', () => setTimeout(hide, 150));
  }

  function streetAutocomplete(prefix) {
    const input = $(`#${prefix}Line1`);
    dropdown(input, $(`#${prefix}Line1Ac`), {
      fetcher: async (qy, signal) => {
        const city = $(`#${prefix}City`).value.trim();
        const pc = $(`#${prefix}Postcode`).value.trim();
        const q = [qy, city, pc].filter(Boolean).join(', ');
        let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=54.2&lon=-2.5`;
        if (isUK(prefix)) url += '&bbox=-8.65,49.8,1.78,60.9';
        const res = await fetch(url, { signal });
        if (!res.ok) return [];
        const data = await res.json();
        const seen = new Set();
        return (data.features || [])
          .map(f => f.properties)
          .filter(p => p.street || p.name)
          .map(p => ({
            line1: [p.housenumber, p.street || p.name].filter(Boolean).join(' '),
            city: p.city || p.town || p.village || p.district || '',
            postcode: p.postcode || '', country: p.country || '',
            hasNum: !!p.housenumber,
          }))
          .filter(r => { const k = `${r.line1}|${r.city}|${r.postcode}`; if (seen.has(k)) return false; seen.add(k); return true; })
          .sort((a, b) => (b.hasNum - a.hasNum))
          .slice(0, 6)
          .map(r => ({ ...r, main: r.line1, sub: [r.city, r.postcode, r.country].filter(Boolean).join(', ') }));
      },
      onPick: (r) => {
        input.value = r.line1;
        if (r.city) $(`#${prefix}City`).value = r.city;
        if (r.postcode) $(`#${prefix}Postcode`).value = r.postcode;
        if (r.country) $(`#${prefix}Country`).value = r.country;
      },
    });
  }

  function postcodeAutocomplete(prefix) {
    const input = $(`#${prefix}Postcode`);
    dropdown(input, $(`#${prefix}PostcodeAc`), {
      fetcher: async (qy, signal) => {
        if (!isUK(prefix)) return [];
        const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(qy)}/autocomplete`, { signal });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.result || []).slice(0, 6).map(pc => ({ main: pc }));
      },
      onPick: async (r) => {
        input.value = r.main;
        try {
          const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(r.main)}`);
          if (!res.ok) return;
          const { result } = await res.json();
          const cityEl = $(`#${prefix}City`);
          if (!cityEl.value && result.admin_district) cityEl.value = result.admin_district;
          $(`#${prefix}Country`).value = 'United Kingdom';
        } catch { /* silent */ }
      },
    });
  }

  for (const prefix of ['sh', 'bi']) { streetAutocomplete(prefix); postcodeAutocomplete(prefix); }

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
      items = loadCart();
      if (!items.length) throw new Error('Your reserve is empty.');
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
