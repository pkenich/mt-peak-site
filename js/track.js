/* MT. PEAK — public order tracking (order number + checkout email) */
(() => {
  const $ = s => document.querySelector(s);
  const msg = $('#formMsg');

  const STATUS_LABEL = {
    reserved: 'Reserved', pending_payment: 'Awaiting payment', paid: 'Paid',
    fulfilled: 'Shipped', cancelled: 'Cancelled',
  };
  const STATUS_BLURB = {
    reserved: 'Your reserve is recorded. We’ll email you a payment link to complete it.',
    pending_payment: 'Waiting on payment — check your inbox for the checkout link.',
    paid: 'Paid and being prepared for dispatch.',
    fulfilled: 'On its way to you.',
    cancelled: 'This order was cancelled.',
  };

  $('#trackForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'form-msg';
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const res = await fetch('/api/orders/track', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: $('#tkOrder').value, email: $('#tkEmail').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Lookup failed — please try again.');
      const o = data.order;
      $('#trackResult').hidden = false;
      $('#trackBody').innerHTML = `
        <div class="order-row">
          <div class="oid">${o.public_id}</div>
          <div class="odate">${new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          <div class="oitems">${o.items.map(l => `${String(l.name).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))} × ${Number(l.qty) || 0}`).join('<br>')}</div>
          <div class="ototal">£${(o.total_pence / 100).toFixed(0)}</div>
          <div><span class="status ${o.status}">${STATUS_LABEL[o.status] || o.status}</span></div>
        </div>
        <p class="form-note" style="text-align:left;">${STATUS_BLURB[o.status] || ''}</p>`;
    } catch (err) {
      $('#trackResult').hidden = true;
      msg.textContent = err.message;
      msg.className = 'form-msg err';
    } finally { btn.disabled = false; }
  });
})();
