/* Transactional email via Resend's REST API (no SDK). Unconfigured → silent
   no-op so email can never break an order flow; failures are logged, not thrown. */

/* Packaging palette — deep pine green + gold, matched to the MT. PEAK mark
   (#c6a06a). INK = primary text (cream), MUTE = secondary, BG = outer pine,
   CARD = green panel, LINE = gold hairline, GOLD = accent/CTA. */
const GOLD = '#c6a06a', INK = '#f3ecdd', MUTE = 'rgba(243,236,221,.62)',
  BG = '#0e201a', CARD = '#143128', LINE = 'rgba(198,160,106,.28)';

const STATUS_COPY = {
  reserved: {
    subject: (o) => `Your reserve is placed — ${o.public_id}`,
    heading: 'Your reserve is placed',
    message: 'We have set your tea aside. Payment isn’t live just yet — we’ll send you a payment link shortly to complete the order.',
  },
  paid: {
    subject: (o) => `Order confirmed — ${o.public_id}`,
    heading: 'Thank you — order confirmed',
    message: 'Your payment is received. The mountain is patient; your tea will be packed with the same care it was picked.',
  },
  fulfilled: {
    subject: (o) => `Your tea is on its way — ${o.public_id}`,
    heading: 'Descending from altitude',
    message: 'Your order has been dispatched. Warm the pot — it won’t be long now.',
  },
  cancelled: {
    subject: (o) => `Order cancelled — ${o.public_id}`,
    heading: 'Your order is cancelled',
    message: 'This order has been cancelled. If that’s a surprise, simply reply to this email and we’ll make it right.',
  },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const gbp = (pence) => '£' + (pence / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 });

/* One place every email goes through. Returns { ok, status, error } so callers
   (and the admin "send test" tool) can surface Resend's real response instead
   of a silent boolean. Unconfigured key → ok:false with a clear reason. */
async function sendViaResend({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, status: 0, error: 'RESEND_API_KEY is not set in this deployment. Add it in Vercel → Settings → Environment Variables, then redeploy.' };
  const from = process.env.EMAIL_FROM || 'Mt. Peak <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (res.ok) return { ok: true, status: res.status, error: null };
    const detail = await res.text().catch(() => '');
    console.error('email send failed', res.status, detail);
    let msg = detail;
    try { msg = JSON.parse(detail).message || detail; } catch {}
    return { ok: false, status: res.status, error: msg || `Resend returned ${res.status}` };
  } catch (e) {
    console.error('email send error', e);
    return { ok: false, status: 0, error: String(e.message || e) };
  }
}

