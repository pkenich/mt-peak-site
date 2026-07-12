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
  b.innerHTML = cart.map((i, x) => `<div class="cart-line"><div><h3>${i.n}</h3><div class="q">Quantity · ${i.q}</div></div>
    <div class="right"><div class="price">£${i.p * i.q}</div><button onclick="rm(${x})">Remove</button></div></div>`).join('');
}

function rm(x) { cart.splice(x, 1); save(); render(); }
function openCart() { document.getElementById('cartOverlay').classList.add('open'); document.getElementById('cartPanel').classList.add('open'); }
function closeCart() { document.getElementById('cartOverlay').classList.remove('open'); document.getElementById('cartPanel').classList.remove('open'); }

async function checkout() {
  if (!cart.length) return;
  const btn = document.getElementById('cartCheckout');
  btn.disabled = true; btn.textContent = 'One moment…';
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart.map(i => ({ slug: i.s, q: i.q })) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { location.href = '/login?next=checkout'; return; }
    if (!res.ok) throw new Error(data.error || 'Checkout failed — please try again.');
    cart = []; save();
    if (data.mode === 'stripe' && data.url) { location.href = data.url; return; }
    location.href = `/account?placed=${encodeURIComponent(data.orderId)}`;
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Proceed to Checkout';
    alert(e.message);
  }
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

navCart.addEventListener('click', openCart);
render();
