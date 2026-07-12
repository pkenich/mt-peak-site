import { sql, ensureSchema } from './_lib/db.js';
import { requireCustomer } from './_lib/session.js';
import { handler, bad } from './_lib/util.js';

/* Called by the account page after a Stripe redirect. The session id from the
   URL is treated as a hint only — payment status is re-fetched from Stripe's
   API, so a forged id can't mark anything paid. Makes webhooks optional. */
export default handler(['POST'], async (req, res) => {
  await ensureSchema();
  requireCustomer(req);
  const sessionId = String(req.body?.sessionId || '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw bad('Bad session id.');
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) throw bad('Payments are not configured.', 503);

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(stripeKey);
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status === 'paid') {
    await sql()`UPDATE orders SET status = 'paid', updated_at = now()
      WHERE stripe_session_id = ${session.id} AND status = 'pending_payment'`;
  }
  res.json({ ok: true, paid: session.payment_status === 'paid' });
});
