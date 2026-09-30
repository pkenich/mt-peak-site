import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql, ensureSchema, checkThrottle, recordFailure } from '../_lib/db.js';
import { readCustomer, verifyToken } from '../_lib/session.js';
import { unsubscribeEmail } from '../_lib/email.js';
import { dispatch, bad, normEmail, isEmail } from '../_lib/util.js';

const slugRe = /^[a-z0-9-]{1,60}$/;
const PRODUCTS = JSON.parse(readFileSync(join(process.cwd(), 'content/products.json'), 'utf8'));

/* Reprice a client cart against the server catalogue → normalized lines in the
   localStorage shape {s,v,n,p,q} plus a trustworthy subtotal. Unknown/sold-out
   items are dropped rather than rejected — a reminder shouldn't 400. */
function normalizeCart(rawItems) {
  const out = [];
  for (const it of Array.isArray(rawItems) ? rawItems.slice(0, 20) : []) {
    const slug = String(it.s ?? it.slug ?? '');
    const p = PRODUCTS[slug];
    if (!p || p.soldOut) continue;
    let q = Math.floor(Number(it.q ?? it.qty));
    if (!Number.isFinite(q) || q < 1) continue;
    q = Math.min(q, 20);
    const variantId = it.v ?? it.variantId ?? null;
    if (Array.isArray(p.variants) && p.variants.length) {
      const v = p.variants.find(x => x.id === variantId) || p.variants.find(x => x.default) || p.variants[0];
      if (v.soldOut) continue;
      out.push({ s: slug, v: v.id, n: `${p.name} · ${v.label}`, p: v.price, q });
    } else {
      out.push({ s: slug, v: null, n: p.cartName, p: p.price, q });
    }
  }
  const subtotalPence = out.reduce((s, l) => s + l.p * 100 * l.q, 0);
  return { items: out, subtotalPence };
}

/* POST { items } — persists the signed-in customer's cart so we can send an
   abandoned-cart reminder later. Email always comes from the session cookie,
   never the client. Guests (no session) are a silent no-op. Any change resets
   the reminder clocks so a fresh abandonment cycle begins. */
async function saveCart(req, res) {
  const s = readCustomer(req);
  if (!s) return res.json({ ok: true, saved: false }); // nobody to remind
  await ensureSchema();
  // Only store a bag for people who opted in to reminders and haven't unsubscribed
  // (data minimisation — see /privacy).
  const pref = await sql()`SELECT u.reminders_opt_in AND NOT EXISTS (SELECT 1 FROM email_optouts e WHERE e.email = u.email) AS ok
    FROM users u WHERE u.id = ${s.uid}`;
  if (!pref[0]?.ok) return res.json({ ok: true, saved: false });
  const { items, subtotalPence } = normalizeCart(req.body?.items);
  if (!items.length) {
    await sql()`DELETE FROM carts WHERE email = ${s.email}`;
    return res.json({ ok: true, saved: false });
  }
  await sql()`INSERT INTO carts (email, user_id, items, subtotal_pence, updated_at,
      reminded_24h, reminded_1mo, recovered_at)
    VALUES (${s.email}, ${s.uid}, ${JSON.stringify(items)}, ${subtotalPence}, now(), NULL, NULL, NULL)
    ON CONFLICT (email) DO UPDATE SET items = EXCLUDED.items, subtotal_pence = EXCLUDED.subtotal_pence,
      user_id = EXCLUDED.user_id, updated_at = now(),
      reminded_24h = NULL, reminded_1mo = NULL, recovered_at = NULL`;
  res.json({ ok: true, saved: true });
}

/* GET ?token=... — restores a cart into the browser from a reminder link.
   The token is our own signed, namespaced token carrying the cart's email. */
async function restoreCart(req, res) {
  const payload = verifyToken(req.query.token);
  if (!payload?.cart) throw bad('That link has expired — your reserve may have moved on.', 400);
  await ensureSchema();
  const rows = await sql()`SELECT items FROM carts WHERE email = ${payload.cart}`;
  res.json({ items: rows.length ? rows[0].items : [] });
}

