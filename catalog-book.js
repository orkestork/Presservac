(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const pages = $$('.spread');
  const stage = $('#book-stage');
  const prev = $('#book-prev');
  const next = $('#book-next');
  const count = $('#book-count');
  const film = $('#book-film');
  const thumbs = $$('button', film);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;

  const warm = (page) => {
    const img = page && $('.disc img', page);
    if (img) img.loading = 'eager';
  };

  function paint() {
    prev.disabled = current === 0;
    next.disabled = current === pages.length - 1;
    count.textContent = `${current + 1} / ${pages.length}`;
    thumbs.forEach((b, i) => {
      if (i === current) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    const active = thumbs[current].parentElement;
    film.scrollTo({
      left: active.offsetLeft - (film.clientWidth - active.offsetWidth) / 2,
      behavior: reduced.matches ? 'auto' : 'smooth',
    });
    warm(pages[current + 1]);
    warm(pages[current - 1]);
  }

  function show(n, updateHash = true) {
    n = Math.max(0, Math.min(pages.length - 1, n));
    if (n === current) return;
    pages[current].hidden = true;
    current = n;
    warm(pages[current]);
    pages[current].hidden = false;
    paint();
    if (updateHash) history.replaceState(null, '', current ? `#${pages[current].id}` : location.pathname);
    if (stage.getBoundingClientRect().top < 0) {
      stage.scrollIntoView({ block: 'start', behavior: reduced.matches ? 'auto' : 'smooth' });
    }
  }

  prev.onclick = () => show(current - 1);
  next.onclick = () => show(current + 1);
  $$('[data-goto]').forEach((b) => { b.onclick = () => show(Number(b.dataset.goto)); });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const moves = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: pages.length - 1 };
    if (!(e.key in moves)) return;
    e.preventDefault();
    show(moves[e.key]);
  });

  let start = null;
  stage.addEventListener('touchstart', (e) => {
    start = [e.changedTouches[0].clientX, e.changedTouches[0].clientY];
  }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start[0];
    const dy = e.changedTouches[0].clientY - start[1];
    start = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) show(current + (dx < 0 ? 1 : -1));
  }, { passive: true });

  // Micraje: una tabla por valor, visibles todas sin JavaScript.
  const micButtons = $$('.mic-tabs button');
  const micTables = $$('.sizes');
  function setMic(mic) {
    micButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mic === mic)));
    micTables.forEach((t) => { t.hidden = t.dataset.mic !== mic; });
  }
  micButtons.forEach((b) => { b.onclick = () => setMic(b.dataset.mic); });
  setMic('65');

  const full = $('#book-full');
  if (document.fullscreenEnabled) {
    full.hidden = false;
    full.onclick = async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await $('main').requestFullscreen();
      } catch {
        full.hidden = true;
      }
    };
    document.addEventListener('fullscreenchange', () => {
      full.textContent = document.fullscreenElement ? 'Salir' : 'Pantalla completa';
    });
  }

  const fromHash = () => pages.findIndex((p) => `#${p.id}` === location.hash);
  // Cada página tiene id: se evita el salto del navegador al abrir un enlace directo.
  window.addEventListener('hashchange', () => {
    const i = fromHash();
    if (i >= 0) { show(i, false); scrollTo(0, 0); }
  });
  const initial = fromHash();
  if (initial > 0) show(initial, false);
  else paint();
  if (location.hash) requestAnimationFrame(() => scrollTo(0, 0));
})();
