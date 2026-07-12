/* MT. PEAK — account page: session gate + order history */
(() => {
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);

  const STATUS_LABEL = {
    reserved: 'Reserved', pending_payment: 'Awaiting payment', paid: 'Paid',
    fulfilled: 'Shipped', cancelled: 'Cancelled',
  };
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmtDate = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtItems = items => items.map(l => `${esc(l.name)} × ${esc(l.qty)}`).join('<br>');

  function showMsg(text, cls) {
    const m = $('#accountMsg');
    m.innerHTML = text; m.className = `form-msg ${cls}`;
  }

  async function boot() {
    const { user } = await fetch('/api/auth/me').then(r => r.json()).catch(() => ({}));
    if (!user) { location.replace('/login'); return; }
    $('#accountTitle').textContent = `Your orders, ${(user.name || '').split(' ')[0]}`;

    // returning from Stripe: confirm payment server-side (id is only a hint)
    const sessionId = params.get('session_id');
    if (sessionId) {
      showMsg('Confirming your payment…', 'ok');
      await fetch('/api/stripe/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
      history.replaceState(null, '', '/account');
      showMsg('Thank you — your order is confirmed.', 'ok');
    } else if (params.get('placed')) {
      showMsg(`Your reserve is placed — order <strong>${params.get('placed')}</strong>. Payment isn't live yet; we'll email you a payment link to complete it.`, 'ok');
      history.replaceState(null, '', '/account');
    } else if (params.get('cancelled')) {
      showMsg('Checkout was cancelled — your order is saved and can be paid any time.', 'err');
      history.replaceState(null, '', '/account');
    }

    const body = $('#ordersBody');
    try {
      const { orders } = await fetch('/api/orders').then(r => r.ok ? r.json() : Promise.reject());
      if (!orders.length) {
        body.innerHTML = '<div class="empty-state">No orders yet — the mountain awaits. <a class="text-link" href="/#collection">Explore the Reserve</a></div>';
        return;
      }
      body.innerHTML = orders.map(o => `
        <div class="order-row">
          <div class="oid">${o.public_id}</div>
          <div class="odate">${fmtDate(o.created_at)}</div>
          <div class="oitems">${fmtItems(o.items)}</div>
          <div class="ototal">£${(o.total_pence / 100).toFixed(0)}</div>
          <div><span class="status ${o.status}">${STATUS_LABEL[o.status] || o.status}</span></div>
        </div>`).join('');
    } catch {
      body.innerHTML = '<div class="empty-state">Couldn’t load orders — please refresh.</div>';
    }
  }

  $('#btnLogout').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    location.href = '/';
  });

  boot();
})();
