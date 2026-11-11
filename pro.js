/* Presservac — efectos e interacciones "pro" */
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  root.classList.add('pro');

  /* ---------- Preloader ---------- */
  let loadedOnce = false;
  const finish = () => {
    if (loadedOnce) return;
    loadedOnce = true;
    root.classList.add('loaded');
    setTimeout(() => $('.preloader')?.remove(), 1100);
  };
  if (reduced) finish();
  else if (document.readyState === 'complete') setTimeout(finish, 400);
  else { addEventListener('load', () => setTimeout(finish, 300)); setTimeout(finish, 2400); }

  /* ---------- Dividir títulos en palabras ---------- */
  function split(el) {
    if (el.dataset.split) return;
    el.dataset.split = '1';
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(c => {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(part); return; }
            const w = document.createElement('span'); w.className = 'w';
            const inner = document.createElement('span'); inner.className = 'wi';
            inner.style.setProperty('--i', i++); inner.textContent = part;
            w.append(inner); frag.append(w);
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1 && c.tagName !== 'BR') walk(c);
      });
    };
    walk(el);
  }
  $$('.hero-copy h1, .hero-copy h2').forEach(split);
  const splitTitles = $$('.feature-copy h2, .campaign-banner h2, .flight-copy h2, .video-copy h2');
  splitTitles.forEach(el => { split(el); el.classList.add('split'); });

  /* ---------- Reveal on scroll ---------- */
  const groups = [
    ['.eyebrow-new, .section-title, .feature-copy > span, .feature-copy p, .feature-copy .cta, .filters, .flight-copy .overline, .flight-copy p, .flight-copy .cta, .contact-caption, .campaign-banner .overline, .campaign-banner .cta', 'rv'],
    ['.category-card, .product-card, .discover-grid button, .service-strip article, .footer-grid > div, .footer-mega, .flight-visual', 'rv'],
    ['.company-visual', 'rv rv-clip'],
    ['.catalog-circle', 'rv'],
  ];
  const revealEls = [];
  groups.forEach(([sel, cls]) => $$(sel).forEach(el => {
    cls.split(' ').forEach(c => el.classList.add(c));
    const sibs = [...el.parentElement.children].filter(s => s.matches(sel));
    el.style.setProperty('--d', `${Math.min(sibs.indexOf(el), 5) * 90}ms`);
    revealEls.push(el);
  }));
  const reveal = [...revealEls, ...splitTitles];
  if (reduced || !('IntersectionObserver' in window)) reveal.forEach(el => el.classList.add('in'));
  else {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveal.forEach(el => io.observe(el));
  }

  /* ---------- Cinta marquee ---------- */
  const ribbon = $('.brand-ribbon');
  if (ribbon) {
    const group = ribbon.innerHTML.repeat(3);
    ribbon.innerHTML = `<div class="ribbon-track">${group}${group}</div>`;
  }

  /* ---------- Carrusel: estado pausado para el progreso de los dots ---------- */
  const carousel = $('.hero-carousel'), pauseBtn = $('.carousel-pause');
  if (carousel && pauseBtn) {
    const syncPaused = () => carousel.classList.toggle('is-paused', /Activar/.test(pauseBtn.getAttribute('aria-label') || ''));
    new MutationObserver(syncPaused).observe(pauseBtn, { attributes: true, attributeFilter: ['aria-label'] });
    syncPaused();
  }

  /* ---------- Video de la planta ---------- */
  const vFrame = $('.video-frame'), video = $('.plant-video');
  if (vFrame && video) {
    const playBtn = $('.video-play'), soundBtn = $('.video-sound');
    const icons = {
      play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
      pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
      muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
      sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    };
    let userPaused = reduced, inView = false;
    const ui = () => {
      const playing = !video.paused;
      playBtn.innerHTML = playing ? icons.pause : icons.play;
      playBtn.setAttribute('aria-label', playing ? 'Pausar video' : 'Reproducir video');
      soundBtn.innerHTML = (video.muted ? icons.muted : icons.sound) + '<span class="label">' + (video.muted ? 'Activar sonido' : 'Silenciar') + '</span>';
      soundBtn.setAttribute('aria-label', video.muted ? 'Activar sonido' : 'Silenciar video');
      soundBtn.classList.toggle('is-on', !video.muted);
    };
    const tryPlay = () => { const p = video.play(); if (p) p.catch(() => {}); };
    playBtn.addEventListener('click', () => { if (video.paused) { userPaused = false; tryPlay(); } else { userPaused = true; video.pause(); } });
    soundBtn.addEventListener('click', () => { video.muted = !video.muted; if (!video.muted) { userPaused = false; tryPlay(); } ui(); });
    video.addEventListener('play', ui); video.addEventListener('pause', ui); video.addEventListener('volumechange', ui);
    ui();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => {
        inView = e.isIntersecting;
        if (inView && !userPaused) { video.preload = 'auto'; tryPlay(); }
        else if (!inView) video.pause();
      }, { threshold: 0.35 }).observe(vFrame);
    }
  }

  /* ---------- Scroll: progreso, header, subir, parallax, nav activo ---------- */
  const bar = $('.scroll-progress'), header = $('.header'), toTop = $('.to-top'), ringEl = $('.to-top .ring');
  const nav = $('header nav');
  const parallax = [
    ['.catalog-circle img', 0.03], ['.company-visual img', 0.04],
  ].flatMap(([s, k]) => $$(s).map(el => [el, k]));
  const spy = $$('header nav a[href^="#"]').map(a => [a, $(a.getAttribute('href'))]).filter(([, s]) => s);
  let lastY = scrollY, ticking = false;

  function onScroll() {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight, p = max > 0 ? y / max : 0;
    if (bar) bar.style.transform = `scaleX(${p})`;
    if (header && !nav?.classList.contains('open')) {
      header.classList.toggle('is-hidden', y > lastY && y > 400);
    }
    if (toTop) {
      toTop.classList.toggle('show', y > 700);
      if (ringEl) ringEl.style.strokeDashoffset = 138.2 * (1 - p);
    }
    if (!reduced) parallax.forEach(([el, k]) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > innerHeight + 200) return;
      el.style.translate = `0 ${((r.top + r.height / 2 - innerHeight / 2) * -k).toFixed(1)}px`;
    });
    if (vFrame) {
      const r = vFrame.getBoundingClientRect();
      const vp = reduced ? 1 : Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * 0.85)));
      vFrame.style.setProperty('--vp', vp.toFixed(3));
    }
    let current = null;
    spy.forEach(([a, s]) => { if (s.getBoundingClientRect().top < innerHeight * 0.4) current = a; });
    spy.forEach(([a]) => a.classList.toggle('active', a === current));
    lastY = y; ticking = false;
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();
  toTop?.addEventListener('click', () => scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }));
})();
