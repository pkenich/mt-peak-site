# MT. PEAK — D2C storefront

Production site for MT. PEAK, single-origin Himalayan tea. Static storefront
rendered at build time from JSON content, with serverless APIs for customer
accounts, orders, and a git-backed admin CMS.

**Live:** https://mt-peak-site.vercel.app · **Admin:** https://mt-peak-site.vercel.app/admin

## How it works

```
content/*.json ──build.js──▶ public/*.html   (static storefront)
templates/*.html ─┘
api/**            ──▶ /api/*                 (Vercel serverless functions)
```

- **Content** lives in `content/products.json` + `content/site.json`. `build.js`
  renders it through `templates/` into `public/` on every deploy. No framework.
- **Admin CMS** (`/admin`, password-gated): edits commit straight back to this
  repo via the GitHub API, which triggers a redeploy. Content history = git history.
- **Customers**: register/sign in (bcrypt + HMAC-signed cookies), see order
  history at `/account`; anyone can track an order at `/track` with order no. + email.
- **Checkout**: server-priced from the catalogue. With `STRIPE_SECRET_KEY` set it
  goes through Stripe Checkout; without it, orders are recorded as reservations.
- **Database**: Neon Postgres (users, orders, throttle). Schema bootstraps itself
  on first use — no migration step.

## One-time setup (Vercel dashboard)

1. **Connect the repo**: Project → Settings → Git → connect `pkenich/mt-peak-site`.
   Every push to `main` then auto-deploys. (Only after this, make the repo private.)
2. **Database**: Project → Storage → Create → **Neon** (free tier). This injects
   `DATABASE_URL` automatically.
3. **Environment variables** (Project → Settings → Environment Variables):
   | Name | Value |
   |---|---|
   | `AUTH_SECRET` | long random string (32+ chars) — sign-in cookies |
   | `ADMIN_PASSWORD` | 12+ chars — the `/admin` password |
   | `GITHUB_TOKEN` | fine-grained PAT, repo `mt-peak-site`, **Contents: Read & write** — lets the CMS commit |
   | `SITE_URL` | `https://mt-peak-site.vercel.app` |
   | `STRIPE_SECRET_KEY` | *(optional, later)* enables real payments |
4. Redeploy once after setting the variables.

## Local development

```bash
npm install
npm run build          # renders public/
npx serve public       # static preview (APIs need `vercel dev` + env vars)
```

## Repo map

| Path | What |
|---|---|
| `templates/` | HTML templates (`pdp.html` renders all three teas) + partials |
| `content/` | Editable content — what the admin panel writes |
| `assets/` `css/` `js/` | Static files, copied into the build |
| `api/` | Serverless functions (auth, orders, checkout, admin CMS) |
| `build.js` | 100-line template renderer, zero dependencies |

The original Claude Design handoff bundle is preserved on the
[`design-archive`](../../tree/design-archive) branch.
