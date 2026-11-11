(() => {
  const root = document.querySelector('#vitrina');
  if (!root) return;
  const slides = [...root.querySelectorAll('.vt-slide')];
  const dots = root.querySelector('.vt-dots');
  const nextBtn = root.querySelector('.vt-next');
  const nextImg = nextBtn.querySelector('img');
  const nextName = nextBtn.querySelector('b');
  const pause = root.querySelector('.vt-pause');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const DELAY = 4800;
  const OUT = 500;
  let current = 0;
  let playing = !reduced.matches;
  let timer = 0;

  const dotButtons = slides.map((slide, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `Ver ${slide.dataset.name}`);
    b.onclick = () => go(i);
    li.append(b);
    dots.append(li);
    return b;
  });

  function paint() {
    root.style.setProperty('--vt-bg', slides[current].dataset.bg);
    dotButtons.forEach((b, i) => b.setAttribute('aria-current', String(i === current)));
    const upcoming = slides[(current + 1) % slides.length];
    nextImg.src = upcoming.querySelector('img').currentSrc || upcoming.querySelector('img').src;
    nextName.textContent = upcoming.dataset.name;
    nextBtn.setAttribute('aria-label', `Ver siguiente empaque: ${upcoming.dataset.name}`);
    pause.textContent = playing ? 'Ⅱ' : '▶';
    pause.setAttribute('aria-label', playing ? 'Pausar la vitrina' : 'Reproducir la vitrina');
  }

  function go(n) {
    n = (n + slides.length) % slides.length;
    if (n === current) return;
    const old = slides[current];
    old.classList.remove('is-active');
    old.classList.add('is-leaving');
    old.setAttribute('aria-hidden', 'true');
    setTimeout(() => old.classList.remove('is-leaving'), reduced.matches ? 0 : OUT);
    current = n;
    slides[current].classList.add('is-active');
    slides[current].removeAttribute('aria-hidden');
    paint();
    schedule();
  }

  function inView() {
    const r = root.getBoundingClientRect();
    return Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) > r.height * 0.35;
  }

  function schedule() {
    clearTimeout(timer);
    if (playing && !root.matches(':hover') && !root.querySelector(':focus-visible') && !document.hidden) {
      timer = setTimeout(() => (inView() ? go(current + 1) : schedule()), DELAY);
    }
  }

  root.querySelector('.vt-prev').onclick = () => go(current - 1);
  root.querySelector('.vt-forward').onclick = () => go(current + 1);
  nextBtn.onclick = () => go(current + 1);
  pause.onclick = () => { playing = !playing; paint(); schedule(); };

  root.addEventListener('mouseenter', () => clearTimeout(timer));
  root.addEventListener('mouseleave', schedule);
  root.addEventListener('focusin', () => clearTimeout(timer));
  root.addEventListener('focusout', () => setTimeout(schedule));
  document.addEventListener('visibilitychange', schedule);

  let startX = null;
  root.addEventListener('touchstart', (e) => { startX = e.changedTouches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) > 60) go(current + (dx < 0 ? 1 : -1));
  }, { passive: true });

  slides.forEach((s, i) => { if (i) s.setAttribute('aria-hidden', 'true'); });
  paint();
  schedule();
})();
