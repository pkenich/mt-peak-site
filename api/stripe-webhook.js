import { sql, ensureSchema } from './_lib/db.js';
import { handler } from './_lib/util.js';

/* Stripe webhook (optional — stripe-confirm covers the happy path).
   The payload is never trusted: we take only the session id from it and
   re-fetch the session from Stripe's API before touching the order. */
export default handler(['POST'], async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return res.status(503).json({ error: 'Payments not configured' });

  const type = req.body?.type;
  const sessionId = req.body?.data?.object?.id;
  if (type !== 'checkout.session.completed' || !/^cs_[A-Za-z0-9_]+$/.test(sessionId || '')) {
    return res.json({ received: true });
  }

  await ensureSchema();
  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(stripeKey);
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status === 'paid') {
    await sql()`UPDATE orders SET status = 'paid', updated_at = now()
      WHERE stripe_session_id = ${session.id} AND status = 'pending_payment'`;
  }
  res.json({ received: true });
});
