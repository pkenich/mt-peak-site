import bcrypt from 'bcryptjs';
import { sql, ensureSchema, checkThrottle, recordFailure, clearThrottle } from '../_lib/db.js';
import { issueCustomer, readCustomer, clearCustomer } from '../_lib/session.js';
import { dispatch, bad, normEmail, isEmail } from '../_lib/util.js';

async function register(req, res) {
  await ensureSchema();
  const { name, email: rawEmail, password } = req.body || {};
  const email = normEmail(rawEmail);
  if (!name || String(name).trim().length < 1 || String(name).length > 80) throw bad('Please give us a name.');
  if (!isEmail(email)) throw bad('That email address doesn’t look right.');
  if (!password || String(password).length < 8) throw bad('Password must be at least 8 characters.');

  const hash = await bcrypt.hash(String(password), 11);
  const rows = await sql()`
    INSERT INTO users (email, name, pass_hash) VALUES (${email}, ${String(name).trim()}, ${hash})
    ON CONFLICT (email) DO NOTHING
    RETURNING id, email, name`;
  if (!rows.length) throw bad('An account with that email already exists — sign in instead.', 409);

  issueCustomer(res, rows[0]);
  res.status(201).json({ ok: true, user: { email: rows[0].email, name: rows[0].name } });
}

async function login(req, res) {
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
}

export default dispatch({
  register: { methods: ['POST'], fn: register },
  login: { methods: ['POST'], fn: login },
  logout: { methods: ['POST'], fn: async (req, res) => { clearCustomer(res); res.json({ ok: true }); } },
  me: { methods: ['GET'], fn: async (req, res) => {
    const s = readCustomer(req);
    res.json(s ? { user: { email: s.email, name: s.name } } : { user: null });
  } },
});
