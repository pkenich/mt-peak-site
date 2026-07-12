import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql, ensureSchema } from './_lib/db.js';
import { requireCustomer } from './_lib/session.js';
import { sendOrderEmail } from './_lib/email.js';
import { handler, bad, publicOrderId } from './_lib/util.js';

const PRODUCTS = JSON.parse(readFileSync(join(process.cwd(), 'content/products.json'), 'utf8'));

/* POST { items: [{ slug, q }] }
   Prices always come from the server-side catalogue, never the client.
   With STRIPE_SECRET_KEY configured → Stripe Checkout redirect.
   Without it → the order is recorded as a "reservation" (no payment taken). */
export default handler(['POST'], async (req, res) => {
  await ensureSchema();
  const user = requireCustomer(req);

  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length || items.length > 20) throw bad('Your reserve is empty.');

  const lines = items.map(({ slug, q }) => {
    const p = PRODUCTS[slug];
    const qty = Math.floor(Number(q));
    if (!p || !Number.isFinite(qty) || qty < 1 || qty > 20) throw bad('Your reserve contains an unknown item — please refresh and retry.');
    return { slug, name: p.cartName, qty, unitPence: p.price * 100 };
  });
  const totalPence = lines.reduce((s, l) => s + l.unitPence * l.qty, 0);

  const q = sql();
  const publicId = publicOrderId();
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey) {
    await q`INSERT INTO orders (public_id, user_id, email, items, total_pence, status)
      VALUES (${publicId}, ${user.uid}, ${user.email}, ${JSON.stringify(lines)}, ${totalPence}, 'reserved')`;
    await sendOrderEmail({ public_id: publicId, email: user.email, items: lines, total_pence: totalPence }, 'reserved');
    return res.status(201).json({ ok: true, mode: 'reservation', orderId: publicId });
  }

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(stripeKey);
  const origin = process.env.SITE_URL || `https://${req.headers.host}`;
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: user.email,
    line_items: lines.map(l => ({
      quantity: l.qty,
      price_data: { currency: 'gbp', unit_amount: l.unitPence, product_data: { name: l.name } },
    })),
    metadata: { public_id: publicId },
    success_url: `${origin}/account?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/account?cancelled=1`,
  });

  await q`INSERT INTO orders (public_id, user_id, email, items, total_pence, status, stripe_session_id)
    VALUES (${publicId}, ${user.uid}, ${user.email}, ${JSON.stringify(lines)}, ${totalPence}, 'pending_payment', ${session.id})`;
  res.status(201).json({ ok: true, mode: 'stripe', orderId: publicId, url: session.url });
});
