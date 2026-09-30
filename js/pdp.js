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
function selectThumb(t) {
  if (!t) return;
  thumbs.forEach(x => x.classList.remove('active')); t.classList.add('active');
  if (t.dataset.type === 'img') {
    swapMain(`<img src="${t.dataset.src}" alt="${t.dataset.alt}">`);
  } else {
    swapMain(`<div class="gal-ph"><div class="ph-mark">${t.dataset.label}</div><div class="ph-sub">${t.dataset.sub}</div></div>`);
  }
}
thumbs.forEach(t => t.addEventListener('click', () => { if (!t.classList.contains('active')) selectThumb(t); }));

/* step to the previous/next thumb (wraps) — used by swipe & lightbox arrows */
function stepThumb(dir) {
  const i = thumbs.findIndex(t => t.classList.contains('active'));
  if (i < 0) return;
  selectThumb(thumbs[(i + dir + thumbs.length) % thumbs.length]);
}

/* ===== IMAGE ZOOM / LIGHTBOX (real photos only) ===== */
const imageThumbs = thumbs.filter(t => t.dataset.type === 'img');
if (galMain && imageThumbs.length) {
  galMain.classList.add('zoomable');
  let lb, lbImg;
  const imgList = () => imageThumbs.map(t => ({ src: t.dataset.src, alt: t.dataset.alt }));
  let lbIndex = 0;
  const showLb = (i) => {
    const list = imgList(); lbIndex = (i + list.length) % list.length;
    lbImg.src = list[lbIndex].src; lbImg.alt = list[lbIndex].alt || '';
  };
  const openLb = () => {
    const cur = galMain.querySelector('img'); if (!cur) return; // placeholder showing → no lightbox
    if (!lb) {
      lb = document.createElement('div'); lb.className = 'lightbox'; lb.setAttribute('role', 'dialog');
      lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Product image viewer');
      lb.innerHTML = `<button class="lb-close" aria-label="Close">✕</button>
        <button class="lb-nav lb-prev" aria-label="Previous image">‹</button>
        <img class="lb-img" alt="">
        <button class="lb-nav lb-next" aria-label="Next image">›</button>`;
      document.body.appendChild(lb);
      lbImg = lb.querySelector('.lb-img');
      lb.querySelector('.lb-close').addEventListener('click', closeLb);
      lb.querySelector('.lb-prev').addEventListener('click', (e) => { e.stopPropagation(); showLb(lbIndex - 1); });
      lb.querySelector('.lb-next').addEventListener('click', (e) => { e.stopPropagation(); showLb(lbIndex + 1); });
      lb.addEventListener('click', (e) => { if (e.target === lb) closeLb(); });
    }
    const curSrc = cur.getAttribute('src');
    const start = Math.max(0, imgList().findIndex(x => x.src === curSrc));
    showLb(start);
    lb.classList.add('open'); document.body.style.overflow = 'hidden';
    lb.querySelector('.lb-close').focus();
  };
  function closeLb() { if (lb) { lb.classList.remove('open'); document.body.style.overflow = ''; galMain.focus(); } }
  galMain.addEventListener('click', openLb);
  galMain.setAttribute('tabindex', '0');
  galMain.setAttribute('role', 'button');
  galMain.setAttribute('aria-label', 'Enlarge image');
  galMain.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLb(); } });
  addEventListener('keydown', (e) => {
    if (!lb || !lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLb();
    else if (e.key === 'ArrowLeft') showLb(lbIndex - 1);
    else if (e.key === 'ArrowRight') showLb(lbIndex + 1);
  });

  /* swipe on the main image (mobile) */
  let tx = 0, ty = 0;
  galMain.addEventListener('touchstart', (e) => { tx = e.changedTouches[0].clientX; ty = e.changedTouches[0].clientY; }, { passive: true });
  galMain.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) stepThumb(dx < 0 ? 1 : -1);
  }, { passive: true });
}

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
  const starRow = n => `<span class="rstars" role="img" aria-label="${Number(n)} out of 5 stars">` + '★★★★★'.slice(0, Math.round(n)).padEnd(5, '☆') + '</span>';
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
