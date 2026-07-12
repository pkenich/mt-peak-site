/* MT. PEAK — lux layer: magnetic buttons, card tilt, counters, page transitions.
   All effects skip touch devices and prefers-reduced-motion. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;

  /* ---- scroll-progress line (all pages) ---- */
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  document.body.appendChild(bar);
  let barRaf = 0;
  const updateBar = () => {
    barRaf = 0;
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(scrollY / h, 1) : 0})`;
  };
  addEventListener('scroll', () => { if (!barRaf) barRaf = requestAnimationFrame(updateBar); }, { passive: true });
  addEventListener('resize', updateBar, { passive: true });
  updateBar();

  /* ---- magnetic buttons ---- */
  if (fine && !reduce) {
    for (const el of document.querySelectorAll('.closer-btn, .product-add, .btn-add, .cart-checkout')) {
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) / r.width;
        const y = (e.clientY - r.top - r.height / 2) / r.height;
        el.style.transform = `translate(${x * 8}px, ${y * 6}px)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transition = 'transform .5s cubic-bezier(.16,1,.3,1)';
        el.style.transform = '';
        setTimeout(() => { el.style.transition = ''; }, 500);
      });
    }
  }

  /* ---- 3D tilt on collection cards + PDP gallery ---- */
  if (fine && !reduce) {
    for (const el of document.querySelectorAll('.product, .gal-main')) {
      let raf = 0;
      el.addEventListener('mousemove', (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = el.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5;
          const y = (e.clientY - r.top) / r.height - 0.5;
          el.style.transform = `perspective(900px) rotateX(${-y * 3.2}deg) rotateY(${x * 3.2}deg) translateY(-4px)`;
        });
      });
      el.addEventListener('mouseleave', () => {
        el.style.transition = 'transform .7s cubic-bezier(.16,1,.3,1)';
        el.style.transform = '';
        setTimeout(() => { el.style.transition = ''; }, 700);
      });
    }
  }

  /* ---- count-up provenance numerals ---- */
  if (!reduce) {
    const els = document.querySelectorAll('.prov-num');
    if (els.length) {
      const io = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          io.unobserve(en.target);
          const final = en.target.textContent;
          const m = /^([\d,]+)(.*)$/.exec(final.trim());
          if (!m) continue;
          const target = parseInt(m[1].replace(/,/g, ''), 10);
          const suffix = m[2];
          const t0 = performance.now(), dur = 1400;
          (function tick(t) {
            const p = Math.min((t - t0) / dur, 1);
            const eased = 1 - Math.pow(1 - p, 4);
            en.target.textContent = Math.round(target * eased).toLocaleString('en-GB') + suffix;
            if (p < 1) requestAnimationFrame(tick); else en.target.textContent = final;
          })(t0);
        }
      }, { threshold: .6 });
      els.forEach(el => io.observe(el));
    }
  }

  /* ---- quiet page transitions on internal navigation ---- */
  if (!reduce) {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.hash) return; // same-page anchor
      if (a.getAttribute('href') === '#') return;
      e.preventDefault();
      document.body.classList.add('page-exit');
      setTimeout(() => { location.href = url.href; }, 170);
    });
    // restore when returning via back/forward cache
    addEventListener('pageshow', () => document.body.classList.remove('page-exit'));
  }
})();
