import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { sql, ensureSchema, checkThrottle, recordFailure, clearThrottle } from '../_lib/db.js';
import { issueCustomer, readCustomer, clearCustomer, signToken, verifyToken } from '../_lib/session.js';
import { sendBrandEmail } from '../_lib/email.js';
import { dispatch, bad, normEmail, isEmail } from '../_lib/util.js';

const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

async function register(req, res) {
  await ensureSchema();
  // per-IP throttle keeps bots from mass-creating accounts
  const ipKey = `reg:${clientIp(req)}`;
  await checkThrottle(ipKey);
  await recordFailure(ipKey);
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

/* Reset tokens are stateless: signed, 1-hour expiry, and bound to a hash of
   the current password hash — changing the password (or using the link once)
   invalidates it. The response never reveals whether the email exists. */
const passFingerprint = (hash) => createHash('sha256').update(hash).digest('base64url').slice(0, 16);

async function requestReset(req, res) {
  await ensureSchema();
  const ipKey = `reset:${clientIp(req)}`;
  await checkThrottle(ipKey);
  await recordFailure(ipKey);
  const email = normEmail(req.body?.email);
  if (!isEmail(email)) throw bad('Enter your email address.');
  const rows = await sql()`SELECT id, pass_hash FROM users WHERE email = ${email}`;
  if (rows.length) {
    const token = signToken({ uid: rows[0].id, fp: passFingerprint(rows[0].pass_hash) }, 3600);
    const siteUrl = process.env.SITE_URL || 'https://mt-peak-site.vercel.app';
    await sendBrandEmail({
      to: email,
      subject: 'Reset your Mt. Peak password',
      heading: 'Choose a new password',
      message: 'Someone (hopefully you) asked to reset the password for this address. The link below is good for one hour and one use. If this wasn’t you, simply ignore this email.',
      ctaLabel: 'RESET PASSWORD',
      ctaUrl: `${siteUrl}/reset?token=${encodeURIComponent(token)}`,
    });
  }
  res.json({ ok: true }); // same answer either way
}

async function resetPassword(req, res) {
  await ensureSchema();
  const payload = verifyToken(req.body?.token);
  if (!payload?.uid) throw bad('That reset link is invalid or has expired — request a new one.', 400);
  const password = String(req.body?.password || '');
  if (password.length < 8) throw bad('Password must be at least 8 characters.');
  const rows = await sql()`SELECT id, email, name, pass_hash FROM users WHERE id = ${payload.uid}`;
  if (!rows.length || passFingerprint(rows[0].pass_hash) !== payload.fp) {
    throw bad('That reset link has already been used — request a new one.', 400);
  }
  const hash = await bcrypt.hash(password, 11);
  await sql()`UPDATE users SET pass_hash = ${hash} WHERE id = ${payload.uid}`;
  await clearThrottle(`login:${rows[0].email}`);
  issueCustomer(res, rows[0]);
  res.json({ ok: true });
}

export default dispatch({
  register: { methods: ['POST'], fn: register },
  login: { methods: ['POST'], fn: login },
  'request-reset': { methods: ['POST'], fn: requestReset },
  reset: { methods: ['POST'], fn: resetPassword },
  logout: { methods: ['POST'], fn: async (req, res) => { clearCustomer(res); res.json({ ok: true }); } },
  me: { methods: ['GET'], fn: async (req, res) => {
    const s = readCustomer(req);
    res.json(s ? { user: { email: s.email, name: s.name } } : { user: null });
  } },
});
