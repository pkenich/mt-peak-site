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
