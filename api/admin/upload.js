import { requireAdmin } from '../_lib/session.js';
import { writeRepoFile } from '../_lib/github.js';
import { handler, bad } from '../_lib/util.js';

const MAX_BYTES = 3 * 1024 * 1024; // stay under Vercel's request body cap
const MAGIC = {
  webp: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  png:  (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47,
  jpg:  (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};

/* POST { filename, data } (base64) → commits the image to assets/ in the repo.
   The next build serves it at /assets/<filename>; reference it from a
   product's gallery or heroImage. */
export default handler(['POST'], async (req, res) => {
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
});
