/* Executes every API handler against a mock DB + mock req/res, on the happy
   path and key edge cases, asserting no runtime throw and sane status codes. */
process.env.DATABASE_URL = 'mock://db';
process.env.AUTH_SECRET = 'audit-secret-0123456789abcdef';

const calls = [];
/* Mock tagged-template sql: records the query, returns one Proxy row so
   rows[0].anything is defined and rows.length === 1 (happy path). */
function proxyRow() {
  return new Proxy({}, { get(_, k) {
    if (typeof k === 'symbol') return undefined;
    if (k === 'then') return undefined; // not a thenable
    if (/items|addresses|emails/.test(k)) return [];
    if (/created_at|updated_at|locked_until/.test(k)) return new Date().toISOString();
    if (/pence|rating|count|uses|value|qty|max_uses|^n$|^id$|_id$|avg|revenue|orders|customers|awaiting/.test(k)) return 1;
    if (k === 'active') return true;
    return 'x';
  } });
}
globalThis.__MOCK_SQL__ = (strings, ...vals) => {
  calls.push(strings.join('?'));
  return Promise.resolve([proxyRow()]);
};

const { issueCustomer, issueAdmin } = await import('../api/_lib/session.js');

function cookieFrom(issuer) {
  let header;
  issuer({ getHeader: () => header, setHeader: (k, v) => { header = v; } });
  return header[header.length - 1].split(';')[0];
}
const CUST = cookieFrom(r => issueCustomer(r, { id: 1, email: 'a@b.co', name: 'Sam Rae' }));
const ADMIN = cookieFrom(r => issueAdmin(r));

function mockReq({ method = 'GET', query = {}, body = {}, cookie = '' } = {}) {
  return { method, query, body, headers: { cookie, host: 'x.co', 'x-forwarded-for': '1.2.3.4' } };
}
function mockRes() {
  const r = { code: 200, body: null, headers: {} };
  const res = {
    _r: r,
    status(c) { r.code = c; return this; },
    json(b) { r.body = b; return this; },
    setHeader(k, v) { r.headers[k.toLowerCase()] = v; },
    getHeader(k) { return r.headers[k.toLowerCase()]; },
  };
  return res;
}

let fails = 0;
async function run(name, mod, reqOpts, expect) {
  const handler = (await import(mod)).default;
  const res = mockRes();
  try {
    await handler(mockReq(reqOpts), res);
  } catch (e) {
    console.log(`✗ ${name}: THREW ${e.stack.split('\n')[0]}`); fails++; return;
  }
  const code = res._r.code;
  if (expect && !expect(code, res._r.body)) {
    console.log(`✗ ${name}: unexpected code=${code} body=${JSON.stringify(res._r.body).slice(0, 120)}`); fails++; return;
  }
  console.log(`✓ ${name} (code ${code})`);
}
const ok = c => c >= 200 && c < 300;
const is = n => c => c === n;

/* ---- auth ---- */
await run('auth.me (anon)', '../api/auth/[action].js', { query: { action: 'me' } }, ok);
await run('auth.me (session)', '../api/auth/[action].js', { query: { action: 'me' }, cookie: CUST }, ok);
await run('auth.register', '../api/auth/[action].js', { method: 'POST', query: { action: 'register' }, body: { name: 'Sam', email: 'new@b.co', password: 'password1' } }, ok);
await run('auth.register (bad email)', '../api/auth/[action].js', { method: 'POST', query: { action: 'register' }, body: { name: 'S', email: 'nope', password: 'password1' } }, is(400));
await run('auth.login', '../api/auth/[action].js', { method: 'POST', query: { action: 'login' }, body: { email: 'a@b.co', password: 'password1' } }, c => ok(c) || c === 401);
await run('auth.logout', '../api/auth/[action].js', { method: 'POST', query: { action: 'logout' }, cookie: CUST }, ok);
await run('auth.request-reset (no resend)', '../api/auth/[action].js', { method: 'POST', query: { action: 'request-reset' }, body: { email: 'a@b.co' } }, is(503));
await run('auth.reset (bad token)', '../api/auth/[action].js', { method: 'POST', query: { action: 'reset' }, body: { token: 'x', password: 'password1' } }, is(400));
await run('auth wrong method', '../api/auth/[action].js', { method: 'GET', query: { action: 'login' } }, is(405));
await run('auth unknown action', '../api/auth/[action].js', { query: { action: 'zzz' } }, is(404));

