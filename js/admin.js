/* MT. PEAK admin dashboard: tabbed back office. Content edits commit to
   content/*.json via /api/admin/content (each save is a git commit); images
   upload via /api/admin/upload. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const gate = $('#adminGate'), panel = $('#adminPanel'), banner = $('#saveBanner');
  let products = null, site = null, currentSlug = null;
  let ORDERS = [], SUBSCRIBERS = { count: 0, emails: [] };

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const gbp = pence => '£' + (pence / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 });
  const STARS = n => n ? '★★★★★☆☆☆☆☆'.slice(5 - Math.round(n), 10 - Math.round(n)) : '—';
  const STATUS_LABEL = { reserved: 'Reserved', pending_payment: 'Awaiting payment', paid: 'Paid', fulfilled: 'Shipped', cancelled: 'Cancelled' };

  const api = async (url, opts = {}) => {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };

  let bannerTimer;
  const notify = (msg, isErr = false) => {
    banner.textContent = msg; banner.classList.toggle('err', isErr); banner.classList.add('show');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => banner.classList.remove('show'), 5000);
  };

  /* ---------- auth gate ---------- */
  async function boot() {
    try { const { admin } = await api('/api/admin/me'); admin ? await openPanel() : showGate(); }
    catch { showGate(); }
  }
  function showGate() { gate.hidden = false; panel.hidden = true; $('#btnAdminLogout').hidden = true; }

  $('#gateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#gateMsg'); msg.className = 'form-msg';
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#adPass').value }) });
      $('#adPass').value = ''; await openPanel();
    } catch (err) { msg.textContent = err.message; msg.className = 'form-msg err'; }
  });
  $('#btnAdminLogout').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {}); showGate();
  });

  /* ---------- tab navigation ---------- */
  function switchView(name) {
    for (const b of document.querySelectorAll('.admin-navtab')) b.classList.toggle('active', b.dataset.view === name);
    for (const v of document.querySelectorAll('.admin-view')) v.hidden = v.id !== `view-${name}`;
  }
  for (const b of document.querySelectorAll('.admin-navtab')) b.addEventListener('click', () => switchView(b.dataset.view));

  async function openPanel() {
    const [p, s] = await Promise.all([api('/api/admin/content?file=products'), api('/api/admin/content?file=site')]);
    products = p.data; site = s.data;
    gate.hidden = true; panel.hidden = false; $('#btnAdminLogout').hidden = false;
    renderProductTabs();
    selectProduct(Object.keys(products)[0]);
    fillSiteForm();
    loadDashboard();
    loadPromos();
  }

  /* ---------- dashboard data (overview + orders + marketing) ---------- */
  async function loadDashboard() {
    try {
      const d = await api('/api/admin/orders');
      ORDERS = d.orders; SUBSCRIBERS = d.subscribers;
      const s = d.stats, aov = s.paid_orders ? Math.round(s.revenue_pence / s.paid_orders) : 0;
      $('#statRow').innerHTML = [
        [gbp(s.revenue_pence), 'Revenue (paid)'],
        [gbp(s.revenue_7d_pence), 'Last 7 days'],
        [gbp(aov), 'Avg order value'],
        [gbp(s.awaiting_pence), 'Awaiting payment'],
        [s.orders, 'Orders'],
        [s.customers, 'Customers'],
        [d.ratings && d.ratings.n ? `${d.ratings.avg_rating}★` : '—', d.ratings && d.ratings.n ? `Rating (${d.ratings.n})` : 'No ratings'],
      ].map(([v, l]) => `<div class="stat"><div class="sv">${esc(v)}</div><div class="sl">${l}</div></div>`).join('');

      $('#salesViz').innerHTML = revenueChart(d.daily) + productBars(d.products);
      wireChart();
      renderRefunds(d.refunds || []);
      renderOrdersTable();

      // marketing
      $('#mktStats').innerHTML = `<div class="stat"><div class="sv">${SUBSCRIBERS.count}</div><div class="sl">Subscribers</div></div>`;
      renderWaitlist(d.stockNotify || []);
    } catch (err) { $('#statRow').innerHTML = `<div class="admin-note">${esc(err.message)}</div>`; }
  }

  /* ---------- overview: chart ---------- */
  function revenueChart(daily) {
    const days = [], byDay = Object.fromEntries(daily.map(d => [d.day, d]));
    for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days.push({ day: d, rev: (byDay[d]?.revenue_pence || 0), orders: (byDay[d]?.orders || 0) }); }
    const W = 640, H = 150, PAD = 6, BASE = H - 18, max = Math.max(...days.map(d => d.rev), 1), bw = (W - PAD * 2) / 30;
    const bars = days.map((d, i) => {
      const h = d.rev ? Math.max((d.rev / max) * (BASE - 14), 3) : 0, x = PAD + i * bw;
      const label = new Date(d.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return `<g class="cbar" data-tip="${label} — ${gbp(d.rev)} · ${d.orders} order${d.orders === 1 ? '' : 's'}">
        <rect x="${x}" y="0" width="${bw}" height="${BASE}" fill="transparent"></rect>
        ${d.rev ? `<rect class="vr" x="${(x + 1).toFixed(1)}" y="${(BASE - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="#c9a961"></rect>
        <rect class="vr" x="${(x + 1).toFixed(1)}" y="${(BASE - 2).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="2" fill="#c9a961"></rect>`
        : `<rect x="${(x + 1).toFixed(1)}" y="${BASE - 2}" width="${(bw - 2).toFixed(1)}" height="2" fill="rgba(201,169,97,.18)"></rect>`}</g>`;
    }).join('');
    const grid = [0.33, 0.66].map(f => `<line x1="${PAD}" x2="${W - PAD}" y1="${(BASE * f).toFixed(1)}" y2="${(BASE * f).toFixed(1)}" stroke="rgba(244,239,230,.07)" stroke-width="1"/>`).join('');
    const first = new Date(days[0].day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const last = new Date(days[29].day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `<div class="chart-title">Revenue — last 30 days <span>peak ${gbp(max === 1 ? 0 : max)}/day</span></div>
      <div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Daily revenue, last 30 days">
        ${grid}<line x1="${PAD}" x2="${W - PAD}" y1="${BASE}" y2="${BASE}" stroke="rgba(244,239,230,.15)" stroke-width="1"/>${bars}
      </svg><div class="chart-tip" id="chartTip" hidden></div>
      <div class="chart-x"><span>${first}</span><span>${last}</span></div></div>`;
  }
  function productBars(products) {
    if (!products.length) return '';
    const max = Math.max(...products.map(p => p.revenue_pence), 1);
    return `<div class="chart-title" style="margin-top:1.6rem;">Top teas — by paid revenue</div>` +
      products.map(p => `<div class="pbar-row"><div class="pbar-name">${esc(p.name)}</div>
        <div class="pbar-track"><div class="pbar-fill" style="width:${Math.max((p.revenue_pence / max) * 100, 2)}%"></div></div>
        <div class="pbar-val">${gbp(p.revenue_pence)} · ${p.qty}</div></div>`).join('');
  }
  function wireChart() {
    const tip = $('#chartTip'); if (!tip) return;
    for (const g of document.querySelectorAll('#salesViz .cbar')) {
      g.addEventListener('mouseenter', () => { tip.textContent = g.dataset.tip; tip.hidden = false;
        g.querySelectorAll('.vr').forEach(r => r.setAttribute('fill', '#e8cd8f')); });
      g.addEventListener('mousemove', (e) => { const wrap = tip.parentElement.getBoundingClientRect();
        tip.style.left = Math.min(e.clientX - wrap.left + 12, wrap.width - tip.offsetWidth - 4) + 'px';
        tip.style.top = (e.clientY - wrap.top - 34) + 'px'; });
      g.addEventListener('mouseleave', () => { tip.hidden = true;
        g.querySelectorAll('.vr').forEach(r => r.setAttribute('fill', '#c9a961')); });
    }
  }

  /* ---------- overview: refunds ---------- */
  function renderRefunds(refunds) {
    const wrap = $('#refundQueue'), open = refunds.filter(r => r.status === 'requested');
    if (!refunds.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `<h3 style="font-family:'Cormorant Garamond',serif;font-weight:400;font-size:1.3rem;color:var(--gold);margin:1.8rem 0 1rem;letter-spacing:1px;">Refund requests${open.length ? ` · ${open.length} open` : ''}</h3>` +
      refunds.map(r => `<div class="refund-row ${r.status}">
        <div><div class="oid">${esc(r.public_id)}</div><div class="odate">${new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${esc(r.email)}</div></div>
        <div class="rreason">${esc(r.reason)}</div>
        <div class="rtotal">${gbp(r.total_pence)}</div>
        <div class="ractions">
          ${r.status === 'requested'
            ? `<button class="btn-quiet" data-refund="${r.id}" data-decision="approved">Approve &amp; refund</button>
               <button class="btn-quiet danger" data-refund="${r.id}" data-decision="denied">Decline</button>`
            : `<span class="status refund-${r.status}">${r.status === 'approved' ? 'Approved · cancelled' : 'Declined'}</span>`}
        </div></div>`).join('');
    for (const b of wrap.querySelectorAll('button[data-refund]')) b.addEventListener('click', async () => {
      if (b.dataset.decision === 'approved' && !confirm('Approve this refund? The order will be cancelled and the customer emailed.')) return;
      try {
        await api('/api/admin/refund-resolve', { method: 'PUT', body: JSON.stringify({ id: +b.dataset.refund, decision: b.dataset.decision }) });
        notify('Refund ' + (b.dataset.decision === 'approved' ? 'approved — order cancelled.' : 'declined.'));
        loadDashboard();
      } catch (err) { notify(err.message, true); }
    });
  }

  /* ---------- orders view: filter + search + table ---------- */
  const fmtAddr = (a) => a ? [a.name, a.line1, a.line2, a.city, a.postcode, a.country].filter(Boolean).join(', ') : '—';
  function renderOrdersTable() {
    const st = $('#ordFilter').value, q = $('#ordSearch').value.trim().toLowerCase();
    const list = ORDERS.filter(o => (!st || o.status === st) &&
      (!q || o.public_id.toLowerCase().includes(q) || (o.email || '').toLowerCase().includes(q)));
    const wrap = $('#adminOrders');
    if (!ORDERS.length) { wrap.innerHTML = '<p class="admin-note">No orders yet — they’ll appear here the moment someone checks out.</p>'; return; }
    if (!list.length) { wrap.innerHTML = '<p class="admin-note">No orders match that filter.</p>'; return; }
    wrap.innerHTML = `<div class="orders">
      <div class="order-row head"><div>Order</div><div>Customer</div><div>Items</div><div>Total</div><div>Status</div></div>
      ${list.map((o, i) => `
      <div class="order-row" data-x="${i}" style="cursor:pointer;">
        <div><div class="oid">${esc(o.public_id)}</div><div class="odate">${new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div></div>
        <div class="oemail">${esc(o.email)}</div>
        <div class="oitems">${o.items.map(l => `${esc(l.name)} × ${esc(l.qty)}`).join('<br>')}</div>
        <div class="ototal">${gbp(o.total_pence)}${o.discount_pence ? `<div class="odate">−${gbp(o.discount_pence)} (${esc(o.promo_code || 'promo')})</div>` : ''}</div>
        <div><select data-order="${esc(o.public_id)}">
          ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}"${v === o.status ? ' selected' : ''}>${l}</option>`).join('')}
        </select></div>
      </div>
      <div class="order-detail" id="od-${i}" hidden>
        <div><span class="odk">Deliver to</span>${esc(fmtAddr(o.shipping))}</div>
        <div><span class="odk">Billing</span>${esc(fmtAddr(o.billing))}</div>
        ${o.gift_note ? `<div><span class="odk">Gift message</span><em>${esc(o.gift_note)}</em></div>` : ''}
        ${o.rating ? `<div><span class="odk">Tea rating</span>${STARS(o.rating)} (${o.rating}/5)${o.shipping_rating ? ` · delivery ${STARS(o.shipping_rating)} (${o.shipping_rating}/5)` : ''}</div>` : ''}
        ${o.review_body ? `<div><span class="odk">Review</span><em>${esc(o.review_body)}</em></div>` : ''}
      </div>`).join('')}</div>`;
    for (const row of wrap.querySelectorAll('.order-row[data-x]')) row.addEventListener('click', (e) => {
      if (e.target.closest('select')) return; const d = $(`#od-${row.dataset.x}`); d.hidden = !d.hidden;
    });
    for (const sel of wrap.querySelectorAll('select[data-order]')) sel.addEventListener('change', async () => {
      try {
        await api('/api/admin/order-status', { method: 'PUT', body: JSON.stringify({ publicId: sel.dataset.order, status: sel.value }) });
        notify(`${sel.dataset.order} → ${STATUS_LABEL[sel.value]}`); loadDashboard();
      } catch (err) { notify(err.message, true); }
    });
  }
  $('#ordFilter').addEventListener('change', renderOrdersTable);
  $('#ordSearch').addEventListener('input', renderOrdersTable);
  $('#csvBtn').addEventListener('click', () => {
    const cs = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['order', 'date', 'status', 'email', 'items', 'total_gbp', 'discount_gbp', 'promo', 'gift_note', 'ship_name', 'ship_line1', 'ship_line2', 'ship_city', 'ship_postcode', 'ship_country'];
    const rows = ORDERS.map(o => [o.public_id, new Date(o.created_at).toISOString(), o.status, o.email,
      o.items.map(l => `${l.name} x${l.qty}`).join('; '), (o.total_pence / 100).toFixed(2), ((o.discount_pence || 0) / 100).toFixed(2),
      o.promo_code || '', o.gift_note || '', ...(o.shipping ? [o.shipping.name, o.shipping.line1, o.shipping.line2, o.shipping.city, o.shipping.postcode, o.shipping.country] : ['', '', '', '', '', ''])].map(cs).join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[head.join(','), ...rows].join('\n')], { type: 'text/csv' }));
    a.download = `mtpeak-orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  });

  /* ---------- marketing ---------- */
  $('#copySubs').addEventListener('click', () => navigator.clipboard.writeText(SUBSCRIBERS.emails.join('\n'))
    .then(() => notify(`${SUBSCRIBERS.count} subscriber emails copied.`)).catch(() => notify('Copy failed.', true)));
  function renderWaitlist(list) {
    const wrap = $('#waitlist');
    if (!list.length) { wrap.innerHTML = '<p class="admin-note">No one waiting yet.</p>'; return; }
    wrap.innerHTML = list.map(w => {
      const name = products[w.slug]?.name || w.slug;
      return `<div class="wl-row"><div><div class="oid" style="font-size:1rem;">${esc(name)}</div><div class="odate">${w.n} waiting</div></div>
        <button class="btn-quiet" data-emails="${esc(w.emails.join(','))}">Copy ${w.n} email${w.n === 1 ? '' : 's'}</button></div>`;
    }).join('');
    for (const b of wrap.querySelectorAll('button[data-emails]')) b.addEventListener('click', () =>
      navigator.clipboard.writeText(b.dataset.emails.split(',').join('\n')).then(() => notify('Waitlist emails copied.')));
  }

  /* ---------- promo codes ---------- */
  async function loadPromos() {
    try {
      const { promos } = await api('/api/admin/promos');
      const list = $('#promoList');
      if (!promos.length) { list.innerHTML = '<p class="admin-note">No codes yet — create your first above.</p>'; return; }
      list.innerHTML = `<div class="promo-row head"><div>Code</div><div>Discount</div><div>Kind</div><div>Uses</div><div></div></div>` +
        promos.map(p => `<div class="promo-row${p.active ? '' : ' off'}">
          <div class="pcode">${esc(p.code)}</div>
          <div class="pmeta">${p.kind === 'percent' ? p.value + '% off' : gbp(p.value) + ' off'}</div>
          <div class="pmeta">${p.max_uses === null ? 'Universal' : p.max_uses === 1 ? 'Single-use' : `Issue of ${p.max_uses}`}</div>
          <div class="pmeta">${p.uses}${p.max_uses !== null ? ' / ' + p.max_uses : ''} used</div>
          <div><button class="btn-quiet" data-code="${esc(p.code)}" data-active="${p.active}">${p.active ? 'Deactivate' : 'Reactivate'}</button></div>
        </div>`).join('');
      for (const b of list.querySelectorAll('button[data-code]')) b.addEventListener('click', async () => {
        try { await api('/api/admin/promo-toggle', { method: 'PUT', body: JSON.stringify({ code: b.dataset.code, active: b.dataset.active !== 'true' }) }); loadPromos(); }
        catch (err) { notify(err.message, true); }
      });
    } catch (err) { $('#promoList').innerHTML = `<p class="admin-note">${esc(err.message)}</p>`; }
  }
  $('#pcCreate').addEventListener('click', async () => {
    try {
      const { code } = await api('/api/admin/promo-create', { method: 'POST', body: JSON.stringify({
        code: $('#pcCode').value.trim() || undefined, kind: $('#pcKind').value,
        value: Number($('#pcValue').value), maxUses: $('#pcUses').value.trim() === '' ? null : Number($('#pcUses').value) }) });
      $('#pcCode').value = ''; $('#pcValue').value = ''; $('#pcUses').value = '';
      notify(`Code ${code} created — it works at checkout immediately.`); loadPromos();
    } catch (err) { notify(err.message, true); }
  });

  /* ---------- products: tabs + create/delete ---------- */
  function renderProductTabs() {
    const tabs = $('#productTabs'); tabs.innerHTML = '';
    for (const slug of Object.keys(products)) {
      const b = document.createElement('button');
      b.className = 'admin-tab'; b.textContent = products[slug].name; b.dataset.slug = slug;
      b.onclick = () => selectProduct(slug); tabs.appendChild(b);
    }
    const add = document.createElement('button');
    add.className = 'admin-tab add'; add.textContent = '＋ New tea'; add.onclick = createProduct;
    tabs.appendChild(add);
  }

  function slugify(name, taken) {
    let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'tea';
    let slug = base, i = 2; while (taken.includes(slug)) slug = `${base}-${i++}`;
    return slug;
  }
  function newProductTemplate(name, num) {
    return {
      slug: '', num, name, title: `${name} — MT. PEAK · Himalayan Tea`, metaDesc: `${name} — single-origin Himalayan tea from eastern Nepal.`,
      tag: 'Tea', eyebrow: `№ ${num} · Single-Origin Tea`, tagline: 'Note · Note · Note',
      desc: 'Describe this tea for the product page.', homeDesc: 'A short line for the collection card.',
      notes: ['Note one', 'Note two', 'Note three'], price: 60,
      unitShort: '/ 100g caddy', unitLong: '/ 100g loose-leaf caddy', cartName: `${name} · 100g`,
      stock: 'In stock · ships within 2 working days', heroImage: '/assets/tea-tin.webp', heroAlt: name,
      gallery: [
        { type: 'img', src: '/assets/tea-tin.webp', alt: name, thumb: 'Caddy' },
        { type: 'ph', label: 'DRY LEAF — MACRO', sub: 'The dry leaf, shot like jewellery', thumb: 'Dry leaf<br>macro' },
        { type: 'ph', label: 'THE LIQUOR', sub: 'The brewed cup, backlit so the colour glows', thumb: 'Liquor<br>in glass' },
      ],
      meta: [{ k: 'Origin', v: 'Eastern Nepal · single garden' }, { k: 'Harvest', v: 'By hand' }, { k: 'Format', v: '100g loose leaf' }, { k: 'Delivery', v: 'Complimentary UK · gift wrap available' }],
      tastingH: 'A cup worth slowing for', tasting: [{ k: 'Aroma', v: '—' }, { k: 'Palate', v: '—' }, { k: 'Finish', v: '—' }],
      tasteFoot: [{ k: 'Cup Colour', v: '—' }, { k: 'Body', v: '—' }, { k: 'Oxidation', v: '—' }, { k: 'Caffeine', v: '—' }],
      brew: [{ n: '90', u: '°C', label: 'Water Temp' }, { n: '3', u: 'g', label: 'Per 200ml' }, { n: '3', u: 'min', label: 'First Steep' }, { n: '3', u: '×', label: 'Infusions' }],
      brewSteps: ['Warm the vessel.', 'Measure the leaf.', 'Pour at temperature.', 'Steep and enjoy.'],
      makeH: 'Deliberate steps', make: [{ t: 'Plucking', d: '—' }, { t: 'Withering', d: '—' }, { t: 'Firing', d: '—' }],
      originLead: 'A line to open the origin story.', originPs: ['Tell the origin story here.'],
      spec: [{ k: 'Style', v: '—' }, { k: 'Origin', v: 'Eastern Nepal, single Himalayan garden' }, { k: 'Altitude', v: '2,500 metres' }, { k: 'Cultivation', v: '100% certified organic' }, { k: 'Format', v: '100g loose leaf' }],
      closerH: 'Bring it home<br>with <em>you</em>', closerP: 'A closing line with the price.', soldOut: false,
    };
  }
  function createProduct() {
    const name = (prompt('Name of the new tea?') || '').trim();
    if (!name) return;
    const slug = slugify(name, Object.keys(products));
    const num = String(Math.max(0, ...Object.values(products).map(p => parseInt(p.num, 10) || 0)) + 1).padStart(2, '0');
    const p = newProductTemplate(name, num); p.slug = slug;
    products[slug] = p;
    renderProductTabs(); selectProduct(slug);
    notify(`“${name}” created — fill in the details and press Save to publish it.`);
  }

  const FIELDS = [['name', 'Name'], ['price', 'Price (£, whole number)'], ['tagline', 'Tagline'],
    ['eyebrow', 'Eyebrow'], ['stock', 'Stock line'], ['tag', 'Collection tag'],
    ['unitShort', 'Unit (collection card)'], ['unitLong', 'Unit (product page)']];

  function selectProduct(slug) {
    currentSlug = slug;
    document.querySelectorAll('#productTabs .admin-tab').forEach(b => b.classList.toggle('active', b.dataset.slug === slug));
    const p = products[slug];
    $('#productEditor').innerHTML = `
      <div class="admin-card">
        <h3>${esc(p.name)} — essentials <span class="admin-note" style="text-transform:none;letter-spacing:.5px;">/${esc(slug)}</span></h3>
        <div class="admin-grid">
          ${FIELDS.map(([k, label]) => `<div class="field"><label>${label}</label>
            <input data-k="${k}" value="${esc(p[k] ?? '')}"></div>`).join('')}
          <div class="field wide"><label>Description (product page)</label><textarea data-k="desc">${esc(p.desc || '')}</textarea></div>
          <div class="field wide"><label>Description (home collection card)</label><textarea data-k="homeDesc">${esc(p.homeDesc || '')}</textarea></div>
          <div class="field wide"><label>Flavour notes (comma-separated chips)</label><input data-k="notes" value="${esc((p.notes || []).join(', '))}"></div>
          <div class="field wide"><label style="display:flex;align-items:center;gap:.7rem;cursor:pointer;text-transform:none;letter-spacing:.5px;font-size:.85rem;color:var(--cream);">
            <input type="checkbox" data-k="soldOut" ${p.soldOut ? 'checked' : ''} style="width:auto;accent-color:#c9a961;">
            Sold out (hides Add buttons, shows a back-in-stock form, blocks checkout)</label></div>
        </div>
      </div>
      <div class="admin-card">
        <h3>Photography</h3>
        <p class="admin-note" style="margin-bottom:1rem;">First slot is the main shot (also used on the home page). Uploads convert to WebP in your browser.</p>
        <div class="gal-editor" id="galEditor"></div>
      </div>
      <div class="admin-card">
        <h3>Everything else</h3>
        <p class="admin-note" style="margin-bottom:1rem;">Tasting notes, brewing, manufacture, origin story and the spec table — edit the JSON directly. Structure must be preserved.</p>
        <div class="field"><textarea class="mono" id="productJson"></textarea></div>
      </div>
      <div class="admin-actions">
        <button class="btn-gold" style="width:auto;padding:0 2.4rem;" id="saveProduct">Save ${esc(p.name)}</button>
        <button class="btn-quiet danger" id="deleteProduct">Delete this tea</button>
        <span class="admin-note">Saving commits to GitHub and republishes the site.</span>
      </div>`;
    const advanced = {};
    for (const k of ['title', 'metaDesc', 'cartName', 'heroAlt', 'meta', 'tastingH', 'tasting', 'tasteFoot',
      'brew', 'brewSteps', 'makeH', 'make', 'originLead', 'originPs', 'spec', 'closerH', 'closerP']) advanced[k] = p[k];
    $('#productJson').value = JSON.stringify(advanced, null, 2);
    renderGallery(p);
    $('#saveProduct').onclick = saveProducts;
    $('#deleteProduct').onclick = () => deleteProduct(slug);
  }

  function renderGallery(p) {
    const wrap = $('#galEditor'); wrap.innerHTML = '';
    p.gallery.forEach((g, i) => {
      const slot = document.createElement('div'); slot.className = 'gal-slot';
      slot.innerHTML = `<div class="preview">${g.type === 'img' ? `<img src="${esc(g.src)}" alt="">`
        : `<div class="ph-note">${esc(g.label)}<br><br>(placeholder — awaiting photography)</div>`}</div>
        <label class="slot-btn">${g.type === 'img' ? 'Replace image' : 'Add photo'}<input type="file" accept="image/*"></label>`;
      slot.querySelector('input[type=file]').addEventListener('change', (e) => uploadInto(p, i, e.target.files[0]));
      wrap.appendChild(slot);
    });
  }
  async function toWebp(file) {
    const bitmap = await createImageBitmap(file);
    const MAX = 1600, scale = Math.min(1, MAX / bitmap.width), canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/webp', 0.85));
    if (!blob) throw new Error('Could not convert the image — try a .webp or .png file.');
    return blob;
  }
  async function uploadInto(p, index, file) {
    if (!file) return;
    try {
      notify('Converting and uploading…');
      const blob = await toWebp(file);
      const b64 = btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
      const base = (p.slug + '-' + (file.name.replace(/\.[^.]+$/, '') || 'photo')).toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 60);
      const { path } = await api('/api/admin/upload', { method: 'POST', body: JSON.stringify({ filename: `${base}.webp`, data: b64 }) });
      const g = p.gallery[index];
      p.gallery[index] = { type: 'img', src: path, alt: g.alt || g.label || p.name, thumb: g.thumb || p.name };
      if (index === 0) p.heroImage = path;
      renderGallery(p);
      notify('Image uploaded — press Save to publish the gallery change.');
    } catch (err) { notify(err.message, true); }
  }

  function collectCurrentProduct() {
    const p = products[currentSlug];
    for (const input of document.querySelectorAll('#productEditor [data-k]')) {
      const k = input.dataset.k;
      if (k === 'price') { const n = parseInt(input.value, 10); if (!Number.isInteger(n) || n < 1) throw new Error('Price must be a whole number of pounds.'); p.price = n; }
      else if (k === 'soldOut') p.soldOut = input.checked;
      else if (k === 'notes') p.notes = input.value.split(',').map(s => s.trim()).filter(Boolean);
      else p[k] = input.value;
    }
    Object.assign(p, JSON.parse($('#productJson').value));
  }
  async function persistProducts() {
    const { commit } = await api('/api/admin/content', { method: 'PUT', body: JSON.stringify({ file: 'products', data: products }) });
    notify(`Saved (commit ${commit}) — the site republishes in about a minute.`);
  }
  async function saveProducts() {
    try { collectCurrentProduct(); await persistProducts(); }
    catch (err) { notify(err.message, true); }
  }
  async function deleteProduct(slug) {
    if (Object.keys(products).length <= 1) { notify('You need at least one tea in the collection.', true); return; }
    if (!confirm(`Delete “${products[slug].name}” for good? This republishes the site without it.`)) return;
    delete products[slug];
    try { await persistProducts(); renderProductTabs(); selectProduct(Object.keys(products)[0]); }
    catch (err) { notify(err.message, true); products; }
  }

  /* ---------- site copy ---------- */
  function fillSiteForm() {
    for (const el of document.querySelectorAll('[data-site]')) el.value = site[el.dataset.site] ?? '';
    $('[data-site-lines]').value = (site.manifestoLines || []).join('\n');
    $('#siteJson').value = JSON.stringify(site, null, 2);
  }
  $('#saveSite').addEventListener('click', async () => {
    try {
      Object.assign(site, JSON.parse($('#siteJson').value));
      for (const el of document.querySelectorAll('[data-site]')) site[el.dataset.site] = el.value;
      site.manifestoLines = $('[data-site-lines]').value.split('\n').map(s => s.trim()).filter(Boolean);
      const { commit } = await api('/api/admin/content', { method: 'PUT', body: JSON.stringify({ file: 'site', data: site }) });
      $('#siteJson').value = JSON.stringify(site, null, 2);
      notify(`Saved (commit ${commit}) — the site republishes in about a minute.`);
    } catch (err) { notify(err.message, true); }
  });

  boot();
})();
