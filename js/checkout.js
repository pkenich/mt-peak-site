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

  /* Approx country centroids [lat, lon] — used only to *bias* Photon's
     global ranking toward the buyer's country. Unknown/blank country → no
     bias, so results stay worldwide. Not an allow-list; just a nudge. */
  const COUNTRY_BIAS = {
    'united kingdom': [54, -2.5], uk: [54, -2.5], gb: [54, -2.5], england: [52.5, -1.5],
    scotland: [56.8, -4], wales: [52.3, -3.8], 'northern ireland': [54.6, -6.7],
    'united states': [39.8, -98.6], usa: [39.8, -98.6], us: [39.8, -98.6], america: [39.8, -98.6],
    canada: [56.1, -106.3], ca: [56.1, -106.3],
    australia: [-25.3, 133.8], au: [-25.3, 133.8], 'new zealand': [-41.5, 172.8], nz: [-41.5, 172.8],
    ireland: [53.4, -8], ie: [53.4, -8],
    france: [46.6, 2.2], fr: [46.6, 2.2], germany: [51.2, 10.4], de: [51.2, 10.4], deutschland: [51.2, 10.4],
    spain: [40.2, -3.6], es: [40.2, -3.6], españa: [40.2, -3.6], italy: [42.8, 12.6], it: [42.8, 12.6],
    netherlands: [52.1, 5.3], nl: [52.1, 5.3], belgium: [50.6, 4.7], be: [50.6, 4.7],
    switzerland: [46.8, 8.2], ch: [46.8, 8.2], austria: [47.6, 14.1], at: [47.6, 14.1],
    portugal: [39.6, -8], pt: [39.6, -8], sweden: [62.2, 15.3], se: [62.2, 15.3],
    norway: [64.6, 12.6], no: [64.6, 12.6], denmark: [56, 9.5], dk: [56, 9.5], finland: [64.5, 26], fi: [64.5, 26],
    poland: [52, 19.1], pl: [52, 19.1], india: [22.4, 79.6], in: [22.4, 79.6],
    nepal: [28.3, 84], np: [28.3, 84], japan: [36.2, 138.3], jp: [36.2, 138.3],
    china: [35.9, 104.2], cn: [35.9, 104.2], singapore: [1.35, 103.8], sg: [1.35, 103.8],
    'hong kong': [22.3, 114.2], hk: [22.3, 114.2], uae: [23.9, 54], 'united arab emirates': [23.9, 54],
    'south africa': [-30.6, 22.9], za: [-30.6, 22.9], brazil: [-14.2, -51.9], br: [-14.2, -51.9],
    mexico: [23.6, -102.5], mx: [23.6, -102.5],
  };
  const countryBias = (prefix) => COUNTRY_BIAS[$(`#${prefix}Country`).value.trim().toLowerCase()] || null;

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
        const country = $(`#${prefix}Country`).value.trim();
        const countryLc = country.toLowerCase();
        // context (city + country) sharpens Photon's worldwide ranking
        const q = [qy, city, country].filter(Boolean).join(', ');
        let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=12&lang=en`;
        const bias = countryBias(prefix); // nudge toward the buyer's country; absent → global
        if (bias) url += `&lat=${bias[0]}&lon=${bias[1]}`;
        const res = await fetch(url, { signal });
        if (!res.ok) return [];
        const data = await res.json();
        const seen = new Set();
        return (data.features || [])
          .map(f => f.properties)
          .filter(p => p.street || p.name)
          .map(p => ({
            line1: [p.housenumber, p.street || p.name].filter(Boolean).join(' '),
            city: p.city || p.town || p.village || p.district || p.county || '',
            postcode: p.postcode || '', country: p.country || '',
            hasNum: !!p.housenumber,
            // does the result's country match what the buyer typed?
            match: countryLc && (p.country || '').toLowerCase().includes(countryLc) ? 1
                 : countryLc && p.countrycode && countryLc.startsWith(p.countrycode.toLowerCase()) ? 1 : 0,
          }))
          .filter(r => { const k = `${r.line1}|${r.city}|${r.postcode}`; if (seen.has(k)) return false; seen.add(k); return true; })
          // country match first, then street-with-number, then the rest
          .sort((a, b) => (b.match - a.match) || (b.hasNum - a.hasNum))
          .slice(0, 7)
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
