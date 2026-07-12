import { requireAdmin } from '../_lib/session.js';
import { readRepoFile, writeRepoFile } from '../_lib/github.js';
import { handler, bad } from '../_lib/util.js';

const FILES = { products: 'content/products.json', site: 'content/site.json' };

/* GET  ?file=products|site  → current content at the repo HEAD (not the
   deployed snapshot, so consecutive edits never overwrite each other).
   PUT  { file, data }       → validates and commits; Vercel redeploys. */
export default handler(['GET', 'PUT'], async (req, res) => {
  requireAdmin(req);

  if (req.method === 'GET') {
    const path = FILES[req.query.file];
    if (!path) throw bad('Unknown content file.');
    const { content } = await readRepoFile(path);
    return res.json({ data: JSON.parse(content.toString('utf8')) });
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
});