/* Public product reviews (social proof on the PDP): aggregate rating + a few
   recent notes for a tea, drawn from verified order reviews. First names only. */
async function reviews(req, res) {
  await ensureSchema();
  const slug = String(req.query.slug || '');
  if (!slugRe.test(slug)) throw bad('Unknown product.');
  const match = JSON.stringify([{ slug }]);
  const [agg, recent] = await Promise.all([
    sql()`SELECT count(*)::int AS n, round(avg(r.rating), 1) AS avg
      FROM reviews r JOIN orders o ON o.id = r.order_id
      WHERE o.items @> ${match}::jsonb`,
    sql()`SELECT r.rating, r.body, r.created_at, split_part(u.name, ' ', 1) AS name
      FROM reviews r JOIN orders o ON o.id = r.order_id JOIN users u ON u.id = r.user_id
      WHERE o.items @> ${match}::jsonb AND r.body IS NOT NULL AND length(trim(r.body)) > 0
      ORDER BY r.created_at DESC LIMIT 6`,
  ]);
  res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
  res.json({ count: agg[0].n, average: agg[0].avg, reviews: recent });
}

/* Back-in-stock capture on a sold-out PDP. Idempotent; throttled per IP. */
async function notifyStock(req, res) {
  await ensureSchema();
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  await checkThrottle(`stock:${ip}`);
  await recordFailure(`stock:${ip}`);
  const slug = String(req.body?.slug || '');
  const email = normEmail(req.body?.email);
  if (!slugRe.test(slug)) throw bad('Unknown product.');
  if (!isEmail(email)) throw bad('That email address doesn’t look right.');
  await sql()`INSERT INTO stock_notify (slug, email) VALUES (${slug}, ${email})
    ON CONFLICT (slug, email) DO NOTHING`;
  res.status(201).json({ ok: true });
}

/* One-click unsubscribe (RFC 8058) + the link in every marketing email.
   GET  ?t=token → used by /unsubscribe page; POST ?t=token → mail clients' one-click. */
async function unsubscribe(req, res) {
  const payload = verifyToken(req.query.t || req.body?.t);
  if (!payload?.unsub || !isEmail(payload.unsub)) throw bad('That unsubscribe link is invalid or has expired — email us and we’ll remove you by hand.', 400);
  await ensureSchema();
  await unsubscribeEmail(payload.unsub);
  res.json({ ok: true, email: payload.unsub.replace(/^(.).*(@.*)$/, '$1•••$2') });
}

/* Data-protection request from someone without an account (access / erasure /
   correction). Identity is verified by us by email before anything is deleted,
   so this only records the request for the back office. */
const REQ_KINDS = ['erasure', 'access', 'correction', 'objection'];
async function dataRequest(req, res) {
  await ensureSchema();
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  await checkThrottle(`dsr:${ip}`);
  await recordFailure(`dsr:${ip}`);
  const email = normEmail(req.body?.email);
  const kind = String(req.body?.kind || '');
  const note = String(req.body?.note || '').trim().slice(0, 1000) || null;
  if (!isEmail(email)) throw bad('Enter the email address the request is about.');
  if (!REQ_KINDS.includes(kind)) throw bad('Choose what you would like us to do.');
  await sql()`INSERT INTO data_requests (email, kind, note) VALUES (${email}, ${kind}, ${note})`;
  res.status(201).json({ ok: true });
}

export default dispatch({
  unsubscribe: { methods: ['GET', 'POST'], fn: unsubscribe },
  'data-request': { methods: ['POST'], fn: dataRequest },
  reviews: { methods: ['GET'], fn: reviews },
  'notify-stock': { methods: ['POST'], fn: notifyStock },
  'save-cart': { methods: ['POST'], fn: saveCart },
  'restore-cart': { methods: ['GET'], fn: restoreCart },
});