/* ---- account (all require session) ---- */
await run('account.review', '../api/account/[action].js', { method: 'POST', query: { action: 'review' }, cookie: CUST, body: { orderId: 'MP-AAA111', rating: 5, shippingRating: 4, body: 'Great' } }, ok);
await run('account.review (bad rating)', '../api/account/[action].js', { method: 'POST', query: { action: 'review' }, cookie: CUST, body: { orderId: 'MP-AAA111', rating: 9 } }, is(400));
await run('account.review (anon)', '../api/account/[action].js', { method: 'POST', query: { action: 'review' }, body: { orderId: 'X', rating: 5 } }, is(401));
await run('account.refund', '../api/account/[action].js', { method: 'POST', query: { action: 'refund' }, cookie: CUST, body: { orderId: 'MP-AAA111', reason: 'Arrived damaged sadly.' } }, c => ok(c) || c === 409);
await run('account.refund (short)', '../api/account/[action].js', { method: 'POST', query: { action: 'refund' }, cookie: CUST, body: { orderId: 'MP-AAA111', reason: 'bad' } }, is(400));
await run('account.cancel', '../api/account/[action].js', { method: 'POST', query: { action: 'cancel' }, cookie: CUST, body: { orderId: 'MP-AAA111' } }, c => ok(c) || c === 400);
await run('account.reorder', '../api/account/[action].js', { method: 'POST', query: { action: 'reorder' }, cookie: CUST, body: { orderId: 'MP-AAA111' } }, ok);
await run('account.addresses GET', '../api/account/[action].js', { method: 'GET', query: { action: 'addresses' }, cookie: CUST }, ok);
await run('account.addresses PUT', '../api/account/[action].js', { method: 'PUT', query: { action: 'addresses' }, cookie: CUST, body: { addresses: [{ label: 'Home', name: 'S', line1: '1 St', city: 'London', postcode: 'N1', country: 'UK' }] } }, ok);
await run('account.profile', '../api/account/[action].js', { method: 'PUT', query: { action: 'profile' }, cookie: CUST, body: { name: 'New Name' } }, ok);

/* ---- orders ---- */
await run('orders.index', '../api/orders/index.js', { query: {}, cookie: CUST }, ok);
await run('orders.index (anon)', '../api/orders/index.js', {}, is(401));
await run('orders.track', '../api/orders/track.js', { method: 'POST', body: { orderId: 'MP-ABC234', email: 'a@b.co' } }, c => ok(c) || c === 404);

/* ---- shop (public) ---- */
await run('shop.reviews', '../api/shop/[action].js', { query: { action: 'reviews', slug: 'golden-harvest' } }, ok);
await run('shop.reviews (bad slug)', '../api/shop/[action].js', { query: { action: 'reviews', slug: 'BAD SLUG!' } }, is(400));
await run('shop.notify-stock', '../api/shop/[action].js', { method: 'POST', query: { action: 'notify-stock' }, body: { slug: 'golden-harvest', email: 'a@b.co' } }, ok);

/* ---- subscribe / promo ---- */
await run('subscribe', '../api/subscribe.js', { method: 'POST', body: { email: 'a@b.co' } }, ok);
await run('subscribe (bad)', '../api/subscribe.js', { method: 'POST', body: { email: 'nope' } }, is(400));
await run('promo preview', '../api/promo.js', { method: 'POST', cookie: CUST, body: { code: 'PEAK10', subtotalPence: 10000 } }, c => ok(c) || c === 404 || c === 410);

/* ---- checkout ---- */
await run('checkout', '../api/checkout.js', { method: 'POST', cookie: CUST, body: { items: [{ slug: 'golden-harvest', q: 1 }], shipping: { name: 'S', line1: '1 St', city: 'London', postcode: 'N1', country: 'UK' }, billingSameAsShipping: true } }, ok);
await run('checkout (empty)', '../api/checkout.js', { method: 'POST', cookie: CUST, body: { items: [] } }, is(400));
await run('checkout (bad address)', '../api/checkout.js', { method: 'POST', cookie: CUST, body: { items: [{ slug: 'golden-harvest', q: 1 }], shipping: { name: 'S' }, billingSameAsShipping: true } }, is(400));

/* ---- admin ---- */
await run('admin.me', '../api/admin/[action].js', { query: { action: 'me' }, cookie: ADMIN }, ok);
await run('admin.orders', '../api/admin/[action].js', { query: { action: 'orders' }, cookie: ADMIN }, ok);
await run('admin.orders (anon)', '../api/admin/[action].js', { query: { action: 'orders' } }, is(401));
await run('admin.promos', '../api/admin/[action].js', { query: { action: 'promos' }, cookie: ADMIN }, ok);
await run('admin.promo-create', '../api/admin/[action].js', { method: 'POST', query: { action: 'promo-create' }, cookie: ADMIN, body: { kind: 'percent', value: 10, maxUses: null } }, c => ok(c) || c === 409);
await run('admin.promo-create (bad)', '../api/admin/[action].js', { method: 'POST', query: { action: 'promo-create' }, cookie: ADMIN, body: { kind: 'percent', value: 999 } }, is(400));
await run('admin.promo-toggle', '../api/admin/[action].js', { method: 'PUT', query: { action: 'promo-toggle' }, cookie: ADMIN, body: { code: 'PEAK10', active: false } }, ok);
await run('admin.order-status', '../api/admin/[action].js', { method: 'PUT', query: { action: 'order-status' }, cookie: ADMIN, body: { publicId: 'MP-ABC234', status: 'paid' } }, c => ok(c) || c === 404);
await run('admin.order-status (bad)', '../api/admin/[action].js', { method: 'PUT', query: { action: 'order-status' }, cookie: ADMIN, body: { publicId: 'MP-ABC234', status: 'nonsense' } }, is(400));
await run('admin.refund-resolve', '../api/admin/[action].js', { method: 'PUT', query: { action: 'refund-resolve' }, cookie: ADMIN, body: { id: 1, decision: 'approved' } }, c => ok(c) || c === 409);
await run('admin.content GET', '../api/admin/[action].js', { method: 'GET', query: { action: 'content', file: 'site' }, cookie: ADMIN }, c => ok(c) || c === 502 || c === 503);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL HANDLERS OK');
process.exit(fails ? 1 : 0);
