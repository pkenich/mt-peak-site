/* MT. PEAK — sign in / create account page */
(() => {
  const $ = s => document.querySelector(s);
  const msg = $('#formMsg');
  const next = new URLSearchParams(location.search).get('next');
  const dest = next === 'checkout' ? '/checkout' : '/account';

  // already signed in? straight through
  fetch('/api/auth/me').then(r => r.json()).then(({ user }) => {
    if (user) location.replace('/account');
  }).catch(() => {});

  const show = (text, cls) => { msg.textContent = text; msg.className = `form-msg ${cls}`; };

  const tabs = { login: $('#tabLogin'), register: $('#tabRegister') };
  const forms = { login: $('#loginForm'), register: $('#registerForm') };
  function switchTab(which) {
    for (const k of ['login', 'register']) {
      tabs[k].classList.toggle('active', k === which);
      forms[k].hidden = k !== which;
    }
    msg.className = 'form-msg';
  }
  tabs.login.onclick = () => switchTab('login');
  tabs.register.onclick = () => switchTab('register');

  async function submit(url, body, btn) {
    btn.disabled = true;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong — please try again.');
      show(next === 'checkout' ? 'Signed in — returning you to your reserve…' : 'Welcome back.', 'ok');
      setTimeout(() => location.href = dest, 600);
    } catch (e) {
      show(e.message, 'err');
      btn.disabled = false;
    }
  }

  forms.login.addEventListener('submit', e => {
    e.preventDefault();
    submit('/api/auth/login', { email: $('#liEmail').value, password: $('#liPass').value },
      forms.login.querySelector('button[type=submit]'));
  });
  forms.register.addEventListener('submit', e => {
    e.preventDefault();
    submit('/api/auth/register', { name: $('#rgName').value, email: $('#rgEmail').value, password: $('#rgPass').value },
      forms.register.querySelector('button[type=submit]'));
  });
})();
