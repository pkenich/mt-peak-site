/* MT. PEAK — one-step unsubscribe from the link in any marketing email. */
(() => {
  const $ = s => document.querySelector(s);
  const t = new URLSearchParams(location.search).get('t');
  const done = (h, note, ok) => {
    $('#unsubH').textContent = h; $('#unsubNote').textContent = note;
    const m = $('#formMsg'); m.className = 'form-msg ' + (ok ? 'ok' : 'err'); m.textContent = ok ? 'Done.' : 'Something went wrong.';
  };
  if (!t) return done('Nothing to unsubscribe', 'This page needs the link from one of our emails. Or email us and we’ll remove you by hand.', false);
  fetch('/api/shop/unsubscribe?t=' + encodeURIComponent(t), { method: 'POST' })
    .then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => ok
      ? done('You’re unsubscribed', `${d.email} won’t receive newsletters or bag reminders from us again.`, true)
      : done('That link didn’t work', d.error || 'Please email us and we’ll remove you by hand.', false))
    .catch(() => done('That link didn’t work', 'Please try again, or email us and we’ll remove you by hand.', false));
})();
