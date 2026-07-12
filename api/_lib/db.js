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
      fails = throttle.fails + 1,
      locked_until = CASE WHEN throttle.fails + 1 >= 8
        THEN now() + interval '15 minutes' ELSE throttle.locked_until END`;
}

export async function clearThrottle(key) {
  await sql()`DELETE FROM throttle WHERE key = ${key}`;
}
