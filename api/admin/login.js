import { createHash, timingSafeEqual } from 'node:crypto';
import { ensureSchema, checkThrottle, recordFailure, clearThrottle } from '../_lib/db.js';
import { issueAdmin } from '../_lib/session.js';
import { handler, bad } from '../_lib/util.js';

export default handler(['POST'], async (req, res) => {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected.length < 12) {
    throw bad('ADMIN_PASSWORD is not configured (set a 12+ character password in Vercel env vars).', 503);
  }

  // Throttle via the DB when it exists; don't let a missing DB lock out the CMS.
  let throttled = false;
  try { await ensureSchema(); await checkThrottle('admin:login'); throttled = true; }
  catch (e) { if (e.statusCode === 429) throw e; }

  const given = String(req.body?.password || '');
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  if (!timingSafeEqual(a, b)) {
    if (throttled) await recordFailure('admin:login');
    throw bad('Wrong password.', 401);
  }

  if (throttled) await clearThrottle('admin:login');
  issueAdmin(res);
  res.json({ ok: true });
});
