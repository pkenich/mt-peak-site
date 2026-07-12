import bcrypt from 'bcryptjs';
import { sql, ensureSchema } from '../_lib/db.js';
import { issueCustomer } from '../_lib/session.js';
import { handler, bad, normEmail, isEmail } from '../_lib/util.js';

export default handler(['POST'], async (req, res) => {
  await ensureSchema();
  const { name, email: rawEmail, password } = req.body || {};
  const email = normEmail(rawEmail);
  if (!name || String(name).trim().length < 1 || String(name).length > 80) throw bad('Please give us a name.');
  if (!isEmail(email)) throw bad('That email address doesn’t look right.');
  if (!password || String(password).length < 8) throw bad('Password must be at least 8 characters.');

  const hash = await bcrypt.hash(String(password), 11);
  const q = sql();
  const rows = await q`
    INSERT INTO users (email, name, pass_hash) VALUES (${email}, ${String(name).trim()}, ${hash})
    ON CONFLICT (email) DO NOTHING
    RETURNING id, email, name`;
  if (!rows.length) throw bad('An account with that email already exists — sign in instead.', 409);

  issueCustomer(res, rows[0]);
  res.status(201).json({ ok: true, user: { email: rows[0].email, name: rows[0].name } });
});
