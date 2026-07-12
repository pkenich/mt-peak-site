#!/usr/bin/env node
/* MT. PEAK static build: renders templates/ + content/*.json into public/.
   Zero dependencies — a ~60-line mustache subset:
     {{path.to.key}}   escaped interpolation
     {{{path}}}        raw interpolation
     {{#each path}}    loop (scope pushes each item; {{this}}, {{@index}})
     {{#if path}}      truthy conditional
     {{> name}}        partial from templates/partials/<name>.html            */
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'public');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function lookup(scopes, path) {
  if (path === 'this') return scopes[scopes.length - 1];
  for (let i = scopes.length - 1; i >= 0; i--) {
    let v = scopes[i];
    for (const part of path.split('.')) {
      if (v == null) break;
      v = v[part];
    }
    if (v !== undefined) return v;
  }
  return undefined;
}

const partials = {};
for (const f of readdirSync(join(ROOT, 'templates/partials'))) {
  partials[f.replace(/\.html$/, '')] = readFileSync(join(ROOT, 'templates/partials', f), 'utf8');
}

/* Tokenize → AST → render, so blocks nest correctly (regex replacement
   mispairs closers when the same block type nests inside itself). */
const TOKEN = /(\{\{\{[\w.@]+\}\}\}|\{\{[#\/>]?[^}]*?\}\})/;

function parse(tokens, pos, closeTag) {
  const nodes = [];
  while (pos < tokens.length) {
    const t = tokens[pos];
    const block = /^\{\{#(each|if) ([\w.@]+)\}\}$/.exec(t);
    const close = /^\{\{\/(each|if)\}\}$/.exec(t);
    if (close) {
      if (close[1] !== closeTag) throw new Error(`mismatched {{/${close[1]}}}`);
      return [nodes, pos + 1];
    }
    if (block) {
      const [children, next] = parse(tokens, pos + 1, block[1]);
      nodes.push({ kind: block[1], path: block[2], children });
      pos = next;
      continue;
    }
    let m;
    if ((m = /^\{\{> ([\w-]+)\}\}$/.exec(t))) nodes.push({ kind: 'partial', name: m[1] });
    else if ((m = /^\{\{\{([\w.@]+)\}\}\}$/.exec(t))) nodes.push({ kind: 'raw', path: m[1] });
    else if ((m = /^\{\{([\w.@]+)\}\}$/.exec(t))) nodes.push({ kind: 'esc', path: m[1] });
    else nodes.push({ kind: 'text', text: t });
    pos++;
  }
  if (closeTag) throw new Error(`unclosed {{#${closeTag}}}`);
  return [nodes, pos];
}

const astCache = new Map();
function toAst(tpl) {
  if (!astCache.has(tpl)) astCache.set(tpl, parse(tpl.split(TOKEN), 0, null)[0]);
  return astCache.get(tpl);
}

function renderNodes(nodes, scopes) {
  let out = '';
  for (const n of nodes) {
    switch (n.kind) {
      case 'text': out += n.text; break;
      case 'esc': { const v = lookup(scopes, n.path); out += v == null ? '' : esc(v); break; }
      case 'raw': { const v = lookup(scopes, n.path); out += v == null ? '' : String(v); break; }
      case 'partial':
        if (!partials[n.name]) throw new Error(`unknown partial: ${n.name}`);
        out += renderNodes(toAst(partials[n.name]), scopes);
        break;
      case 'if': { const v = lookup(scopes, n.path); if (v) out += renderNodes(n.children, scopes); break; }
      case 'each': {
        const v = lookup(scopes, n.path);
        if (Array.isArray(v)) {
          v.forEach((item, i) => {
            out += renderNodes(n.children, [...scopes, { '@index': i, '@num': String(i + 1).padStart(2, '0') }, item]);
          });
        }
        break;
      }
    }
  }
  return out;
}

const render = (tpl, scopes) => renderNodes(toAst(tpl), scopes);

const site = JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8'));
const productsMap = JSON.parse(readFileSync(join(ROOT, 'content/products.json'), 'utf8'));

// derived fields the templates rely on
const products = Object.values(productsMap).sort((a, b) => a.num.localeCompare(b.num));
for (const p of products) {
  p.gallery = p.gallery.map((g, i) => ({ ...g, active: i === 0, isImg: g.type === 'img', isPh: g.type === 'ph' }));
  p.url = `${site.siteUrl}/${p.slug}`;
  p.ogImage = `${site.siteUrl}${p.heroImage}`;
}

const page = (name) => readFileSync(join(ROOT, 'templates', name), 'utf8');
mkdirSync(OUT, { recursive: true });

const emit = (file, html) => { writeFileSync(join(OUT, file), html); console.log('built', file); };

emit('index.html', render(page('index.html'), [{ site, products,
  pageTitle: site.title, pageDesc: site.metaDesc, pageUrl: site.siteUrl, ogImage: `${site.siteUrl}/assets/tea-giftset.webp` }]));

const pdpTpl = page('pdp.html');
for (const p of products) {
  emit(`${p.slug}.html`, render(pdpTpl, [{ site, p,
    pageTitle: p.title, pageDesc: p.metaDesc, pageUrl: p.url, ogImage: p.ogImage }]));
}

for (const name of ['login', 'account', 'track', 'admin', '404']) {
  emit(`${name}.html`, render(page(`${name}.html`), [{ site,
    pageTitle: `${site.brand} — ${name === '404' ? 'Not Found' : name[0].toUpperCase() + name.slice(1)}`,
    pageDesc: site.metaDesc, pageUrl: `${site.siteUrl}/${name}`, ogImage: `${site.siteUrl}/assets/tea-giftset.webp` }]));
}

for (const dir of ['css', 'js', 'assets']) cpSync(join(ROOT, dir), join(OUT, dir), { recursive: true });

writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${site.siteUrl}/sitemap.xml\n`);
writeFileSync(join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  ['', ...products.map(p => p.slug)].map(s => `  <url><loc>${site.siteUrl}/${s}</loc></url>`).join('\n') +
  `\n</urlset>\n`);
console.log('build complete');
