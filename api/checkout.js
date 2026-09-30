import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql, ensureSchema, rateLimit } from './_lib/db.js';
import { readCustomer } from './_lib/session.js';
import { sendOrderEmail } from './_lib/email.js';
import { normCode, isCode, redeemPromo, releasePromo, discountFor } from './_lib/promo.js';
import { handler, bad, publicOrderId, normEmail, isEmail, clientIp } from './_lib/util.js';

const PRODUCTS = JSON.parse(readFileSync(join(process.cwd(), 'content/products.json'), 'utf8'));

const ADDR_FIELDS = ['name', 'line1', 'line2', 'city', 'postcode', 'country'];
function cleanAddress(raw, label) {
  if (!raw || typeof raw !== 'object') throw bad(`Please fill in the ${label} address.`);
  const a = {};
  for (const f of ADDR_FIELDS) a[f] = String(raw[f] ?? '').trim().slice(0, 120);
  for (const f of ['name', 'line1', 'city', 'postcode', 'country']) {
    if (!a[f]) throw bad(`The ${label} address needs a ${f === 'line1' ? 'street address' : f}.`);
  }
  return a;
}

/* POST { items: [{slug,q}], shipping, billing?|billingSameAsShipping, promo? }
   Prices and discounts are always computed server-side.
   With STRIPE_SECRET_KEY → Stripe Checkout (discount as one-off coupon);
   without it, the order is recorded as a reservation. */
export default handler(['POST'], async (req, res) => {
  await ensureSchema();
  const body = req.body || {};

  // Signed-in customer → email/id from the session cookie (trusted).
  // Guest → email from the form, validated; no account attached (user_id null).
  const session = readCustomer(req);
  const email = session ? session.email : normEmail(body.email);
  const userId = session ? session.uid : null;
  if (!isEmail(email)) throw bad('Please enter a valid email address for your order confirmation.');
  // Every order sends an email — cap it so nobody can script fake orders to
  // spam strangers' inboxes (and burn our sender reputation).
  await rateLimit(`co:ip:${clientIp(req)}`, 10, 3600);
  if (!session) await rateLimit(`co:em:${email}`, 5, 3600);

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > 20) throw bad('Your reserve is empty.');
  const lines = items.map(({ slug, variantId, q }) => {
    const p = PRODUCTS[slug];
    const qty = Math.floor(Number(q));
    if (!p || !Number.isFinite(qty) || qty < 1 || qty > 20) throw bad('Your reserve contains an unknown item — please refresh and retry.');
    if (p.soldOut) throw bad(`${p.name} is sold out — remove it from your reserve to continue.`);
    // price/name always from the server catalogue; a size variant, if any, wins
    if (Array.isArray(p.variants) && p.variants.length) {
      const v = p.variants.find(x => x.id === variantId) || p.variants.find(x => x.default) || p.variants[0];
      if (v.soldOut) throw bad(`${p.name} (${v.label}) is sold out — remove it to continue.`);
      return { slug, variantId: v.id, name: `${p.name} · ${v.label}`, qty, unitPence: Math.round(v.price * 100) };
    }
    return { slug, variantId: null, name: p.cartName, qty, unitPence: p.price * 100 };
  });
  const subtotal = lines.reduce((s, l) => s + l.unitPence * l.qty, 0);

  const shipping = cleanAddress(body.shipping, 'delivery');
  const billing = body.billingSameAsShipping ? shipping : cleanAddress(body.billing, 'billing');
  const giftNote = String(body.giftNote || '').trim().slice(0, 300) || null;

  // redeem the promo atomically (race-safe for limited-issue codes)
  let promo = null, discount = 0;
  const code = normCode(body.promo);
  if (code) {
    if (!isCode(code)) throw bad('That promo code doesn’t look right.');
    promo = await redeemPromo(code);
    discount = discountFor(promo, subtotal);
  }
  const total = subtotal - discount;

  const q = sql();
  const publicId = publicOrderId();
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  try {
    if (!stripeKey) {
      await q`INSERT INTO orders (public_id, user_id, email, items, total_pence, status,
          shipping, billing, promo_code, discount_pence, gift_note)
        VALUES (${publicId}, ${userId}, ${email}, ${JSON.stringify(lines)}, ${total}, 'reserved',
          ${JSON.stringify(shipping)}, ${JSON.stringify(billing)}, ${promo?.code ?? null}, ${discount}, ${giftNote})`;
      await q`DELETE FROM carts WHERE email = ${email}`; // bag checked out → no longer needed
      await sendOrderEmail({ public_id: publicId, email, items: lines,
        total_pence: total, discount_pence: discount, shipping, gift_note: giftNote }, 'reserved');
      return res.status(201).json({ ok: true, mode: 'reservation', orderId: publicId });
    }

    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(stripeKey);
    const origin = process.env.SITE_URL || `https://${req.headers.host}`;
    let discounts;
    if (discount > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: discount, currency: 'gbp', duration: 'once', name: promo.code,
      });
      discounts = [{ coupon: coupon.id }];
    }
    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: lines.map(l => ({
        quantity: l.qty,
        price_data: { currency: 'gbp', unit_amount: l.unitPence, product_data: { name: l.name } },
      })),
      ...(discounts ? { discounts } : {}),
      metadata: { public_id: publicId },
      success_url: session ? `${origin}/account?session_id={CHECKOUT_SESSION_ID}` : `${origin}/track?placed=${publicId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: session ? `${origin}/account?cancelled=1` : `${origin}/checkout?cancelled=1`,
    });

    await q`INSERT INTO orders (public_id, user_id, email, items, total_pence, status,
        stripe_session_id, shipping, billing, promo_code, discount_pence, gift_note)
      VALUES (${publicId}, ${userId}, ${email}, ${JSON.stringify(lines)}, ${total}, 'pending_payment',
        ${stripeSession.id}, ${JSON.stringify(shipping)}, ${JSON.stringify(billing)}, ${promo?.code ?? null}, ${discount}, ${giftNote})`;
    await q`DELETE FROM carts WHERE email = ${email}`; // bag checked out → no longer needed
    res.status(201).json({ ok: true, mode: 'stripe', orderId: publicId, url: stripeSession.url });
  } catch (e) {
    if (promo) await releasePromo(promo.code);
    throw e;
  }
});
