/* MT. PEAK — password reset page. Two modes:
   without ?token → request a reset link; with ?token → set a new password. */
(() => {
  const $ = s => document.querySelector(s);
  const msg = $('#formMsg');
  const token = new URLSearchParams(location.search).get('token');
  const show = (t, c) => { msg.textContent = t; msg.className = `form-msg ${c}`; };

  const mode = token ? 'set' : 'request';
  $('#requestForm').hidden = mode !== 'request';
  $('#setForm').hidden = mode !== 'set';
  $('#resetTitle').textContent = mode === 'set' ? 'Choose a new password' : 'Reset password';

  $('#requestForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const res = await fetch('/api/auth/request-reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $('#rqEmail').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong — try again.');
      show('If that address has an account, a reset link is on its way. Check your inbox.', 'ok');
    } catch (err) { show(err.message, 'err'); btn.disabled = false; }
  });

  $('#setForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: $('#npPass').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong — try again.');
      show('Password updated — taking you to your account…', 'ok');
      setTimeout(() => location.href = '/account', 800);
    } catch (err) { show(err.message, 'err'); btn.disabled = false; }
  });
})();
