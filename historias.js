/* Tips en carrusel 3D tipo abanico: la tarjeta activa al centro, las demás giradas detrás.
   Videos: llena data-src="assets/tu-video.mp4" en cada tarjeta; si no hay, se ve la portada. */
(() => {
  const root = document.querySelector('.stories.cf');
  if (!root) return;
  const cards = [...root.querySelectorAll('.cf-card')];
  const dotsBox = root.querySelector('.cf-dots');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active = Math.min(2, cards.length - 1), timer = null, hover = false;

  cards.forEach((c, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', `Tip ${i + 1}`);
    b.addEventListener('click', () => { go(i); restart(); }); dotsBox.append(b);
    c.addEventListener('click', () => { if (i !== active) { go(i); restart(); } });
  });
  const dots = [...dotsBox.children];

  function layout() {
    const narrow = innerWidth < 760;
    const step = narrow ? 58 : 64;                       // % del ancho de la tarjeta
    cards.forEach((c, i) => {
      let d = i - active; const n = cards.length; if (d > n / 2) d -= n; if (d < -n / 2) d += n;   // circular
      const a = Math.abs(d);
      const x = d * step, z = -a * (narrow ? 140 : 170), ry = -d * (narrow ? 22 : 18), s = 1 - Math.min(a, 3) * .08;
      c.style.transform = `translate(-50%, -50%) translateX(${x}%) translateZ(${z}px) rotateY(${ry}deg) scale(${s})`;
      c.style.zIndex = String(20 - a);
      c.style.opacity = a > (narrow ? 1 : 2) ? '0' : '1';
      c.style.pointerEvents = a > (narrow ? 1 : 2) ? 'none' : '';
      c.classList.toggle('is-active', d === 0);
      c.setAttribute('aria-hidden', String(d !== 0));
      c.querySelectorAll('a').forEach(l => { l.tabIndex = d === 0 ? 0 : -1; });
    });
    dots.forEach((b, i) => b.setAttribute('aria-current', String(i === active)));
  }
  function go(i) { active = (i + cards.length) % cards.length; layout(); playActive(); }
  const restart = () => { clearInterval(timer); if (!reduced && !hover) timer = setInterval(() => go(active + 1), 4200); };
  root.querySelector('.cf-prev').addEventListener('click', () => { go(active - 1); restart(); });
  root.querySelector('.cf-next').addEventListener('click', () => { go(active + 1); restart(); });
  root.addEventListener('mouseenter', () => { hover = true; clearInterval(timer); });
  root.addEventListener('mouseleave', () => { hover = false; restart(); });
  root.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { go(active + 1); restart(); } if (e.key === 'ArrowLeft') { go(active - 1); restart(); } });
  let x0 = null;
  root.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40) { go(active + (dx < 0 ? 1 : -1)); restart(); } });
  addEventListener('resize', layout);

  // videos: solo el de la tarjeta activa se reproduce
  const vids = cards.map(c => c.querySelector('.st-video'));
  vids.forEach((v, i) => { if (v && v.dataset.src) cards[i].classList.add('has-video'); });
  function playActive() {
    vids.forEach((v, i) => {
      if (!v || !v.dataset.src) return;
      if (i === active && !reduced) { if (!v.src) v.src = v.dataset.src; v.play().then(() => v.classList.add('is-playing')).catch(() => {}); }
      else { v.pause(); }
    });
  }
  layout(); playActive(); restart();
})();
