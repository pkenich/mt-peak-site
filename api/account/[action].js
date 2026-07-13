import bcrypt from 'bcryptjs';
import { sql, ensureSchema } from '../_lib/db.js';
import { requireCustomer, issueCustomer } from '../_lib/session.js';
import { sendBrandEmail, sendOrderEmail } from '../_lib/email.js';
import { dispatch, bad } from '../_lib/util.js';

/* Loads an order that must belong to the signed-in user. */
async function ownedOrder(publicId, uid) {
  const rows = await sql()`SELECT id, public_id, status, created_at, items, total_pence
    FROM orders WHERE public_id = ${String(publicId || '').toUpperCase()} AND user_id = ${uid}`;
  if (!rows.length) throw bad('Order not found.', 404);
  return rows[0];
}

/* ---- reviews / ratings ---- */
async function review(req, res) {
  await ensureSchema();
  const user = requireCustomer(req);
  const order = await ownedOrder(req.body?.orderId, user.uid);
  const rating = Math.floor(Number(req.body?.rating));
  const shipRating = req.body?.shippingRating == null ? null : Math.floor(Number(req.body.shippingRating));
  const body = String(req.body?.body || '').trim().slice(0, 1000) || null;
  if (!(rating >= 1 && rating <= 5)) throw bad('Give the tea a rating from 1 to 5.');
  if (shipRating !== null && !(shipRating >= 1 && shipRating <= 5)) throw bad('Shipping rating must be 1 to 5.');

  await sql()`INSERT INTO reviews (order_id, user_id, rating, shipping_rating, body)
    VALUES (${order.id}, ${user.uid}, ${rating}, ${shipRating}, ${body})
    ON CONFLICT (order_id) DO UPDATE SET
      rating = excluded.rating, shipping_rating = excluded.shipping_rating,
      body = excluded.body, created_at = now()`;
  res.json({ ok: true });
}

/* ---- refund request ---- */
async function refund(req, res) {
  await ensureSchema();
  const user = requireCustomer(req);
  const order = await ownedOrder(req.body?.orderId, user.uid);
  const reason = String(req.body?.reason || '').trim().slice(0, 1000);
  if (reason.length < 10) throw bad('Please tell us a little more (at least 10 characters).');
  if (['cancelled'].includes(order.status)) throw bad('This order is already cancelled.');

  const existing = await sql()`SELECT 1 FROM refunds WHERE order_id = ${order.id} AND status = 'requested'`;
  if (existing.length) throw bad('A refund request for this order is already being reviewed.', 409);

  await sql()`INSERT INTO refunds (order_id, user_id, reason) VALUES (${order.id}, ${user.uid}, ${reason})`;
  await sendBrandEmail({
    to: user.email,
    subject: `We’ve received your refund request — ${order.public_id}`,
    heading: 'Refund request received',
    message: `Thank you — we’ve logged your request for order ${order.public_id} and a human will review it within two working days. We’ll be in touch by email.`,
    ctaLabel: 'VIEW YOUR ORDERS', ctaUrl: `${process.env.SITE_URL || 'https://mt-peak-site.vercel.app'}/account`,
  });
  res.status(201).json({ ok: true });
}

/* ---- self-service cancel of an unpaid order ---- */
async function cancel(req, res) {
  await ensureSchema();
  const user = requireCustomer(req);
  const order = await ownedOrder(req.body?.orderId, user.uid);
  if (!['reserved', 'pending_payment'].includes(order.status)) {
    throw bad('This order can no longer be cancelled here — request a refund instead.');
  }
  await sql()`UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = ${order.id}`;
  await sendOrderEmail({ public_id: order.public_id, email: user.email, items: order.items,
    total_pence: order.total_pence, gift_note: null }, 'cancelled');
  res.json({ ok: true });
}

/* ---- reorder: returns the order's items so the client can rebuild the cart ---- */
async function reorder(req, res) {
  await ensureSchema();
  const user = requireCustomer(req);
  const order = await ownedOrder(req.body?.orderId, user.uid);
  res.json({ items: order.items });
}

/* ---- saved address book ---- */
async function addresses(req, res) {
  await ensureSchema();
  const user = requireCustomer(req);
  if (req.method === 'GET') {
    const rows = await sql()`SELECT addresses FROM users WHERE id = ${user.uid}`;
    return res.json({ addresses: rows[0]?.addresses || [] });
  }
  const list = Array.isArray(req.body?.addresses) ? req.body.addresses : [];
  if (list.length > 20) throw bad('That’s a lot of addresses — 20 max.');
  const clean = list.map(a => {
    const o = {};
    for (const f of ['label', 'name', 'line1', 'line2', 'city', 'postcode', 'country'])
      o[f] = String(a?.[f] ?? '').trim().slice(0, 120);
    if (!o.name || !o.line1 || !o.city || !o.country) throw bad('Each saved address needs a name, street, city and country.');
    return o;
  });
  await sql()`UPDATE users SET addresses = ${JSON.stringify(clean)} WHERE id = ${user.uid}`;
  res.json({ ok: true, addresses: clean });
}

/* ---- profile: name + optional password change ---- */
async function profile(req, res) {
  await ensureSchema();
  const user = requireCustomer(req);
  const name = String(req.body?.name || '').trim().slice(0, 80);
  if (!name) throw bad('Name can’t be empty.');
  const newPass = req.body?.newPassword ? String(req.body.newPassword) : null;

  if (newPass) {
    if (newPass.length < 8) throw bad('New password must be at least 8 characters.');
    const rows = await sql()`SELECT pass_hash FROM users WHERE id = ${user.uid}`;
    const ok = rows.length && await bcrypt.compare(String(req.body?.currentPassword || ''), rows[0].pass_hash);
    if (!ok) throw bad('Your current password is incorrect.', 401);
    const hash = await bcrypt.hash(newPass, 11);
    await sql()`UPDATE users SET name = ${name}, pass_hash = ${hash} WHERE id = ${user.uid}`;
  } else {
    await sql()`UPDATE users SET name = ${name} WHERE id = ${user.uid}`;
  }
  issueCustomer(res, { id: user.uid, email: user.email, name }); // refresh cookie name
  res.json({ ok: true, name });
}

export default dispatch({
  review: { methods: ['POST'], fn: review },
  refund: { methods: ['POST'], fn: refund },
  cancel: { methods: ['POST'], fn: cancel },
  reorder: { methods: ['POST'], fn: reorder },
  addresses: { methods: ['GET', 'PUT'], fn: addresses },
  profile: { methods: ['PUT'], fn: profile },
});
