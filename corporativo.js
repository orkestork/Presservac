(() => {
  const frame = document.querySelector('.cf-frame');
  const video = frame && frame.querySelector('.cf-video');
  if (!video) return;
  const play = frame.querySelector('.cf-play');
  const sound = frame.querySelector('.cf-sound');
  const icons = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
    muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  };
  // Con movimiento reducido el video no arranca solo; queda el botón de reproducir.
  let userPaused = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const start = () => { const p = video.play(); if (p) p.catch(() => {}); };
  const paint = () => {
    play.innerHTML = video.paused ? icons.play : icons.pause;
    play.setAttribute('aria-label', video.paused ? 'Reproducir video' : 'Pausar video');
    sound.innerHTML = (video.muted ? icons.muted : icons.sound) + '<span class="label">' + (video.muted ? 'Activar sonido' : 'Silenciar') + '</span>';
    sound.setAttribute('aria-label', video.muted ? 'Activar sonido' : 'Silenciar video');
    sound.classList.toggle('is-on', !video.muted);
  };

  play.onclick = () => {
    userPaused = !video.paused;
    if (userPaused) video.pause(); else start();
  };
  sound.onclick = () => {
    video.muted = !video.muted;
    if (!video.muted) { userPaused = false; start(); }
    paint();
  };
  ['play', 'pause', 'volumechange'].forEach((name) => video.addEventListener(name, paint));
  paint();

  new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) video.pause();
    else if (!userPaused) start();
  }, { threshold: 0.4 }).observe(frame);
})();
