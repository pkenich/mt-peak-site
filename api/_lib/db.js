import { neon } from '@neondatabase/serverless';

let _sql = null;
let _ready = null;

export function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      const err = new Error('DATABASE_URL is not configured — provision a Postgres database (Vercel dashboard → Storage → Neon) first.');
      err.statusCode = 503;
      throw err;
    }
    _sql = neon(url);
  }
  return _sql;
}

/* Idempotent, lazy schema bootstrap: runs once per function instance,
   self-heals a fresh database with no manual migration step. */
export function ensureSchema() {
  if (!_ready) {
    const q = sql();
    _ready = (async () => {
      await q`CREATE TABLE IF NOT EXISTS users (
        id bigserial PRIMARY KEY,
        email text UNIQUE NOT NULL,
        name text NOT NULL,
        pass_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await q`CREATE TABLE IF NOT EXISTS orders (
        id bigserial PRIMARY KEY,
        public_id text UNIQUE NOT NULL,
        user_id bigint REFERENCES users(id),
        email text NOT NULL,
        items jsonb NOT NULL,
        total_pence int NOT NULL,
        currency text NOT NULL DEFAULT 'GBP',
        status text NOT NULL DEFAULT 'reserved',
        stripe_session_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await q`CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id)`;
      await q`CREATE TABLE IF NOT EXISTS throttle (
        key text PRIMARY KEY,
        fails int NOT NULL DEFAULT 0,
        locked_until timestamptz
      )`;
      await q`CREATE TABLE IF NOT EXISTS promos (
        code text PRIMARY KEY,
        kind text NOT NULL,             -- 'percent' | 'fixed'
        value int NOT NULL,             -- percent (1-90) or pence
        max_uses int,                   -- NULL = universal/unlimited
        uses int NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await q`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping jsonb`;
      await q`ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing jsonb`;
      await q`ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code text`;
      await q`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_pence int NOT NULL DEFAULT 0`;
      await q`ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_note text`;
      await q`CREATE TABLE IF NOT EXISTS subscribers (
        email text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await q`ALTER TABLE users ADD COLUMN IF NOT EXISTS addresses jsonb NOT NULL DEFAULT '[]'`;
      await q`CREATE TABLE IF NOT EXISTS reviews (
        order_id bigint PRIMARY KEY REFERENCES orders(id),
        user_id bigint NOT NULL REFERENCES users(id),
        rating int NOT NULL,
        shipping_rating int,
        body text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await q`CREATE TABLE IF NOT EXISTS refunds (
        id bigserial PRIMARY KEY,
        order_id bigint NOT NULL REFERENCES orders(id),
        user_id bigint NOT NULL REFERENCES users(id),
        reason text NOT NULL,
        status text NOT NULL DEFAULT 'requested',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await q`CREATE INDEX IF NOT EXISTS refunds_order_idx ON refunds(order_id)`;
      await q`CREATE TABLE IF NOT EXISTS stock_notify (
        slug text NOT NULL,
        email text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (slug, email)
      )`;
      // Saved carts for abandoned-cart reminders. One live cart per email;
      // any change resets the reminder clocks (reminded_* / recovered_at).
      await q`CREATE TABLE IF NOT EXISTS carts (
        email text PRIMARY KEY,
        user_id bigint,
        items jsonb NOT NULL,
        subtotal_pence int NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        reminded_24h timestamptz,
        reminded_1mo timestamptz,
        recovered_at timestamptz
      )`;
      await q`CREATE INDEX IF NOT EXISTS carts_sweep_idx ON carts(updated_at) WHERE recovered_at IS NULL`;
      // Privacy & consent (see /privacy): bag reminders are opt-in, every
      // marketing email can be unsubscribed from, and data requests are tracked.
      await q`ALTER TABLE users ADD COLUMN IF NOT EXISTS reminders_opt_in boolean NOT NULL DEFAULT false`;
      await q`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz`;
      await q`CREATE TABLE IF NOT EXISTS email_optouts (
        email text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await q`CREATE TABLE IF NOT EXISTS data_requests (
        id bigserial PRIMARY KEY,
        email text NOT NULL,
        kind text NOT NULL,
        note text,
        status text NOT NULL DEFAULT 'open',
        created_at timestamptz NOT NULL DEFAULT now(),
        resolved_at timestamptz
      )`;
      // account deletion keeps tax-required order/refund records but detaches the person
      await q`ALTER TABLE refunds ALTER COLUMN user_id DROP NOT NULL`;
      await q`ALTER TABLE throttle ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`;
      // admin two-factor: single-use emailed codes (hash only, never the code)
      await q`CREATE TABLE IF NOT EXISTS admin_otp (
        id bigserial PRIMARY KEY,
        code_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        attempts int NOT NULL DEFAULT 0,
        used_at timestamptz,
        ip text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      // fixed-window rate limits (abuse control: checkout spam, credential spraying)
      await q`CREATE TABLE IF NOT EXISTS rate (
        key text PRIMARY KEY,
        count int NOT NULL DEFAULT 0,
        window_start timestamptz NOT NULL DEFAULT now()
      )`;
    })().catch(e => { _ready = null; throw e; });
  }
  return _ready;
}

/* Simple credential throttle: 8 failures locks the key for 15 minutes.
   An expired lock deletes the row, so the counter starts fresh — otherwise
   one failure after an old lockout would re-lock immediately, forever. */
export async function checkThrottle(key) {
  const q = sql();
  const rows = await q`SELECT locked_until FROM throttle WHERE key = ${key}`;
  const until = rows[0]?.locked_until && new Date(rows[0].locked_until);
  if (until && until > new Date()) {
    const err = new Error('Too many attempts. Try again in a few minutes.');
    err.statusCode = 429;
    throw err;
  }
  if (until) await q`DELETE FROM throttle WHERE key = ${key}`;
}

export async function recordFailure(key) {
  const q = sql();
  await q`INSERT INTO throttle (key, fails) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET
      fails = throttle.fails + 1, updated_at = now(),
      locked_until = CASE WHEN throttle.fails + 1 >= 8
        THEN now() + interval '15 minutes' ELSE throttle.locked_until END`;
}

export async function clearThrottle(key) {
  await sql()`DELETE FROM throttle WHERE key = ${key}`;
}

/* Fixed-window rate limit: at most `max` calls per `windowSec` for `key`.
   Unlike checkThrottle (which counts failures), this counts every call —
   used where each call has a cost (emails sent, orders created). */
export async function rateLimit(key, max, windowSec) {
  const rows = await sql()`INSERT INTO rate (key, count, window_start) VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate.window_start < now() - make_interval(secs => ${windowSec}) THEN 1 ELSE rate.count + 1 END,
      window_start = CASE WHEN rate.window_start < now() - make_interval(secs => ${windowSec}) THEN now() ELSE rate.window_start END
    RETURNING count`;
  if (Number(rows[0]?.count) > max) {
    const err = new Error('Too many requests — please wait a little and try again.');
    err.statusCode = 429;
    throw err;
  }
}
