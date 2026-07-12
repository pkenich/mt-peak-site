/* Transactional email via Resend's REST API (no SDK). Unconfigured → silent
   no-op so email can never break an order flow; failures are logged, not thrown. */

const GOLD = '#c9a961', CREAM = '#f4efe6', DIM = 'rgba(244,239,230,.55)',
  BG = '#0a1410', CARD = '#0f1d17', BORDER = 'rgba(201,169,97,.25)';

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

function orderEmailHtml({ heading, message, order, siteUrl }) {
  const rows = order.items.map(l => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${BORDER};color:${CREAM};font-size:14px;">${esc(l.name)}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${BORDER};color:${DIM};font-size:14px;text-align:center;">× ${l.qty}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${BORDER};color:${GOLD};font-size:14px;text-align:right;">${gbp(l.unitPence * l.qty)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
    <tr><td align="center" style="padding:8px 0 28px;">
      <img src="${siteUrl}/assets/mtpeak-emblem.webp" width="72" alt="Mt. Peak" style="display:block;">
      <div style="font-family:Georgia,'Times New Roman',serif;color:${GOLD};font-size:20px;letter-spacing:6px;padding-top:14px;">MT. PEAK</div>
      <div style="font-family:Georgia,serif;color:${DIM};font-size:11px;letter-spacing:3px;padding-top:6px;">SOURCED AT ALTITUDE</div>
    </td></tr>
    <tr><td style="background:${CARD};border:1px solid ${BORDER};padding:36px 32px;">
      <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;color:${CREAM};font-size:26px;line-height:1.25;">${esc(heading)}</h1>
      <p style="margin:0 0 26px;font-family:Helvetica,Arial,sans-serif;color:${DIM};font-size:14px;line-height:1.7;">${esc(message)}</p>
      <div style="border:1px solid ${BORDER};padding:6px 18px 2px;margin-bottom:26px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:12px 0;color:${DIM};font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;">ORDER</td>
            <td style="padding:12px 0;text-align:right;font-family:Georgia,serif;color:${GOLD};font-size:16px;letter-spacing:1px;">${esc(order.public_id)}</td>
          </tr>
          ${rows}
          <tr>
            <td style="padding:14px 0;color:${DIM};font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;">TOTAL</td>
            <td colspan="2" style="padding:14px 0;text-align:right;font-family:Georgia,serif;color:${GOLD};font-size:22px;">${gbp(order.total_pence)}</td>
          </tr>
        </table>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
        <tr><td style="background:${GOLD};">
          <a href="${siteUrl}/track" style="display:inline-block;padding:14px 34px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:3px;color:#070d0a;text-decoration:none;">TRACK YOUR ORDER</a>
        </td></tr>
      </table>
      <p style="margin:22px 0 0;text-align:center;font-family:Helvetica,Arial,sans-serif;color:${DIM};font-size:12px;">
        Use order <span style="color:${GOLD};">${esc(order.public_id)}</span> and this email address at
        <a href="${siteUrl}/track" style="color:${GOLD};">${siteUrl.replace('https://', '')}/track</a>
      </p>
    </td></tr>
    <tr><td align="center" style="padding:26px 8px;font-family:Helvetica,Arial,sans-serif;color:${DIM};font-size:11px;letter-spacing:1px;line-height:1.8;">
      Single-origin Himalayan tea · Grown at 2,500m · Eastern Nepal<br>
      © Mt. Peak — The mountain is patient. So are we.
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

/* Sends the status email for an order row (must include public_id, email,
   items, total_pence). Returns true if a send was attempted successfully. */
export async function sendOrderEmail(order, status) {
  const key = process.env.RESEND_API_KEY;
  const copy = STATUS_COPY[status];
  if (!key || !copy) return false;
  const siteUrl = process.env.SITE_URL || 'https://mt-peak-site.vercel.app';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Mt. Peak <onboarding@resend.dev>',
        to: [order.email],
        subject: copy.subject(order),
        html: orderEmailHtml({ heading: copy.heading, message: copy.message, order, siteUrl }),
      }),
    });
    if (!res.ok) console.error('email send failed', res.status, await res.text().catch(() => ''));
    return res.ok;
  } catch (e) {
    console.error('email send error', e);
    return false;
  }
}
