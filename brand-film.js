(() => {
  const video = document.querySelector('#brand-video');
  if (!video) return;
  const play = document.querySelector('#brand-play');
  const sound = document.querySelector('#brand-sound');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let pausedByUser = reduced.matches, visible = false;
  const sync = () => {
    play.textContent = video.paused ? 'Reproducir ↗' : 'Pausar Ⅱ';
    play.setAttribute('aria-label', video.paused ? 'Reproducir animación' : 'Pausar animación');
    sound.textContent = video.muted ? 'Sonido: no' : 'Sonido: sí';
    sound.setAttribute('aria-label', video.muted ? 'Activar sonido' : 'Silenciar');
    sound.setAttribute('aria-pressed', String(!video.muted));
  };
  const start = () => video.play().catch(sync);
  play.addEventListener('click', () => { pausedByUser = !video.paused; if (video.paused) start(); else video.pause(); });
  sound.addEventListener('click', () => { video.muted = !video.muted; sync(); });
  ['play','pause','volumechange'].forEach(event => video.addEventListener(event, sync));
  video.addEventListener('error', () => { video.controls = true; document.querySelector('.brand-film-controls').hidden = true; });
  if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !pausedByUser && !document.hidden) start(); else video.pause();
  }, { threshold: .3 }).observe(video);
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); else if (visible && !pausedByUser) start(); });
  reduced.addEventListener('change', () => { if (reduced.matches) { pausedByUser = true; video.pause(); } });
  video.controls = false;
  document.querySelector('.brand-film-controls').hidden = false;
  sync();
})();
