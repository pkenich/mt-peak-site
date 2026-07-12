import { sql } from './db.js';
import { bad } from './util.js';

export const normCode = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
export const isCode = (s) => /^[A-Z0-9-]{3,24}$/.test(s);

export function discountFor(promo, subtotalPence) {
  const raw = promo.kind === 'percent'
    ? Math.floor(subtotalPence * promo.value / 100)
    : promo.value;
  return Math.max(0, Math.min(raw, subtotalPence));
}

/* Read-only check (does not consume a use). Throws a friendly 404/410. */
export async function lookupPromo(code) {
  const rows = await sql()`SELECT code, kind, value, max_uses, uses, active
    FROM promos WHERE code = ${code}`;
  const p = rows[0];
  if (!p || !p.active) throw bad('That code isn’t valid.', 404);
  if (p.max_uses !== null && p.uses >= p.max_uses) throw bad('That code has already been used.', 410);
  return p;
}

/* Atomically consume one use; the WHERE clause makes redemption race-safe.
   Returns the promo row or throws. */
export async function redeemPromo(code) {
  const rows = await sql()`UPDATE promos SET uses = uses + 1
    WHERE code = ${code} AND active AND (max_uses IS NULL OR uses < max_uses)
    RETURNING code, kind, value`;
  if (!rows.length) throw bad('That promo code isn’t valid or has been used up.', 410);
  return rows[0];
}

export async function releasePromo(code) {
  // best-effort compensation when order creation fails after redemption
  try { await sql()`UPDATE promos SET uses = greatest(uses - 1, 0) WHERE code = ${code}`; }
  catch { /* the failed-order path already reports; don't mask it */ }
}
