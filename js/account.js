/* MT. PEAK — customer dashboard: overview, filterable orders with reorder /
   rate / refund, saved address book, and profile management. */
(() => {
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const gbp = p => '£' + (p / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 });
  const fmtDate = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const STATUS_LABEL = { reserved: 'Reserved', pending_payment: 'Awaiting payment', paid: 'Paid', fulfilled: 'Shipped', cancelled: 'Cancelled' };
  const REFUND_LABEL = { requested: 'Refund requested', approved: 'Refund approved', denied: 'Refund declined' };

  let ORDERS = [];
  let user = null;

  const api = async (url, opts = {}) => {
    const res = await fetch(url, opts.body ? { headers: { 'Content-Type': 'application/json' }, ...opts } : opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };

  const msg = (text, cls) => { const m = $('#accountMsg'); m.innerHTML = text; m.className = `form-msg ${cls}`;
    if (text) setTimeout(() => { if (m.innerHTML === text) { m.innerHTML = ''; m.className = 'form-msg'; } }, 6000); };

  /* ---------- boot ---------- */
  async function boot() {
    const me = await fetch('/api/auth/me').then(r => r.json()).catch(() => ({}));
    if (!me.user) { location.replace('/login'); return; }
    user = me.user;
    $('#accountTitle').textContent = `Welcome, ${(user.name || '').split(' ')[0] || 'friend'}`;

    // returning from Stripe / placing an order
    const sessionId = params.get('session_id');
    if (sessionId) {
      msg('Confirming your payment…', 'ok');
      await fetch('/api/stripe/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) }).catch(() => {});
      history.replaceState(null, '', '/account');
      msg('Thank you — your order is confirmed.', 'ok');
    } else if (params.get('placed')) {
      msg(`Your reserve is placed — order <strong>${esc(params.get('placed'))}</strong>. We’ll email you as it progresses.`, 'ok');
      history.replaceState(null, '', '/account');
    } else if (params.get('cancelled')) {
      msg('Checkout was cancelled — your order is saved and can be paid any time.', 'err');
      history.replaceState(null, '', '/account');
    }

    await loadOrders();
    if (params.get('tab')) switchTab(params.get('tab'));
  }

  /* ---------- tabs ---------- */
  function switchTab(name) {
    for (const b of document.querySelectorAll('.dash-tab')) b.classList.toggle('active', b.dataset.tab === name);
    for (const p of document.querySelectorAll('.dash-panel')) p.hidden = p.id !== `tab-${name}`;
    if (name === 'addresses') loadAddresses();
    if (name === 'profile') { $('#pfName').value = user.name || ''; $('#pfEmail').value = user.email || ''; }
  }
  for (const b of document.querySelectorAll('.dash-tab')) b.addEventListener('click', () => switchTab(b.dataset.tab));

  /* ---------- orders ---------- */
  async function loadOrders() {
    try {
      const { orders } = await api('/api/orders');
      ORDERS = orders;
      renderOverview();
      populateProductFilter();
      renderOrders();
    } catch {
      $('#ordersList').innerHTML = '<div class="empty-state">Couldn’t load orders — please refresh.</div>';
    }
  }

  function renderOverview() {
    const paid = ORDERS.filter(o => ['paid', 'fulfilled'].includes(o.status));
    const spent = paid.reduce((s, o) => s + o.total_pence, 0)
      + ORDERS.filter(o => o.status === 'reserved').reduce((s, o) => s + o.total_pence, 0);
    const teas = new Set();
    for (const o of ORDERS) for (const l of o.items) teas.add(l.name);
    const rated = ORDERS.filter(o => o.rating);
    const avg = rated.length ? (rated.reduce((s, o) => s + o.rating, 0) / rated.length).toFixed(1) : '—';
    const since = ORDERS.length ? fmtDate(ORDERS[ORDERS.length - 1].created_at) : '—';
    $('#ovStats').innerHTML = [
      [ORDERS.length, 'Orders placed'],
      [gbp(spent), 'Total with us'],
      [teas.size, 'Teas tasted'],
      [avg, 'Avg. rating given'],
      [since, 'Member since'],
    ].map(([v, l]) => `<div class="stat"><div class="sv">${esc(v)}</div><div class="sl">${l}</div></div>`).join('');
    $('#ovBlurb').textContent = ORDERS.length
      ? 'Reorder a favourite, rate a recent cup, or explore something new from the reserve.'
      : 'Your collection starts here. Explore the reserve and place your first order.';
  }

  function populateProductFilter() {
    const teas = new Set();
    for (const o of ORDERS) for (const l of o.items) teas.add(l.name);
    const sel = $('#fProduct');
    sel.innerHTML = '<option value="">All teas</option>' + [...teas].sort().map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  }

  function filtered() {
    const st = $('#fStatus').value, days = Number($('#fTime').value), prod = $('#fProduct').value, sort = $('#fSort').value;
    const cutoff = days ? Date.now() - days * 86400000 : 0;
    let list = ORDERS.filter(o =>
      (!st || o.status === st) &&
      (!cutoff || new Date(o.created_at).getTime() >= cutoff) &&
      (!prod || o.items.some(l => l.name === prod)));
    if (sort === 'old') list = [...list].reverse();
    else if (sort === 'high') list = [...list].sort((a, b) => b.total_pence - a.total_pence);
    return list;
  }

  const stars = (n, active) => Array.from({ length: 5 }, (_, i) =>
    `<span class="star${i < n ? ' on' : ''}${active ? ' act' : ''}" data-v="${i + 1}">★</span>`).join('');

  function orderCard(o) {
    const canRate = ['paid', 'fulfilled', 'reserved'].includes(o.status);
    const canRefund = !['cancelled'].includes(o.status) && o.refund_status !== 'requested';
    return `<div class="ord" data-id="${esc(o.public_id)}">
      <div class="ord-top">
        <div>
          <div class="oid">${esc(o.public_id)}</div>
          <div class="odate">${fmtDate(o.created_at)}</div>
        </div>
        <div class="ord-items">${o.items.map(l => `${esc(l.name)} <span class="mul">× ${esc(l.qty)}</span>`).join('<br>')}</div>
        <div class="ord-total">${gbp(o.total_pence)}${o.discount_pence ? `<div class="odate">promo −${gbp(o.discount_pence)}</div>` : ''}</div>
        <div class="ord-status">
          <span class="status ${o.status}">${STATUS_LABEL[o.status] || o.status}</span>
          ${o.refund_status ? `<span class="status refund-${o.refund_status}">${REFUND_LABEL[o.refund_status] || o.refund_status}</span>` : ''}
          ${o.rating ? `<div class="mini-stars">${stars(o.rating, false)}</div>` : ''}
        </div>
      </div>
      <div class="ord-actions">
        <button class="link-btn" data-act="detail">Details</button>
        <button class="link-btn" data-act="reorder">Reorder</button>
        ${canRate ? `<button class="link-btn" data-act="rate">${o.rating ? 'Edit rating' : 'Rate this order'}</button>` : ''}
        ${canRefund ? `<button class="link-btn" data-act="refund">Request refund</button>` : ''}
      </div>
      <div class="ord-panel" data-panel="detail" hidden>
        <div><span class="odk">Delivered to</span>${o.shipping ? esc([o.shipping.name, o.shipping.line1, o.shipping.line2, o.shipping.city, o.shipping.postcode, o.shipping.country].filter(Boolean).join(', ')) : '—'}</div>
        ${o.gift_note ? `<div><span class="odk">Gift message</span><em>${esc(o.gift_note)}</em></div>` : ''}
        ${o.review_body ? `<div><span class="odk">Your note</span><em>${esc(o.review_body)}</em></div>` : ''}
      </div>
      <div class="ord-panel" data-panel="rate" hidden>
        <div class="rate-row"><span class="rl">The tea</span><div class="star-input" data-field="rating">${stars(o.rating || 0, true)}</div></div>
        <div class="rate-row"><span class="rl">The delivery</span><div class="star-input" data-field="ship">${stars(o.shipping_rating || 0, true)}</div></div>
        <textarea class="rate-note" maxlength="1000" placeholder="A few words on the cup (optional)…">${esc(o.review_body || '')}</textarea>
        <button class="btn-gold inline" data-act="rate-submit">Submit rating</button>
      </div>
      <div class="ord-panel" data-panel="refund" hidden>
        <p class="admin-note">Tell us what went wrong and we’ll review within two working days.</p>
        <textarea class="refund-note" maxlength="1000" placeholder="Reason for your refund request…"></textarea>
        <button class="btn-gold inline" data-act="refund-submit">Send refund request</button>
      </div>
    </div>`;
  }

  function renderOrders() {
    const list = filtered();
    const wrap = $('#ordersList');
    if (!ORDERS.length) {
      wrap.innerHTML = '<div class="empty-state">No orders yet — the mountain awaits. <a class="text-link" href="/#collection">Explore the Reserve</a></div>';
      return;
    }
    if (!list.length) { wrap.innerHTML = '<div class="empty-state">No orders match those filters.</div>'; return; }
    wrap.innerHTML = list.map(orderCard).join('');
    for (const card of wrap.querySelectorAll('.ord')) wireCard(card);
  }

  for (const id of ['fStatus', 'fTime', 'fProduct', 'fSort']) $(`#${id}`).addEventListener('change', renderOrders);

  function wireCard(card) {
    const id = card.dataset.id;
    const panel = name => card.querySelector(`.ord-panel[data-panel="${name}"]`);
    const togglePanel = name => { const p = panel(name); const open = !p.hidden;
      card.querySelectorAll('.ord-panel').forEach(x => x.hidden = true); p.hidden = open; };

    card.querySelector('[data-act="detail"]').addEventListener('click', () => togglePanel('detail'));

    card.querySelector('[data-act="reorder"]').addEventListener('click', async () => {
      try {
        const { items } = await api('/api/account/reorder', { method: 'POST', body: JSON.stringify({ orderId: id }) });
        for (const l of items) addToCart(l.slug, l.name, l.unitPence / 100, l.qty);
        msg('Added to your reserve — review it in the cart.', 'ok');
      } catch (e) { msg(e.message, 'err'); }
    });

    const rateBtn = card.querySelector('[data-act="rate"]');
    if (rateBtn) rateBtn.addEventListener('click', () => togglePanel('rate'));
    const refundBtn = card.querySelector('[data-act="refund"]');
    if (refundBtn) refundBtn.addEventListener('click', () => togglePanel('refund'));

    // star inputs
    for (const si of card.querySelectorAll('.star-input')) {
      const set = v => { si.dataset.value = v; si.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('on', i < v)); };
      si.querySelectorAll('.star').forEach(s => s.addEventListener('click', () => set(+s.dataset.v)));
      si.dataset.value = [...si.querySelectorAll('.star.on')].length;
    }

    const rateSubmit = card.querySelector('[data-act="rate-submit"]');
    if (rateSubmit) rateSubmit.addEventListener('click', async () => {
      const rating = +panel('rate').querySelector('.star-input[data-field="rating"]').dataset.value;
      const ship = +panel('rate').querySelector('.star-input[data-field="ship"]').dataset.value;
      const body = panel('rate').querySelector('.rate-note').value.trim();
      if (!rating) { msg('Give the tea a rating first.', 'err'); return; }
      try {
        await api('/api/account/review', { method: 'POST', body: JSON.stringify({ orderId: id, rating, shippingRating: ship || null, body }) });
        msg('Thank you for rating your order.', 'ok');
        loadOrders();
      } catch (e) { msg(e.message, 'err'); }
    });

    const refundSubmit = card.querySelector('[data-act="refund-submit"]');
    if (refundSubmit) refundSubmit.addEventListener('click', async () => {
      const reason = panel('refund').querySelector('.refund-note').value.trim();
      try {
        await api('/api/account/refund', { method: 'POST', body: JSON.stringify({ orderId: id, reason }) });
        msg('Refund request received — we’ll be in touch by email.', 'ok');
        loadOrders();
      } catch (e) { msg(e.message, 'err'); }
    });
  }

  /* ---------- addresses ---------- */
  let ADDR = [];
  async function loadAddresses() {
    if ($('#addrList').dataset.loaded) return;
    try {
      const { addresses } = await api('/api/account/addresses');
      ADDR = addresses;
      $('#addrList').dataset.loaded = '1';
      renderAddresses();
    } catch (e) { $('#addrList').innerHTML = `<p class="admin-note">${esc(e.message)}</p>`; }
  }
  const F = [['label', 'Label (e.g. Home)'], ['name', 'Full name'], ['line1', 'Street address'], ['line2', 'Apartment, etc. (optional)'], ['city', 'City'], ['postcode', 'Postcode'], ['country', 'Country']];
  function renderAddresses() {
    $('#addrList').innerHTML = ADDR.length ? ADDR.map((a, i) => `
      <div class="addr-card" data-i="${i}">
        <button class="addr-del" data-i="${i}" title="Remove">✕</button>
        <div class="admin-grid">
          ${F.map(([k, label]) => `<div class="field${k === 'line1' || k === 'line2' || k === 'country' ? ' wide' : ''}">
            <label>${label}</label><input data-k="${k}" value="${esc(a[k] || '')}" maxlength="120"></div>`).join('')}
        </div>
      </div>`).join('') : '<p class="admin-note">No saved addresses yet.</p>';
    for (const b of $('#addrList').querySelectorAll('.addr-del'))
      b.addEventListener('click', () => { collectAddresses(); ADDR.splice(+b.dataset.i, 1); renderAddresses(); });
  }
  function collectAddresses() {
    ADDR = [...$('#addrList').querySelectorAll('.addr-card')].map(card => {
      const o = {}; for (const inp of card.querySelectorAll('input')) o[inp.dataset.k] = inp.value; return o;
    });
  }
  $('#addrAdd').addEventListener('click', () => { collectAddresses(); ADDR.push({ label: '', name: user.name || '', line1: '', line2: '', city: '', postcode: '', country: 'United Kingdom' }); renderAddresses(); });
  $('#addrSave').addEventListener('click', async () => {
    collectAddresses();
    try {
      const { addresses } = await api('/api/account/addresses', { method: 'PUT', body: JSON.stringify({ addresses: ADDR }) });
      ADDR = addresses; renderAddresses(); msg('Address book saved.', 'ok');
    } catch (e) { msg(e.message, 'err'); }
  });

  /* ---------- profile ---------- */
  $('#profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pm = $('#profMsg'); pm.className = 'form-msg';
    try {
      const body = { name: $('#pfName').value };
      if ($('#pfNew').value) { body.currentPassword = $('#pfCur').value; body.newPassword = $('#pfNew').value; }
      const { name } = await api('/api/account/profile', { method: 'PUT', body: JSON.stringify(body) });
      user.name = name;
      $('#accountTitle').textContent = `Welcome, ${(name || '').split(' ')[0]}`;
      $('#pfCur').value = ''; $('#pfNew').value = '';
      pm.textContent = 'Your details are saved.'; pm.className = 'form-msg ok';
    } catch (err) { pm.textContent = err.message; pm.className = 'form-msg err'; }
  });

  $('#btnLogout').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    location.href = '/';
  });

  boot();
})();