export function orderEmailHtml({ heading, message, order, siteUrl }) {
  const rows = (order.items || []).map(l => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${LINE};color:${INK};font-size:14px;">${esc(l.name)}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${LINE};color:${MUTE};font-size:14px;text-align:center;">× ${l.qty}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${LINE};color:${GOLD};font-size:14px;text-align:right;">${gbp(l.unitPence * l.qty)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
    <tr><td align="center" style="padding:8px 0 28px;">
      <img src="${siteUrl}/assets/mt-peak-logo.png" width="190" alt="Mt. Peak" style="display:block;margin:0 auto;">
      <div style="font-family:Georgia,serif;color:${MUTE};font-size:11px;letter-spacing:3px;padding-top:8px;">SOURCED AT ALTITUDE</div>
    </td></tr>
    <tr><td style="background:${CARD};border:1px solid ${LINE};padding:36px 32px;">
      <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;color:${INK};font-size:26px;line-height:1.25;">${esc(heading)}</h1>
      <p style="margin:0 0 26px;font-family:Helvetica,Arial,sans-serif;color:${MUTE};font-size:14px;line-height:1.7;">${esc(message)}</p>
      <div style="border:1px solid ${LINE};padding:6px 18px 2px;margin-bottom:26px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:12px 0;color:${MUTE};font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;">ORDER</td>
            <td style="padding:12px 0;text-align:right;font-family:Georgia,serif;color:${GOLD};font-size:16px;letter-spacing:1px;">${esc(order.public_id)}</td>
          </tr>
          ${rows}
          ${order.discount_pence ? `<tr>
            <td style="padding:12px 0;color:${MUTE};font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;">DISCOUNT</td>
            <td colspan="2" style="padding:12px 0;text-align:right;font-family:Georgia,serif;color:${INK};font-size:14px;">−${gbp(order.discount_pence)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:14px 0;color:${MUTE};font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;">TOTAL</td>
            <td colspan="2" style="padding:14px 0;text-align:right;font-family:Georgia,serif;color:${GOLD};font-size:22px;">${gbp(order.total_pence)}</td>
          </tr>
        </table>
      </div>
      ${order.gift_note ? `<div style="border:1px solid ${LINE};padding:16px 18px;margin-bottom:26px;">
        <div style="color:${MUTE};font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;padding-bottom:8px;">YOUR GIFT MESSAGE</div>
        <div style="font-family:Georgia,serif;font-style:italic;color:${INK};font-size:14px;line-height:1.7;">${esc(order.gift_note)}</div>
      </div>` : ''}
      ${order.shipping ? `<div style="border:1px solid ${LINE};padding:16px 18px;margin-bottom:26px;">
        <div style="color:${MUTE};font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;padding-bottom:8px;">DELIVERING TO</div>
        <div style="font-family:Helvetica,Arial,sans-serif;color:${INK};font-size:13px;line-height:1.7;">
          ${esc(order.shipping.name)}<br>${esc(order.shipping.line1)}${order.shipping.line2 ? '<br>' + esc(order.shipping.line2) : ''}<br>
          ${esc(order.shipping.city)}, ${esc(order.shipping.postcode)}<br>${esc(order.shipping.country)}
        </div>
      </div>` : ''}
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
        <tr><td style="background:${GOLD};">
          <a href="${siteUrl}/track" style="display:inline-block;padding:14px 34px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:3px;color:#070d0a;text-decoration:none;">TRACK YOUR ORDER</a>
        </td></tr>
      </table>
      <p style="margin:22px 0 0;text-align:center;font-family:Helvetica,Arial,sans-serif;color:${MUTE};font-size:12px;">
        Use order <span style="color:${GOLD};">${esc(order.public_id)}</span> and this email address at
        <a href="${siteUrl}/track" style="color:${GOLD};">${siteUrl.replace('https://', '')}/track</a>
      </p>
    </td></tr>
    <tr><td align="center" style="padding:26px 8px;font-family:Helvetica,Arial,sans-serif;color:${MUTE};font-size:11px;letter-spacing:1px;line-height:1.8;">
      Single-origin Himalayan tea · Grown at 2,500m · Eastern Nepal<br>
      © Mt. Peak — The mountain is patient. So are we.
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

/* Generic branded email (password resets, announcements).
   Returns { ok, status, error } — callers that only care about success can
   still use it truthily via `.ok`. */
export async function sendBrandEmail({ to, subject, heading, message, ctaLabel, ctaUrl }) {
  const siteUrl = process.env.SITE_URL || 'https://mtpeakofficial.com';
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
    <tr><td align="center" style="padding:8px 0 28px;">
      <img src="${siteUrl}/assets/mt-peak-logo.png" width="190" alt="Mt. Peak" style="display:block;margin:0 auto;">
    </td></tr>
    <tr><td style="background:${CARD};border:1px solid ${LINE};padding:36px 32px;">
      <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;color:${INK};font-size:26px;line-height:1.25;">${esc(heading)}</h1>
      <p style="margin:0 0 26px;font-family:Helvetica,Arial,sans-serif;color:${MUTE};font-size:14px;line-height:1.7;">${esc(message)}</p>
      ${ctaUrl ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
        <tr><td style="background:${GOLD};">
          <a href="${ctaUrl}" style="display:inline-block;padding:14px 34px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:3px;color:#070d0a;text-decoration:none;">${esc(ctaLabel || 'CONTINUE')}</a>
        </td></tr>
      </table>` : ''}
    </td></tr>
    <tr><td align="center" style="padding:26px 8px;font-family:Helvetica,Arial,sans-serif;color:${MUTE};font-size:11px;letter-spacing:1px;line-height:1.8;">
      © Mt. Peak — The mountain is patient. So are we.
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
  const r = await sendViaResend({ to, subject, html });
  return r; // { ok, status, error } — truthy checks should use r.ok
}

/* Sends the status email for an order row (must include public_id, email,
   items, total_pence). */
export async function sendOrderEmail(order, status) {
  const copy = STATUS_COPY[status];
  if (!copy) return { ok: false, status: 0, error: 'unknown status' };
  const siteUrl = process.env.SITE_URL || 'https://mtpeakofficial.com';
  return sendViaResend({
    to: order.email,
    subject: copy.subject(order),
    html: orderEmailHtml({ heading: copy.heading, message: copy.message, order, siteUrl }),
  });
}

/* ---------- abandoned-cart reminder ---------- */
const CART_COPY = {
  '24h': {
    subject: 'Your reserve is still waiting',
    heading: 'You left something at altitude',
    message: 'Your selection is still in your reserve. We’ve kept it aside — pick up right where you left off whenever you’re ready.',
  },
  '1mo': {
    subject: 'The mountain kept your reserve',
    heading: 'Still here, whenever you are',
    message: 'A little while ago you set some tea aside with us. It’s still waiting — a quiet reminder in case the moment is right now.',
  },
};

function cartReminderHtml({ heading, message, cart, siteUrl, ctaUrl }) {
  const rows = (cart.items || []).map(l => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${LINE};color:${INK};font-size:14px;">${esc(l.n || l.name)}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${LINE};color:${MUTE};font-size:14px;text-align:center;">× ${l.q || l.qty || 1}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${LINE};color:${GOLD};font-size:14px;text-align:right;">${gbp((l.p != null ? l.p * 100 : l.unitPence) * (l.q || l.qty || 1))}</td>
    </tr>`).join('');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
    <tr><td align="center" style="padding:8px 0 28px;">
      <img src="${siteUrl}/assets/mt-peak-logo.png" width="190" alt="Mt. Peak" style="display:block;margin:0 auto;">
      <div style="font-family:Georgia,serif;color:${MUTE};font-size:11px;letter-spacing:3px;padding-top:8px;">SOURCED AT ALTITUDE</div>
    </td></tr>
    <tr><td style="background:${CARD};border:1px solid ${LINE};padding:36px 32px;">
      <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;color:${INK};font-size:26px;line-height:1.25;">${esc(heading)}</h1>
      <p style="margin:0 0 26px;font-family:Helvetica,Arial,sans-serif;color:${MUTE};font-size:14px;line-height:1.7;">${esc(message)}</p>
      <div style="border:1px solid ${LINE};padding:6px 18px 2px;margin-bottom:26px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:12px 0;color:${MUTE};font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;">YOUR RESERVE</td>
            <td colspan="2" style="padding:12px 0;text-align:right;font-family:Georgia,serif;color:${GOLD};font-size:16px;">${gbp(cart.subtotal_pence || 0)}</td>
          </tr>
          ${rows}
        </table>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
        <tr><td style="background:${GOLD};">
          <a href="${ctaUrl}" style="display:inline-block;padding:14px 34px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:3px;color:#070d0a;text-decoration:none;">RETURN TO YOUR RESERVE</a>
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:26px 8px;font-family:Helvetica,Arial,sans-serif;color:${MUTE};font-size:11px;letter-spacing:1px;line-height:1.8;">
      Single-origin Himalayan tea · Grown at 2,500m · Eastern Nepal<br>
      © Mt. Peak — The mountain is patient. So are we.
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

/* Sends a cart-reminder for one saved cart row. `which` is '24h' | '1mo'.
   `restoreUrl` deep-links back and repopulates the browser cart. */
export async function sendCartEmail(cart, which, restoreUrl) {
  const copy = CART_COPY[which];
  if (!copy) return { ok: false, status: 0, error: 'unknown reminder' };
  const siteUrl = process.env.SITE_URL || 'https://mtpeakofficial.com';
  return sendViaResend({
    to: cart.email,
    subject: copy.subject,
    html: cartReminderHtml({ heading: copy.heading, message: copy.message, cart, siteUrl, ctaUrl: restoreUrl || `${siteUrl}/#collection` }),
  });
}

export { cartReminderHtml };
