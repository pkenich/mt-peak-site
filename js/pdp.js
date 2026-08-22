/* MT. PEAK — product detail page behavior (gallery, quantity, add-to-cart, reveals) */

/* ===== GALLERY ===== */
const galMain = document.getElementById('galMain');
const thumbs = [...document.querySelectorAll('.gal-thumb')];
function swapMain(html) {
  const cur = galMain.firstElementChild;
  if (cur) { cur.style.opacity = '0'; }
  setTimeout(() => {
    galMain.innerHTML = html;
    const el = galMain.firstElementChild;
    el.style.opacity = '0';
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '1'; }));
  }, 220);
}
thumbs.forEach(t => t.addEventListener('click', () => {
  if (t.classList.contains('active')) return;
  thumbs.forEach(x => x.classList.remove('active')); t.classList.add('active');
  if (t.dataset.type === 'img') {
    swapMain(`<img src="${t.dataset.src}" alt="${t.dataset.alt}">`);
  } else {
    swapMain(`<div class="gal-ph"><div class="ph-mark">${t.dataset.label}</div><div class="ph-sub">${t.dataset.sub}</div></div>`);
  }
}));

/* ===== QUANTITY + ADD TO CART (absent when the tea is sold out) ===== */
const qVal = document.getElementById('qVal');
const btnAdd = document.getElementById('btnAdd');
function clampQ() { let v = parseInt(qVal.value) || 1; v = Math.max(1, Math.min(20, v)); qVal.value = v; return v; }
if (qVal) {
  document.getElementById('qMinus').onclick = () => { qVal.value = Math.max(1, (parseInt(qVal.value) || 1) - 1); };
  document.getElementById('qPlus').onclick = () => { qVal.value = Math.min(20, (parseInt(qVal.value) || 1) + 1); };
  qVal.addEventListener('change', clampQ);
}
/* size variants (only present when a product defines 2+ sizes) */
const sizeSelect = document.getElementById('sizeSelect');
const baseName = btnAdd ? btnAdd.dataset.name : '';
const sel = { id: btnAdd ? (btnAdd.dataset.variant || null) : null, label: '', price: btnAdd ? Number(btnAdd.dataset.price) : 0 };
function setLabel() {
  if (btnAdd && !btnAdd.classList.contains('added')) btnAdd.textContent = 'Add to Reserve — £' + sel.price;
  const amt = document.getElementById('infoAmt'); if (amt) amt.textContent = '£' + sel.price;
}
if (sizeSelect) {
  const opts = [...sizeSelect.querySelectorAll('.size-opt')];
  const active = sizeSelect.querySelector('.size-opt.active') || opts[0];
  const apply = (o) => { opts.forEach(x => { x.classList.toggle('active', x === o); x.setAttribute('aria-checked', x === o); });
    sel.id = o.dataset.id; sel.label = o.dataset.label; sel.price = Number(o.dataset.price); setLabel(); };
  opts.forEach(o => o.addEventListener('click', () => apply(o)));
  if (active) apply(active);
}

if (btnAdd && !btnAdd.disabled) {
  const slug = btnAdd.dataset.slug;
  const nameFor = () => sel.label ? `${baseName.replace(/ · .*$/, '')} · ${sel.label}` : baseName;
  btnAdd.addEventListener('click', () => {
    addToCart(slug, nameFor(), sel.price, clampQ(), sel.id);
    btnAdd.classList.add('added'); btnAdd.textContent = 'Added to Reserve ✓';
    setTimeout(() => { btnAdd.classList.remove('added'); setLabel(); }, 1600);
  });
  const btnAdd2 = document.getElementById('btnAdd2');
  if (btnAdd2) {
    btnAdd2.addEventListener('click', e => { e.preventDefault(); addToCart(slug, nameFor(), sel.price, 1, sel.id); });
  }
}

/* ===== SOCIAL PROOF — reviews from verified orders ===== */
(async () => {
  const rEl = document.getElementById('pdpRating');
  if (!rEl) return;
  const slug = rEl.dataset.slug;
  const escR = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const starRow = n => '<span class="rstars">' + '★★★★★'.slice(0, Math.round(n)).padEnd(5, '☆') + '</span>';
  try {
    const res = await fetch(`/api/shop/reviews?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.count) return;
    // compact rating badge under the buy row
    rEl.innerHTML = `${starRow(data.average)} <b>${data.average}</b> · ${data.count} verified ${data.count === 1 ? 'review' : 'reviews'}`;
    rEl.hidden = false;
    // full reviews section
    if (data.reviews.length) {
      const grid = document.getElementById('reviewsGrid');
      document.getElementById('reviewsHead').textContent = `${data.average}★ from ${data.count} verified ${data.count === 1 ? 'cup' : 'cups'}`;
      grid.innerHTML = data.reviews.map(r => `<figure class="review">
        <div class="review-stars">${starRow(r.rating)}</div>
        <blockquote>${escR(r.body)}</blockquote>
        <figcaption>${escR(r.name || 'A drinker')} · ${new Date(r.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</figcaption>
      </figure>`).join('');
      const sec = document.getElementById('reviews');
      sec.hidden = false;
      [...sec.querySelectorAll('.sec-label,.sec-h,.review')].forEach(el => { el.classList.add('rv'); rio.observe(el); });
    }
  } catch { /* reviews are enhancement-only */ }
})();

/* ===== BACK-IN-STOCK NOTIFY (sold-out only) ===== */
(() => {
  const form = document.getElementById('notifyForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = document.getElementById('notifyMsg');
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const res = await fetch('/api/shop/notify-stock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: form.dataset.slug, email: document.getElementById('notifyEmail').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Please try again.');
      m.textContent = 'We’ll email you the moment it returns. ⛰';
      m.className = 'notify-msg ok';
      form.querySelector('input').value = '';
    } catch (err) { m.textContent = err.message; m.className = 'notify-msg err'; }
    btn.disabled = false;
  });
})();

/* ===== SCROLL REVEALS ===== */
const rvEls = [...document.querySelectorAll('.info,.sec-label,.sec-h,.taste-grid,.taste-foot,.brew-grid,.brew-method,.make-grid,.os-content,.spec-table,.pdp-closer h2,.pdp-closer p,.pdp-closer .cbtn')];
rvEls.forEach(el => el.classList.add('rv'));
const rio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } }), { threshold: .12, rootMargin: '0px 0px -40px 0px' });
rvEls.forEach(el => rio.observe(el));
