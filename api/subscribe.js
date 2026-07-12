import { sql, ensureSchema, checkThrottle, recordFailure } from './_lib/db.js';
import { handler, bad, normEmail, isEmail } from './_lib/util.js';

/* Newsletter capture from the footer. Idempotent; throttled per IP. */
export default handler(['POST'], async (req, res) => {
  await ensureSchema();
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  await checkThrottle(`sub:${ip}`);
  await recordFailure(`sub:${ip}`);
  const email = normEmail(req.body?.email);
  if (!isEmail(email)) throw bad('That email address doesn’t look right.');
  await sql()`INSERT INTO subscribers (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;
  res.status(201).json({ ok: true });
});
