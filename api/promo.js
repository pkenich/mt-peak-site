import { ensureSchema, checkThrottle, recordFailure } from './_lib/db.js';
import { requireCustomer } from './_lib/session.js';
import { normCode, isCode, lookupPromo, discountFor } from './_lib/promo.js';
import { handler, bad } from './_lib/util.js';

/* POST { code, subtotalPence } → { code, discountPence, description }
   Preview only — nothing is consumed until checkout places the order.
   Sign-in required + per-user throttle so codes can't be enumerated. */
export default handler(['POST'], async (req, res) => {
  await ensureSchema();
  const user = requireCustomer(req);
  const code = normCode(req.body?.code);
  const subtotal = Math.floor(Number(req.body?.subtotalPence));
  if (!isCode(code)) throw bad('Enter a promo code.');
  if (!Number.isFinite(subtotal) || subtotal < 0) throw bad('Bad subtotal.');

  const key = `promo:${user.uid}`;
  await checkThrottle(key);
  let promo;
  try {
    promo = await lookupPromo(code);
  } catch (e) {
    await recordFailure(key);
    throw e;
  }
  const discountPence = discountFor(promo, subtotal);
  res.json({
    code: promo.code,
    discountPence,
    description: promo.kind === 'percent' ? `${promo.value}% off` : `£${(promo.value / 100).toFixed(0)} off`,
  });
});
