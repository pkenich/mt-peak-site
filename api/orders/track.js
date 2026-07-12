import { sql, ensureSchema, checkThrottle, recordFailure } from '../_lib/db.js';
import { handler, bad, normEmail, isEmail } from '../_lib/util.js';

/* Public lookup: order number + the email used at checkout.
   Throttled per order number so it can't be used to fish for emails. */
export default handler(['POST'], async (req, res) => {
  await ensureSchema();
  const publicId = String(req.body?.orderId || '').trim().toUpperCase();
  const email = normEmail(req.body?.email);
  if (!/^MP-[A-Z2-9]{6}$/.test(publicId) || !isEmail(email)) throw bad('Enter your order number (MP-XXXXXX) and email.');

  const key = `track:${publicId}`;
  await checkThrottle(key);

  const rows = await sql()`
    SELECT public_id, items, total_pence, currency, status, created_at
    FROM orders WHERE public_id = ${publicId} AND email = ${email}`;
  if (!rows.length) {
    await recordFailure(key);
    throw bad('No order found for that number and email.', 404);
  }
  res.json({ order: rows[0] });
});
