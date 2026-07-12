import { createHmac, timingSafeEqual } from 'node:crypto';

const CUSTOMER_COOKIE = 'mp_session';
const ADMIN_COOKIE = 'mp_admin';

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    const err = new Error('AUTH_SECRET is not configured (set a long random string in Vercel env vars).');
    err.statusCode = 503;
    throw err;
  }
  return s;
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, name, value, maxAgeSec) {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Secure'];
  parts.push(maxAgeSec > 0 ? `Max-Age=${maxAgeSec}` : 'Max-Age=0');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [prev] : []), parts.join('; ')]);
}

const WEEK = 7 * 24 * 3600;
const HALF_DAY = 12 * 3600;

export function issueCustomer(res, user) {
  setCookie(res, CUSTOMER_COOKIE, sign({ uid: user.id, email: user.email, name: user.name,
    exp: Math.floor(Date.now() / 1000) + WEEK }), WEEK);
}
export function readCustomer(req) { return verify(parseCookies(req)[CUSTOMER_COOKIE]); }
export function clearCustomer(res) { setCookie(res, CUSTOMER_COOKIE, '', 0); }

export function issueAdmin(res) {
  setCookie(res, ADMIN_COOKIE, sign({ role: 'admin',
    exp: Math.floor(Date.now() / 1000) + HALF_DAY }), HALF_DAY);
}
export function readAdmin(req) {
  const p = verify(parseCookies(req)[ADMIN_COOKIE]);
  return p?.role === 'admin' ? p : null;
}
export function clearAdmin(res) { setCookie(res, ADMIN_COOKIE, '', 0); }

export function requireCustomer(req) {
  const s = readCustomer(req);
  if (!s) { const e = new Error('Not signed in.'); e.statusCode = 401; throw e; }
  return s;
}
export function requireAdmin(req) {
  const s = readAdmin(req);
  if (!s) { const e = new Error('Admin authentication required.'); e.statusCode = 401; throw e; }
  return s;
}
