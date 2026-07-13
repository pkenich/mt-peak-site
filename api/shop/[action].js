import { sql, ensureSchema, checkThrottle, recordFailure } from '../_lib/db.js';
import { dispatch, bad, normEmail, isEmail } from '../_lib/util.js';

const slugRe = /^[a-z0-9-]{1,60}$/;

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

export default dispatch({
  reviews: { methods: ['GET'], fn: reviews },
  'notify-stock': { methods: ['POST'], fn: notifyStock },
});
