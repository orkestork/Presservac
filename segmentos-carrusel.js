(() => {
  const root = document.querySelector('#segmentos');
  const track = root && root.querySelector('.discover-grid');
  if (!track) return;

  const DELAY = 1700;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const dialog = document.querySelector('#sector-dialog');
  const clearSearch = root.querySelector('.clear-search');
  const pause = root.querySelector('.seg-pause');
  const cards = [...track.children];

  // Las tarjetas fuera de pantalla no deben esperar la animación de entrada de pro.js.
  cards.forEach((card) => card.classList.remove('rv'));

  // Una copia del grupo permite que el carrusel avance sin saltos al llegar al final.
  const clones = cards.map((card) => {
    const copy = card.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    copy.tabIndex = -1;
    copy.onclick = () => openSector(card.dataset.sector);
    return copy;
  });
  track.append(...clones);

  let playing = !reduced.matches;
  let timer = 0;
  let settle = 0;

  const searching = () => !clearSearch.hidden;
  const step = () => cards[1].offsetLeft - cards[0].offsetLeft;
  const loop = () => clones[0].offsetLeft - cards[0].offsetLeft;
  const jump = (left) => track.scrollTo({ left, behavior: 'instant' });

  function wrap() {
    if (track.scrollLeft >= loop() - 1) jump(track.scrollLeft - loop());
  }

  function move(dir) {
    if (searching()) return;
    wrap();
    if (dir < 0 && track.scrollLeft <= 1) jump(track.scrollLeft + loop());
    const left = (Math.round(track.scrollLeft / step()) + dir) * step();
    track.scrollTo({ left, behavior: reduced.matches ? 'auto' : 'smooth' });
    schedule();
  }

  function inView() {
    const r = track.getBoundingClientRect();
    return Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) > r.height * 0.4;
  }

  function busy() {
    return document.hidden || dialog.open || searching()
      || root.querySelector('.discover-grid:hover, .seg-nav:hover, :focus-visible');
  }

  function schedule() {
    clearTimeout(timer);
    if (!playing) return;
    timer = setTimeout(() => {
      if (inView() && !busy()) move(1);
      else schedule();
    }, DELAY);
  }

  function paintPause() {
    pause.textContent = playing ? 'Ⅱ' : '▶';
    pause.setAttribute('aria-label', playing ? 'Pausar el carrusel' : 'Reproducir el carrusel');
  }

  root.querySelector('.seg-prev').onclick = () => move(-1);
  root.querySelector('.seg-next').onclick = () => move(1);
  pause.onclick = () => { playing = !playing; paintPause(); schedule(); };

  // Al deslizar con el dedo también se vuelve al inicio del grupo sin que se note.
  track.addEventListener('scroll', () => {
    clearTimeout(settle);
    settle = setTimeout(wrap, 160);
  }, { passive: true });

  // Durante una búsqueda se muestran solo los resultados, sin copias ni movimiento.
  new MutationObserver(() => {
    const active = searching();
    clones.forEach((copy) => { copy.hidden = active; });
    if (active) jump(0);
    schedule();
  }).observe(clearSearch, { attributes: true, attributeFilter: ['hidden'] });

  paintPause();
  schedule();
})();
