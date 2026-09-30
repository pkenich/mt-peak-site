/* MT. PEAK — shared cart (localStorage-backed, carries between all pages).
   Items: { s: slug, n: name, p: price, q: qty } — slugs are what checkout
   sends; the server reprices everything from its own catalogue. */
const STORE = 'mtpeak_cart_v2';
let cart = [];
try { cart = JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { cart = []; }
const navCart = document.getElementById('navCart');

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(cart)); } catch (e) {}
  window.dispatchEvent(new CustomEvent('mtpeak:cart')); // checkout page resyncs
  syncServerCart(); // persist for abandoned-cart reminders (signed-in only)
}

/* Debounced push of the cart to the server so we can send a reminder later.
   The server only stores it when a session cookie is present, and always
   reprices from its own catalogue — this body is just the item list. */
let _syncTimer = null;
function syncServerCart() {
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    fetch('/api/shop/save-cart', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart.map(i => ({ s: i.s, v: i.v || null, q: i.q })) }),
      keepalive: true,
    }).catch(() => {});
  }, 900);
}

function addToCart(slug, name, price, q = 1, variantId = null) {
  const v = variantId || null;
  const e = cart.find(i => i.s === slug && (i.v || null) === v);
  if (e) e.q += q; else cart.push({ s: slug, v, n: name, p: price, q });
  save(); render(); toastAdded(name);
}

/* Refined confirmation: a quiet toast + a pulse on the cart count, rather than
   forcing the cart open every time — the shop stays browsable. */
function toastAdded(name) {
  let t = document.getElementById('cartToast');
  if (!t) {
    t = document.createElement('div'); t.id = 'cartToast'; t.className = 'cart-toast';
    t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
    t.innerHTML = '<span class="ct-msg"></span><button class="ct-view" type="button">View bag</button>';
    document.body.appendChild(t);
    t.querySelector('.ct-view').addEventListener('click', openCart);
  }
  t.querySelector('.ct-msg').textContent = 'Added to your reserve · ' + name;
  t.classList.add('show');
  if (navCart) { navCart.classList.remove('pulse'); void navCart.offsetWidth; navCart.classList.add('pulse'); }
  clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 3400);
}

const escC = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function render() {
  const b = document.getElementById('cartBody');
  const t = cart.reduce((s, i) => s + i.p * i.q, 0);
  document.getElementById('cartTotal').textContent = t;
  navCart.textContent = 'Cart · ' + cart.reduce((s, i) => s + i.q, 0);
  if (!cart.length) { b.innerHTML = '<div class="cart-empty">Your reserve is empty</div>'; return; }
  b.innerHTML = cart.map((i, x) => `<div class="cart-line"><div><h3>${escC(i.n)}</h3>
    <div class="cart-qty"><button onclick="chg(${x},-1)" aria-label="Decrease quantity of ${escC(i.n)}">−</button><span>${i.q}</span><button onclick="chg(${x},1)" aria-label="Increase quantity of ${escC(i.n)}">+</button></div></div>
    <div class="right"><div class="price">£${i.p * i.q}</div><button class="cart-rm" onclick="rm(${x})" aria-label="Remove ${escC(i.n)}">Remove</button></div></div>`).join('');
}

function chg(x, d) {
  const i = cart[x];
  if (!i) return;
  i.q = Math.max(1, Math.min(20, i.q + d));
  save(); render();
}
function rm(x) { cart.splice(x, 1); save(); render(); }
let cartReturnFocus = null;
function openCart() {
  cartReturnFocus = document.activeElement;
  document.getElementById('cartOverlay').classList.add('open');
  document.getElementById('cartPanel').classList.add('open');
  document.getElementById('cartPanel').inert = false;
  if (navCart) navCart.setAttribute('aria-expanded', 'true');
  const c = document.querySelector('.cart-close'); if (c) c.focus();
}
function closeCart() {
  document.getElementById('cartOverlay').classList.remove('open');
  document.getElementById('cartPanel').classList.remove('open');
  document.getElementById('cartPanel').inert = true; // closed panel leaves the tab order
  if (navCart) navCart.setAttribute('aria-expanded', 'false');
  if (cartReturnFocus && cartReturnFocus.focus) cartReturnFocus.focus();
}
addEventListener('keydown', (e) => {
  const panel = document.getElementById('cartPanel');
  if (!panel.classList.contains('open')) return;
  if (e.key === 'Escape') { closeCart(); return; }
  if (e.key === 'Tab') { // keep keyboard focus inside the open cart dialog
    const f = [...panel.querySelectorAll('button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
if (navCart) { navCart.setAttribute('aria-haspopup', 'dialog'); navCart.setAttribute('aria-controls', 'cartPanel'); navCart.setAttribute('aria-expanded', 'false'); }

function checkout() {
  if (!cart.length) return;
  location.href = '/checkout';
}

/* home-page collection "Add" buttons */
document.querySelectorAll('.product-add[data-slug]').forEach(b =>
  b.addEventListener('click', () =>
    addToCart(b.dataset.slug, b.dataset.name, Number(b.dataset.price), 1)));

/* nav account label reflects session */
fetch('/api/auth/me').then(r => r.json()).then(({ user }) => {
  const a = document.getElementById('navAccount');
  if (a && user) a.textContent = (user.name || 'Account').split(' ')[0];
}).catch(() => {});

/* footer newsletter */
const newsForm = document.getElementById('newsForm');
if (newsForm) {
  newsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = document.getElementById('newsMsg');
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: document.getElementById('newsEmail').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Try again in a moment.');
      m.textContent = 'Welcome to the mountain. ⛰';
      newsForm.reset();
    } catch (err) { m.textContent = err.message; }
  });
}

/* mobile menu drawer */
const navToggle = document.getElementById('navToggle');
if (navToggle) {
  const drawer = document.getElementById('navDrawer');
  const scrim = document.getElementById('navScrim');
  drawer.inert = true;
  const setMenu = (open) => {
    drawer.inert = !open;
    drawer.classList.toggle('open', open);
    scrim.classList.toggle('open', open);
    navToggle.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', open);
    drawer.setAttribute('aria-hidden', !open);
    document.body.style.overflow = open ? 'hidden' : '';
  };
  navToggle.addEventListener('click', () => setMenu(!drawer.classList.contains('open')));
  scrim.addEventListener('click', () => setMenu(false));
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
}

navCart.addEventListener('click', openCart);
render();

/* Return-from-reminder: /?restore=<token> repopulates the cart on this device
   and opens the drawer. Merges with anything already here (by slug+variant). */
(() => {
  const params = new URLSearchParams(location.search);
  const token = params.get('restore');
  if (!token) return;
  fetch('/api/shop/restore-cart?token=' + encodeURIComponent(token))
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data || !Array.isArray(data.items) || !data.items.length) return;
      for (const it of data.items) {
        if (!it || !it.s) continue;
        const v = it.v || null;
        const e = cart.find(i => i.s === it.s && (i.v || null) === v);
        if (e) e.q = Math.min(20, e.q + (Number(it.q) || 1));
        else cart.push({ s: it.s, v, n: it.n, p: Number(it.p) || 0, q: Math.min(20, Number(it.q) || 1) });
      }
      save(); render(); openCart();
    })
    .catch(() => {})
    .finally(() => {
      params.delete('restore');
      const qs = params.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    });
})();
