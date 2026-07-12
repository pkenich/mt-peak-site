/* MT. PEAK — shared cart (localStorage-backed, carries between all pages).
   Items: { s: slug, n: name, p: price, q: qty } — slugs are what checkout
   sends; the server reprices everything from its own catalogue. */
const STORE = 'mtpeak_cart_v2';
let cart = [];
try { cart = JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { cart = []; }
const navCart = document.getElementById('navCart');

function save() { try { localStorage.setItem(STORE, JSON.stringify(cart)); } catch (e) {} }

function addToCart(slug, name, price, q = 1) {
  const e = cart.find(i => i.s === slug);
  if (e) e.q += q; else cart.push({ s: slug, n: name, p: price, q });
  save(); render(); openCart();
}

function render() {
  const b = document.getElementById('cartBody');
  const t = cart.reduce((s, i) => s + i.p * i.q, 0);
  document.getElementById('cartTotal').textContent = t;
  navCart.textContent = 'Cart · ' + cart.reduce((s, i) => s + i.q, 0);
  if (!cart.length) { b.innerHTML = '<div class="cart-empty">Your reserve is empty</div>'; return; }
  b.innerHTML = cart.map((i, x) => `<div class="cart-line"><div><h3>${i.n}</h3>
    <div class="cart-qty"><button onclick="chg(${x},-1)" aria-label="Decrease quantity">−</button><span>${i.q}</span><button onclick="chg(${x},1)" aria-label="Increase quantity">+</button></div></div>
    <div class="right"><div class="price">£${i.p * i.q}</div><button class="cart-rm" onclick="rm(${x})">Remove</button></div></div>`).join('');
}

function chg(x, d) {
  const i = cart[x];
  if (!i) return;
  i.q = Math.max(1, Math.min(20, i.q + d));
  save(); render();
}
function rm(x) { cart.splice(x, 1); save(); render(); }
function openCart() { document.getElementById('cartOverlay').classList.add('open'); document.getElementById('cartPanel').classList.add('open'); }
function closeCart() { document.getElementById('cartOverlay').classList.remove('open'); document.getElementById('cartPanel').classList.remove('open'); }

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

navCart.addEventListener('click', openCart);
render();
