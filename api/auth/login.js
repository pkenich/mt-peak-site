import bcrypt from 'bcryptjs';
import { sql, ensureSchema, checkThrottle, recordFailure, clearThrottle } from '../_lib/db.js';
import { issueCustomer } from '../_lib/session.js';
import { handler, bad, normEmail, isEmail } from '../_lib/util.js';

export default handler(['POST'], async (req, res) => {
  await ensureSchema();
  const email = normEmail(req.body?.email);
  const password = String(req.body?.password || '');
  if (!isEmail(email) || !password) throw bad('Enter your email and password.');

  const key = `login:${email}`;
  await checkThrottle(key);

  const rows = await sql()`SELECT id, email, name, pass_hash FROM users WHERE email = ${email}`;
  const ok = rows.length && await bcrypt.compare(password, rows[0].pass_hash);
  if (!ok) {
    await recordFailure(key);
    throw bad('Email or password is incorrect.', 401);
  }

  await clearThrottle(key);
  issueCustomer(res, rows[0]);
  res.json({ ok: true, user: { email: rows[0].email, name: rows[0].name } });
});
