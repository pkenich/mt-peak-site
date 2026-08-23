import { sql, ensureSchema } from '../_lib/db.js';
import { signToken } from '../_lib/session.js';
import { sendCartEmail } from '../_lib/email.js';

/* Daily abandoned-cart sweep (Vercel Cron → see vercel.json "crons").
   Two nudges per abandoned cart: one ~24h after it went quiet, one ~30 days
   after. Each send is recorded so it never repeats; any edit to the cart
   (see save-cart) clears these clocks and restarts the cycle.

   Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is
   set. We require it so the endpoint can't be triggered by the public. */
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (secret) {
    if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  } else if (req.query.key !== undefined || auth) {
    // no secret configured: allow Vercel's own invocation but nudge to set one
    console.warn('CRON_SECRET is not set — the reminder cron is unauthenticated.');
  }

  await ensureSchema();
  const q = sql();
  const siteUrl = process.env.SITE_URL || 'https://www.mtpeakofficial.com';
  const restoreUrl = (email) => `${siteUrl}/?restore=${encodeURIComponent(signToken({ cart: email }, 25 * 24 * 3600))}`;

  const result = { '24h': { sent: 0, failed: 0 }, '1mo': { sent: 0, failed: 0 } };

  // ---- 24h nudge: quiet for 24h, still within the first ~20 days ----
  const due24 = await q`SELECT email, items, subtotal_pence FROM carts
    WHERE recovered_at IS NULL AND reminded_24h IS NULL
      AND updated_at <= now() - interval '24 hours'
      AND updated_at >  now() - interval '20 days'
      AND jsonb_array_length(items) > 0
    ORDER BY updated_at ASC LIMIT 100`;
  for (const c of due24) {
    const r = await sendCartEmail(c, '24h', restoreUrl(c.email));
    if (r.ok) { await q`UPDATE carts SET reminded_24h = now() WHERE email = ${c.email}`; result['24h'].sent++; }
    else result['24h'].failed++;
  }

  // ---- 1-month nudge: quiet for 30+ days ----
  const due30 = await q`SELECT email, items, subtotal_pence FROM carts
    WHERE recovered_at IS NULL AND reminded_1mo IS NULL
      AND updated_at <= now() - interval '30 days'
      AND jsonb_array_length(items) > 0
    ORDER BY updated_at ASC LIMIT 100`;
  for (const c of due30) {
    const r = await sendCartEmail(c, '1mo', restoreUrl(c.email));
    if (r.ok) { await q`UPDATE carts SET reminded_1mo = now() WHERE email = ${c.email}`; result['1mo'].sent++; }
    else result['1mo'].failed++;
  }

  res.json({ ok: true, ...result });
}
