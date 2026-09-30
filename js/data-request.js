/* MT. PEAK — data protection request (guests / no account). */
(() => {
  const $ = s => document.querySelector(s);
  $('#dsrForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = $('#formMsg'), btn = e.target.querySelector('button');
    btn.disabled = true; m.className = 'form-msg';
    try {
      const res = await fetch('/api/shop/data-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $('#dsrEmail').value, kind: $('#dsrKind').value, note: $('#dsrNote').value }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Please try again.');
      m.textContent = 'Request received. We’ll email you to confirm it’s really you, then act on it within one month.';
      m.className = 'form-msg ok'; e.target.reset();
    } catch (err) { m.textContent = err.message; m.className = 'form-msg err'; }
    btn.disabled = false;
  });
})();
