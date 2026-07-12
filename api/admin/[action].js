import { createHash, timingSafeEqual } from 'node:crypto';
import { sql, ensureSchema, checkThrottle, recordFailure, clearThrottle } from '../_lib/db.js';
import { issueAdmin, readAdmin, clearAdmin, requireAdmin } from '../_lib/session.js';
import { readRepoFile, writeRepoFile } from '../_lib/github.js';
import { dispatch, bad } from '../_lib/util.js';

/* ---------- session ---------- */

async function login(req, res) {
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
}

/* ---------- git-backed CMS ---------- */

const FILES = { products: 'content/products.json', site: 'content/site.json' };

/* GET  ?file=products|site  → current content at the repo HEAD (not the
   deployed snapshot, so consecutive edits never overwrite each other).
   PUT  { file, data }       → validates and commits; Vercel redeploys. */
async function content(req, res) {
  requireAdmin(req);

  if (req.method === 'GET') {
    const path = FILES[req.query.file];
    if (!path) throw bad('Unknown content file.');
    const { content: buf } = await readRepoFile(path);
    return res.json({ data: JSON.parse(buf.toString('utf8')) });
  }

  const path = FILES[req.body?.file];
  if (!path) throw bad('Unknown content file.');
  const data = req.body?.data;
  if (!data || typeof data !== 'object') throw bad('No content supplied.');

  if (req.body.file === 'products') {
    for (const [slug, p] of Object.entries(data)) {
      if (p.slug !== slug) throw bad(`Product "${slug}": slug mismatch.`);
      if (typeof p.name !== 'string' || !p.name.trim()) throw bad(`Product "${slug}": name is required.`);
      if (!Number.isInteger(p.price) || p.price < 1 || p.price > 10000) throw bad(`Product "${slug}": price must be a whole number of pounds.`);
      if (!Array.isArray(p.gallery)) throw bad(`Product "${slug}": gallery must be a list.`);
    }
  }

  const body = Buffer.from(JSON.stringify(data, null, 2) + '\n');
  const commit = await writeRepoFile(path, body, `cms: update ${req.body.file} content`);
  res.json({ ok: true, commit: commit.commit?.sha?.slice(0, 7) });
}

const MAX_BYTES = 3 * 1024 * 1024; // stay under Vercel's request body cap
const MAGIC = {
  webp: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  png:  (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47,
  jpg:  (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};

/* POST { filename, data } (base64) → commits the image to assets/ in the repo.
   The next build serves it at /assets/<filename>. */
async function upload(req, res) {
  requireAdmin(req);

  const raw = String(req.body?.filename || '');
  const name = raw.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  const ext = name.split('.').pop();
  if (!name || name.startsWith('.') || name.includes('..')) throw bad('Bad file name.');
  if (!['webp', 'png', 'jpg', 'jpeg'].includes(ext)) throw bad('Images only: .webp, .png or .jpg.');

  let buf;
  try { buf = Buffer.from(String(req.body?.data || ''), 'base64'); } catch { throw bad('Bad image data.'); }
  if (!buf.length) throw bad('Empty upload.');
  if (buf.length > MAX_BYTES) throw bad('Image too large — keep uploads under 3MB (WebP recommended).');
  const kind = ext === 'jpeg' ? 'jpg' : ext;
  if (!MAGIC[kind](buf)) throw bad('File content doesn’t match its extension.');

  const commit = await writeRepoFile(`assets/${name}`, buf, `cms: upload asset ${name}`);
  res.json({ ok: true, path: `/assets/${name}`, commit: commit.commit?.sha?.slice(0, 7) });
}

/* ---------- sales & orders ---------- */

const ORDER_STATUSES = ['reserved', 'pending_payment', 'paid', 'fulfilled', 'cancelled'];

async function orders(req, res) {
  requireAdmin(req);
  await ensureSchema();
  const q = sql();
  const [rows, stats, daily, products] = await Promise.all([
    q`SELECT public_id, email, items, total_pence, status, created_at
      FROM orders ORDER BY created_at DESC LIMIT 200`,
    q`SELECT
        count(*)::int AS orders,
        count(*) FILTER (WHERE status IN ('paid','fulfilled'))::int AS paid_orders,
        coalesce(sum(total_pence) FILTER (WHERE status IN ('paid','fulfilled')), 0)::int AS revenue_pence,
        coalesce(sum(total_pence) FILTER (WHERE status IN ('paid','fulfilled')
          AND created_at > now() - interval '7 days'), 0)::int AS revenue_7d_pence,
        coalesce(sum(total_pence) FILTER (WHERE status IN ('reserved','pending_payment')), 0)::int AS awaiting_pence,
        count(*) FILTER (WHERE status IN ('reserved','pending_payment'))::int AS open_orders,
        count(DISTINCT email)::int AS customers
      FROM orders`,
    q`SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
        coalesce(sum(total_pence) FILTER (WHERE status IN ('paid','fulfilled')), 0)::int AS revenue_pence,
        count(*)::int AS orders
      FROM orders WHERE created_at > now() - interval '30 days'
      GROUP BY 1 ORDER BY 1`,
    q`SELECT l->>'name' AS name,
        sum((l->>'qty')::int)::int AS qty,
        sum((l->>'unitPence')::int * (l->>'qty')::int)::int AS revenue_pence
      FROM orders, jsonb_array_elements(items) AS l
      WHERE status IN ('paid','fulfilled')
      GROUP BY 1 ORDER BY 3 DESC LIMIT 6`,
  ]);
  res.json({ orders: rows, stats: stats[0], daily, products });
}

async function orderStatus(req, res) {
  requireAdmin(req);
  await ensureSchema();
  const publicId = String(req.body?.publicId || '').toUpperCase();
  const status = String(req.body?.status || '');
  if (!/^MP-[A-Z2-9]{6}$/.test(publicId)) throw bad('Bad order number.');
  if (!ORDER_STATUSES.includes(status)) throw bad('Bad status.');
  const rows = await sql()`UPDATE orders SET status = ${status}, updated_at = now()
    WHERE public_id = ${publicId} AND status <> ${status}
    RETURNING public_id, email, items, total_pence`;
  if (!rows.length) {
    const exists = await sql()`SELECT 1 FROM orders WHERE public_id = ${publicId}`;
    if (!exists.length) throw bad('Order not found.', 404);
    return res.json({ ok: true, unchanged: true });
  }
  // customers hear about meaningful transitions only
  if (['paid', 'fulfilled', 'cancelled'].includes(status)) await sendOrderEmail(rows[0], status);
  res.json({ ok: true });
}

export default dispatch({
  login: { methods: ['POST'], fn: login },
  logout: { methods: ['POST'], fn: async (req, res) => { clearAdmin(res); res.json({ ok: true }); } },
  me: { methods: ['GET'], fn: async (req, res) => { res.json({ admin: !!readAdmin(req) }); } },
  content: { methods: ['GET', 'PUT'], fn: content },
  upload: { methods: ['POST'], fn: upload },
  orders: { methods: ['GET'], fn: orders },
  'order-status': { methods: ['PUT'], fn: orderStatus },
});
