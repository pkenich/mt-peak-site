import { sql, ensureSchema } from '../_lib/db.js';
import { signToken } from '../_lib/session.js';
import { sendCartEmail } from '../_lib/email.js';

/* Daily abandoned-cart sweep (Vercel Cron → see vercel.json "crons").
   Two nudges per abandoned cart: one ~24h after it went quiet, one ~30 days
   after. Each send is recorded so it never repeats; any edit to the cart
   (see save-cart) clears these clocks and restarts the cycle.

   Auth: requires CRON_SECRET (Vercel sends it as a Bearer token). */
export default async function handler(req, res) {
  // Fail closed: without CRON_SECRET anyone could trigger email sends/purges.
  // Vercel automatically sends `Authorization: Bearer $CRON_SECRET` once it's set.
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET is not configured.' });
  if ((req.headers.authorization || '') !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

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
      AND EXISTS (SELECT 1 FROM users u WHERE u.email = carts.email AND u.reminders_opt_in)
      AND NOT EXISTS (SELECT 1 FROM email_optouts e WHERE e.email = carts.email)
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
      AND EXISTS (SELECT 1 FROM users u WHERE u.email = carts.email AND u.reminders_opt_in)
      AND NOT EXISTS (SELECT 1 FROM email_optouts e WHERE e.email = carts.email)
    ORDER BY updated_at ASC LIMIT 100`;
  for (const c of due30) {
    const r = await sendCartEmail(c, '1mo', restoreUrl(c.email));
    if (r.ok) { await q`UPDATE carts SET reminded_1mo = now() WHERE email = ${c.email}`; result['1mo'].sent++; }
    else result['1mo'].failed++;
  }

  // ---- retention (promised in /privacy) ----
  const purged = {};
  const purge = async (label, query) => { try { purged[label] = (await query).length; } catch (e) { console.error('purge', label, e); } };
  await purge('rate', q`DELETE FROM rate WHERE window_start < now() - interval '24 hours' RETURNING key`);
  await purge('throttle', q`DELETE FROM throttle WHERE updated_at < now() - interval '24 hours'
    AND (locked_until IS NULL OR locked_until < now()) RETURNING key`);
  await purge('carts', q`DELETE FROM carts WHERE updated_at < now() - interval '60 days' OR recovered_at IS NOT NULL RETURNING email`);
  await purge('stockNotify', q`DELETE FROM stock_notify WHERE created_at < now() - interval '12 months' RETURNING email`);
  await purge('dataRequests', q`DELETE FROM data_requests WHERE status = 'done' AND resolved_at < now() - interval '12 months' RETURNING id`);
  // orders older than the 6-year tax retention period (children first for FKs)
  await purge('oldReviews', q`DELETE FROM reviews WHERE order_id IN (SELECT id FROM orders WHERE created_at < now() - interval '6 years') RETURNING order_id`);
  await purge('oldRefunds', q`DELETE FROM refunds WHERE order_id IN (SELECT id FROM orders WHERE created_at < now() - interval '6 years') RETURNING id`);
  await purge('oldOrders', q`DELETE FROM orders WHERE created_at < now() - interval '6 years' RETURNING id`);

  res.json({ ok: true, ...result, purged });
}
