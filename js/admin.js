/* MT. PEAK admin panel: edits content/*.json via /api/admin/content (each
   save is a git commit) and uploads images via /api/admin/upload. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const gate = $('#adminGate'), panel = $('#adminPanel');
  const banner = $('#saveBanner');
  let products = null, site = null, currentSlug = null;

  const api = async (url, opts = {}) => {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };

  let bannerTimer;
  const notify = (msg, isErr = false) => {
    banner.textContent = msg;
    banner.classList.toggle('err', isErr);
    banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.remove('show'), 5000);
  };

  /* ---------- auth gate ---------- */
  async function boot() {
    try {
      const { admin } = await api('/api/admin/me');
      admin ? await openPanel() : showGate();
    } catch { showGate(); }
  }
  function showGate() { gate.hidden = false; panel.hidden = true; $('#btnAdminLogout').hidden = true; }

  $('#gateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#gateMsg');
    msg.className = 'form-msg';
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#adPass').value }) });
      $('#adPass').value = '';
      await openPanel();
    } catch (err) { msg.textContent = err.message; msg.className = 'form-msg err'; }
  });

  $('#btnAdminLogout').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    showGate();
  });

  /* ---------- panel ---------- */
  async function openPanel() {
    const [p, s] = await Promise.all([
      api('/api/admin/content?file=products'),
      api('/api/admin/content?file=site'),
    ]);
    products = p.data; site = s.data;
    gate.hidden = true; panel.hidden = false; $('#btnAdminLogout').hidden = false;
    renderTabs();
    selectProduct(Object.keys(products)[0]);
    fillSiteForm();
    loadOrders();
    loadPromos();
  }

  /* ---------- promo codes ---------- */
  async function loadPromos() {
    try {
      const { promos } = await api('/api/admin/promos');
      const list = $('#promoList');
      if (!promos.length) {
        list.innerHTML = '<p class="admin-note">No codes yet — create your first above.</p>';
        return;
      }
      list.innerHTML = `
        <div class="promo-row head"><div>Code</div><div>Discount</div><div>Kind</div><div>Uses</div><div></div></div>` +
        promos.map(p => `
        <div class="promo-row${p.active ? '' : ' off'}">
          <div class="pcode">${p.code}</div>
          <div class="pmeta">${p.kind === 'percent' ? p.value + '% off' : gbp(p.value) + ' off'}</div>
          <div class="pmeta">${p.max_uses === null ? 'Universal' : p.max_uses === 1 ? 'Single-use' : `Issue of ${p.max_uses}`}</div>
          <div class="pmeta">${p.uses}${p.max_uses !== null ? ' / ' + p.max_uses : ''} used</div>
          <div><button class="btn-quiet" data-code="${p.code}" data-active="${p.active}">
            ${p.active ? 'Deactivate' : 'Reactivate'}</button></div>
        </div>`).join('');
      for (const b of list.querySelectorAll('button[data-code]')) {
        b.addEventListener('click', async () => {
          try {
            await api('/api/admin/promo-toggle', { method: 'PUT',
              body: JSON.stringify({ code: b.dataset.code, active: b.dataset.active !== 'true' }) });
            loadPromos();
          } catch (err) { notify(err.message, true); }
        });
      }
    } catch (err) {
      $('#promoList').innerHTML = `<p class="admin-note">${err.message}</p>`;
    }
  }

  $('#pcCreate').addEventListener('click', async () => {
    try {
      const { code } = await api('/api/admin/promo-create', {
        method: 'POST',
        body: JSON.stringify({
          code: $('#pcCode').value.trim() || undefined,
          kind: $('#pcKind').value,
          value: Number($('#pcValue').value),
          maxUses: $('#pcUses').value.trim() === '' ? null : Number($('#pcUses').value),
        }),
      });
      $('#pcCode').value = ''; $('#pcValue').value = ''; $('#pcUses').value = '';
      notify(`Code ${code} created — it works at checkout immediately.`);
      loadPromos();
    } catch (err) { notify(err.message, true); }
  });

  /* ---------- sales & orders ---------- */
  const STATUS_LABEL = {
    reserved: 'Reserved', pending_payment: 'Awaiting payment', paid: 'Paid',
    fulfilled: 'Shipped', cancelled: 'Cancelled',
  };
  const gbp = pence => '£' + (pence / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 });

  /* 30-day revenue bar chart: thin gold bars, rounded value-ends, recessive
     grid, per-bar hover tooltip. Single series — the title names it. */
  function revenueChart(daily) {
    const days = [];
    const byDay = Object.fromEntries(daily.map(d => [d.day, d]));
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days.push({ day: d, rev: (byDay[d]?.revenue_pence || 0), orders: (byDay[d]?.orders || 0) });
    }
    const W = 640, H = 150, PAD = 6, BASE = H - 18;
    const max = Math.max(...days.map(d => d.rev), 1);
    const bw = (W - PAD * 2) / 30;
    const bars = days.map((d, i) => {
      const h = d.rev ? Math.max((d.rev / max) * (BASE - 14), 3) : 0;
      const x = PAD + i * bw;
      const label = new Date(d.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return `<g class="cbar" data-tip="${label} — ${gbp(d.rev)} · ${d.orders} order${d.orders === 1 ? '' : 's'}">
        <rect x="${x}" y="0" width="${bw}" height="${BASE}" fill="transparent"></rect>
        ${d.rev ? `<rect class="vr" x="${(x + 1).toFixed(1)}" y="${(BASE - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="#c9a961"></rect>
        <rect class="vr" x="${(x + 1).toFixed(1)}" y="${(BASE - 2).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="2" fill="#c9a961"></rect>`
        : `<rect x="${(x + 1).toFixed(1)}" y="${BASE - 2}" width="${(bw - 2).toFixed(1)}" height="2" fill="rgba(201,169,97,.18)"></rect>`}
      </g>`;
    }).join('');
    const grid = [0.33, 0.66].map(f =>
      `<line x1="${PAD}" x2="${W - PAD}" y1="${(BASE * f).toFixed(1)}" y2="${(BASE * f).toFixed(1)}" stroke="rgba(244,239,230,.07)" stroke-width="1"/>`).join('');
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
      products.map(p => `
      <div class="pbar-row">
        <div class="pbar-name">${p.name}</div>
        <div class="pbar-track"><div class="pbar-fill" style="width:${Math.max((p.revenue_pence / max) * 100, 2)}%"></div></div>
        <div class="pbar-val">${gbp(p.revenue_pence)} · ${p.qty}</div>
      </div>`).join('');
  }

  async function loadOrders() {
    try {
      const { orders, stats, daily, products } = await api('/api/admin/orders');
      const aov = stats.paid_orders ? Math.round(stats.revenue_pence / stats.paid_orders) : 0;
      $('#statRow').innerHTML = [
        [gbp(stats.revenue_pence), 'Revenue (paid)'],
        [gbp(stats.revenue_7d_pence), 'Last 7 days'],
        [gbp(aov), 'Avg order value'],
        [gbp(stats.awaiting_pence), 'Awaiting payment'],
        [stats.orders, 'Orders'],
        [stats.customers, 'Customers'],
      ].map(([v, l]) => `<div class="stat"><div class="sv">${v}</div><div class="sl">${l}</div></div>`).join('');

      $('#salesViz').innerHTML = revenueChart(daily) + productBars(products);
      const tip = $('#chartTip');
      for (const g of document.querySelectorAll('#salesViz .cbar')) {
        g.addEventListener('mouseenter', () => {
          tip.textContent = g.dataset.tip; tip.hidden = false;
          g.querySelectorAll('.vr').forEach(r => r.setAttribute('fill', '#e8cd8f'));
        });
        g.addEventListener('mousemove', (e) => {
          const wrap = tip.parentElement.getBoundingClientRect();
          tip.style.left = Math.min(e.clientX - wrap.left + 12, wrap.width - tip.offsetWidth - 4) + 'px';
          tip.style.top = (e.clientY - wrap.top - 34) + 'px';
        });
        g.addEventListener('mouseleave', () => {
          tip.hidden = true;
          g.querySelectorAll('.vr').forEach(r => r.setAttribute('fill', '#c9a961'));
        });
      }

      if (!orders.length) {
        $('#adminOrders').innerHTML = '<p class="admin-note">No orders yet — they’ll appear here the moment someone checks out.</p>';
        return;
      }
      $('#adminOrders').innerHTML = `
        <div class="orders">
          <div class="order-row head"><div>Order</div><div>Customer</div><div>Items</div><div>Total</div><div>Status</div></div>
          ${orders.map(o => `
          <div class="order-row">
            <div><div class="oid">${o.public_id}</div><div class="odate">${new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div></div>
            <div class="oemail">${o.email}</div>
            <div class="oitems">${o.items.map(l => `${l.name} × ${l.qty}`).join('<br>')}</div>
            <div class="ototal">${gbp(o.total_pence)}</div>
            <div><select data-order="${o.public_id}">
              ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}"${v === o.status ? ' selected' : ''}>${l}</option>`).join('')}
            </select></div>
          </div>`).join('')}
        </div>`;
      for (const sel of document.querySelectorAll('#adminOrders select[data-order]')) {
        sel.addEventListener('change', async () => {
          try {
            await api('/api/admin/order-status', {
              method: 'PUT',
              body: JSON.stringify({ publicId: sel.dataset.order, status: sel.value }),
            });
            notify(`${sel.dataset.order} → ${STATUS_LABEL[sel.value]}`);
            loadOrders();
          } catch (err) { notify(err.message, true); }
        });
      }
    } catch (err) {
      $('#statRow').innerHTML = `<div class="admin-note">${err.message}</div>`;
    }
  }

  function renderTabs() {
    const tabs = $('#productTabs');
    tabs.innerHTML = '';
    for (const slug of Object.keys(products)) {
      const b = document.createElement('button');
      b.className = 'admin-tab';
      b.textContent = products[slug].name;
      b.onclick = () => selectProduct(slug);
      b.dataset.slug = slug;
      tabs.appendChild(b);
    }
  }

  const FIELDS = [
    ['name', 'Name'], ['price', 'Price (£, whole number)'], ['tagline', 'Tagline'],
    ['eyebrow', 'Eyebrow'], ['stock', 'Stock line'], ['tag', 'Collection tag'],
    ['unitShort', 'Unit (collection card)'], ['unitLong', 'Unit (product page)'],
  ];

  function selectProduct(slug) {
    currentSlug = slug;
    document.querySelectorAll('#productTabs .admin-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.slug === slug));
    const p = products[slug];
    const wrap = $('#productEditor');
    wrap.innerHTML = `
      <div class="admin-card">
        <h3>${p.name} — essentials</h3>
        <div class="admin-grid">
          ${FIELDS.map(([k, label]) => `
            <div class="field"><label>${label}</label>
              <input data-k="${k}" value="${String(p[k] ?? '').replace(/"/g, '&quot;')}"></div>`).join('')}
          <div class="field wide"><label>Description (product page)</label>
            <textarea data-k="desc">${p.desc || ''}</textarea></div>
          <div class="field wide"><label>Description (home collection card)</label>
            <textarea data-k="homeDesc">${p.homeDesc || ''}</textarea></div>
          <div class="field wide"><label>Flavour notes (comma-separated chips)</label>
            <input data-k="notes" value="${(p.notes || []).join(', ').replace(/"/g, '&quot;')}"></div>
        </div>
      </div>
      <div class="admin-card">
        <h3>Photography</h3>
        <p class="admin-note" style="margin-bottom:1rem;">First slot is the main shot (also used on the home page).
          Uploads are converted to WebP in your browser before saving.</p>
        <div class="gal-editor" id="galEditor"></div>
      </div>
      <div class="admin-card">
        <h3>Everything else</h3>
        <p class="admin-note" style="margin-bottom:1rem;">Tasting notes, brewing, manufacture steps, origin story and
          the spec table — edit the JSON directly. Structure must be preserved.</p>
        <div class="field"><textarea class="mono" id="productJson"></textarea></div>
      </div>
      <div class="admin-actions">
        <button class="btn-gold" style="width:auto;padding:0 2.4rem;" id="saveProduct">Save ${p.name}</button>
        <span class="admin-note">Saving commits to GitHub and republishes the site.</span>
      </div>`;

    const advanced = {};
    for (const k of ['title', 'metaDesc', 'cartName', 'meta', 'tastingH', 'tasting', 'tasteFoot',
      'brew', 'brewSteps', 'makeH', 'make', 'originLead', 'originPs', 'spec', 'closerH', 'closerP']) {
      advanced[k] = p[k];
    }
    $('#productJson').value = JSON.stringify(advanced, null, 2);

    renderGallery(p);
    $('#saveProduct').onclick = saveProduct;
  }

  function renderGallery(p) {
    const wrap = $('#galEditor');
    wrap.innerHTML = '';
    p.gallery.forEach((g, i) => {
      const slot = document.createElement('div');
      slot.className = 'gal-slot';
      slot.innerHTML = `
        <div class="preview">${g.type === 'img'
          ? `<img src="${g.src}" alt="">`
          : `<div class="ph-note">${g.label}<br><br>(placeholder — awaiting photography)</div>`}</div>
        <label class="slot-btn">${g.type === 'img' ? 'Replace image' : 'Add photo'}
          <input type="file" accept="image/*"></label>`;
      slot.querySelector('input[type=file]').addEventListener('change', (e) => uploadInto(p, i, e.target.files[0]));
      wrap.appendChild(slot);
    });
  }

  /* Client-side WebP conversion keeps uploads small and pages fast. */
  async function toWebp(file) {
    const bitmap = await createImageBitmap(file);
    const MAX = 1600;
    const scale = Math.min(1, MAX / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
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
      const base = (p.slug + '-' + (file.name.replace(/\.[^.]+$/, '') || 'photo'))
        .toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 60);
      const { path } = await api('/api/admin/upload', {
        method: 'POST',
        body: JSON.stringify({ filename: `${base}.webp`, data: b64 }),
      });
      const g = p.gallery[index];
      p.gallery[index] = { type: 'img', src: path, alt: g.alt || g.label || p.name, thumb: g.thumb || p.name };
      if (index === 0) p.heroImage = path;
      renderGallery(p);
      notify('Image uploaded — remember to press Save to publish the gallery change.');
    } catch (err) { notify(err.message, true); }
  }

  async function saveProduct() {
    const p = products[currentSlug];
    try {
      for (const input of document.querySelectorAll('#productEditor [data-k]')) {
        const k = input.dataset.k;
        if (k === 'price') {
          const n = parseInt(input.value, 10);
          if (!Number.isInteger(n) || n < 1) throw new Error('Price must be a whole number of pounds.');
          p.price = n;
        } else if (k === 'notes') {
          p.notes = input.value.split(',').map(s => s.trim()).filter(Boolean);
        } else p[k] = input.value;
      }
      Object.assign(p, JSON.parse($('#productJson').value));
      const { commit } = await api('/api/admin/content', {
        method: 'PUT',
        body: JSON.stringify({ file: 'products', data: products }),
      });
      notify(`Saved (commit ${commit}) — the site republishes in about a minute.`);
    } catch (err) { notify(err.message, true); }
  }

  /* ---------- site copy ---------- */
  function fillSiteForm() {
    for (const el of document.querySelectorAll('[data-site]')) el.value = site[el.dataset.site] ?? '';
    $('[data-site-lines]').value = (site.manifestoLines || []).join('\n');
    $('#siteJson').value = JSON.stringify(site, null, 2);
  }

  $('#saveSite').addEventListener('click', async () => {
    try {
      const jsonText = $('#siteJson').value;
      const fromJson = JSON.parse(jsonText);
      Object.assign(site, fromJson);
      for (const el of document.querySelectorAll('[data-site]')) site[el.dataset.site] = el.value;
      site.manifestoLines = $('[data-site-lines]').value.split('\n').map(s => s.trim()).filter(Boolean);
      const { commit } = await api('/api/admin/content', {
        method: 'PUT',
        body: JSON.stringify({ file: 'site', data: site }),
      });
      $('#siteJson').value = JSON.stringify(site, null, 2);
      notify(`Saved (commit ${commit}) — the site republishes in about a minute.`);
    } catch (err) { notify(err.message, true); }
  });

  boot();
})();
