/* Wraps a handler with method enforcement and uniform error responses. */
export function handler(methods, fn) {
  return async (req, res) => {
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
      await fn(req, res);
    } catch (e) {
      const code = e.statusCode || 500;
      if (code === 500) console.error(e);
      res.status(code).json({ error: code === 500 ? 'Something went wrong on our side.' : e.message });
    }
  };
}

export function bad(message, code = 400) {
  const e = new Error(message);
  e.statusCode = code;
  return e;
}

export const normEmail = (s) => String(s || '').trim().toLowerCase();
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;

export function publicOrderId() {
  // unambiguous alphabet (no 0/O/1/I)
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) s += alpha[b % alpha.length];
  return `MP-${s}`;
}
