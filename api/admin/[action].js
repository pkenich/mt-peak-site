import { createHash, timingSafeEqual } from 'node:crypto';
import { ensureSchema, checkThrottle, recordFailure, clearThrottle } from '../_lib/db.js';
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

export default dispatch({
  login: { methods: ['POST'], fn: login },
  logout: { methods: ['POST'], fn: async (req, res) => { clearAdmin(res); res.json({ ok: true }); } },
  me: { methods: ['GET'], fn: async (req, res) => { res.json({ admin: !!readAdmin(req) }); } },
  content: { methods: ['GET', 'PUT'], fn: content },
  upload: { methods: ['POST'], fn: upload },
});
