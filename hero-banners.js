/* Carrusel de banners del robot: avanza solo, se pausa al pasar el mouse o con el botón */
(() => {
  const root = document.querySelector('.hb');
  if (!root) return;
  const slides = [...root.querySelectorAll('.hb-slide')];
  const dots = [...root.querySelectorAll('.hb-dots button')];
  const pauseBtn = root.querySelector('.hb-pause');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DELAY = 6500;
  let index = 0, timer = null, userPaused = reduced, hovering = false;

  const show = (i) => {
    index = (i + slides.length) % slides.length;
    slides.forEach((s, k) => {
      const on = k === index;
      s.classList.toggle('is-active', on);
      s.setAttribute('aria-hidden', String(!on));
      s.querySelectorAll('a').forEach(a => { a.tabIndex = on ? 0 : -1; });
    });
    dots.forEach((d, k) => d.setAttribute('aria-current', String(k === index)));
    root.classList.toggle('on-dark', slides[index].classList.contains('hb-dark'));
  };
  const stop = () => { clearInterval(timer); timer = null; };
  const start = () => { stop(); if (!userPaused && !hovering && !document.hidden) timer = setInterval(() => show(index + 1), DELAY); };
  const syncPause = () => {
    pauseBtn.textContent = userPaused ? '▶' : 'Ⅱ';
    pauseBtn.setAttribute('aria-label', userPaused ? 'Reproducir carrusel' : 'Pausar carrusel');
  };

  root.querySelector('.hb-prev').addEventListener('click', () => { show(index - 1); start(); });
  root.querySelector('.hb-next').addEventListener('click', () => { show(index + 1); start(); });
  dots.forEach((d, k) => d.addEventListener('click', () => { show(k); start(); }));
  pauseBtn.addEventListener('click', () => { userPaused = !userPaused; syncPause(); start(); });
  root.addEventListener('mouseenter', () => { hovering = true; stop(); });
  root.addEventListener('mouseleave', () => { hovering = false; start(); });
  root.addEventListener('focusin', () => { hovering = true; stop(); });
  root.addEventListener('focusout', () => { hovering = false; start(); });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { show(index + 1); start(); }
    if (e.key === 'ArrowLeft') { show(index - 1); start(); }
  });
  // deslizar en celular
  let x0 = null;
  root.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 45) { show(index + (dx < 0 ? 1 : -1)); start(); }
  });
  document.addEventListener('visibilitychange', start);

  show(0); syncPause(); start();
})();
