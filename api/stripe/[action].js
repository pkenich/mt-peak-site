import { sql, ensureSchema } from '../_lib/db.js';
import { requireCustomer } from '../_lib/session.js';
import { sendOrderEmail } from '../_lib/email.js';
import { dispatch, bad } from '../_lib/util.js';

/* Shared: the session id is only ever a hint — payment status is re-fetched
   from Stripe's API before an order is marked paid, so forged ids and forged
   webhook payloads can't buy tea. */
async function markPaidIfSettled(sessionId) {
  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status === 'paid') {
    // RETURNING only yields a row on the actual transition, so the
    // confirmation email can't double-send when webhook + confirm both fire.
    const rows = await sql()`UPDATE orders SET status = 'paid', updated_at = now()
      WHERE stripe_session_id = ${session.id} AND status = 'pending_payment'
      RETURNING public_id, email, items, total_pence, discount_pence, shipping`;
    if (rows.length) await sendOrderEmail(rows[0], 'paid');
    return true;
  }
  return false;
}

/* Called by the account page after a Stripe redirect. Makes webhooks optional. */
async function confirm(req, res) {
  await ensureSchema();
  requireCustomer(req);
  const sessionId = String(req.body?.sessionId || '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw bad('Bad session id.');
  if (!process.env.STRIPE_SECRET_KEY) throw bad('Payments are not configured.', 503);
  res.json({ ok: true, paid: await markPaidIfSettled(sessionId) });
}

/* Stripe webhook (optional — confirm covers the happy path). */
async function webhook(req, res) {
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments not configured' });
  const type = req.body?.type;
  const sessionId = req.body?.data?.object?.id;
  if (type === 'checkout.session.completed' && /^cs_[A-Za-z0-9_]+$/.test(sessionId || '')) {
    await ensureSchema();
    await markPaidIfSettled(sessionId);
  }
  res.json({ received: true });
}

export default dispatch({
  confirm: { methods: ['POST'], fn: confirm },
  webhook: { methods: ['POST'], fn: webhook },
});
