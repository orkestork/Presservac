/* Catálogo Presservac por diapositivas: navegación, buscador, inclinación 3D, medidas y "Mi cotización" */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const DATA = window.CATALOGO || {};
  const SIZES = window.MEDIDAS || {};
  const WA = '573160268619';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;

  /* ---------- Diapositivas ---------- */
  const slides = $$('.sl');
  const thumbs = $$('#thumbs button');
  const prev = $('#prev'), next = $('#next'), counter = $('#counter'), deck = $('#deck');
  const pad = (n) => String(n).padStart(2, '0');
  let current = -1, busy = false;

  function go(n, opts = {}) {
    n = Math.max(0, Math.min(slides.length - 1, n));
    if (n === current || busy) return;
    const back = n < current;
    const old = slides[current], nu = slides[n];
    if (old && !reduced) {
      busy = true;
      old.classList.remove('is-in', 'back'); old.classList.add('is-out'); old.classList.toggle('back', back);
      setTimeout(() => { old.hidden = true; old.classList.remove('is-out', 'back'); busy = false; }, 520);
    } else if (old) { old.hidden = true; }
    nu.hidden = false; nu.scrollTop = 0;
    nu.classList.remove('is-in', 'back'); void nu.offsetWidth; nu.classList.add('is-in'); nu.classList.toggle('back', back);
    current = n;
    const theme = nu.dataset.theme;
    document.body.dataset.theme = theme;
    document.body.classList.toggle('on-light', theme === 'light');
    prev.disabled = n === 0; next.disabled = n === slides.length - 1;
    counter.textContent = `${pad(n + 1)} / ${pad(slides.length)}`;
    document.documentElement.style.setProperty('--p', `${(n / (slides.length - 1)) * 100}%`);
    $('.progress i').style.width = `${(n / (slides.length - 1)) * 100}%`;
    thumbs.forEach((b, i) => b.setAttribute('aria-current', String(i === n)));
    const t = thumbs[n].parentElement, film = $('#thumbs');
    film.scrollTo({ left: t.offsetLeft - (film.clientWidth - t.offsetWidth) / 2, behavior: reduced ? 'auto' : 'smooth' });
    if (!opts.noHash) history.replaceState(null, '', `#${nu.id}`);
    // precargar vecinas
    [n - 1, n + 1].forEach(k => slides[k] && $$('img', slides[k]).forEach(i => { i.loading = 'eager'; }));
  }
  prev.addEventListener('click', () => go(current - 1));
  next.addEventListener('click', () => go(current + 1));
  thumbs.forEach(b => b.addEventListener('click', () => go(+b.dataset.go)));
  $$('[data-next]').forEach(b => b.addEventListener('click', () => go(current + 1)));
  document.addEventListener('keydown', e => {
    if (e.target.closest('textarea, input') || $('#quote').classList.contains('is-open')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(current + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(current - 1); }
    if (e.key === 'Home') go(0); if (e.key === 'End') go(slides.length - 1);
  });
  // deslizar con el dedo
  let x0 = null, y0 = null;
  deck.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  deck.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4 && !e.target.closest('.pk-opts, .chips')) go(current + (dx < 0 ? 1 : -1));
  });
  // rueda del mouse en escritorio (una página por gesto)
  let wheelLock = 0;
  deck.addEventListener('wheel', e => {
    const sl = slides[current]; if (sl.scrollHeight > sl.clientHeight + 4) return; // deja desplazar si no cabe
    if (Math.abs(e.deltaY) < 30 || Date.now() < wheelLock) return;
    wheelLock = Date.now() + 900; go(current + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });

  /* ---------- Buscador de la portada ---------- */
  $$('.chip').forEach(c => c.addEventListener('click', () => {
    const f = c.dataset.filter;
    slides.forEach((s, i) => thumbs[i].classList.toggle('is-rec', (s.dataset.tags || '').split(' ').includes(f)));
    const idx = slides.findIndex(s => s.id === c.dataset.goId);
    say(`Te recomendamos los empaques marcados con ●`);
    go(idx);
  }));

  /* ---------- Inclinación 3D y parallax ---------- */
  if (fine && !reduced) {
    $$('[data-tilt]').forEach(art => {
      const img = $('img', art);
      art.addEventListener('pointermove', e => {
        const r = art.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        img.style.transform = `rotateY(${x * 24}deg) rotateX(${-y * 18}deg) scale(1.05)`;
      });
      art.addEventListener('pointerleave', () => { img.style.transform = ''; });
    });
    const media = $('[data-parallax]');
    $('.sl-cover').addEventListener('pointermove', e => {
      const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
      media.style.transform = `translate(${x * -20}px, ${y * -14}px) scale(1.02)`;
    });
  }

  /* ---------- Aviso ---------- */
  const toast = $('.toast'); let tt;
  function say(msg) { toast.textContent = msg; toast.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('show'), 2200); }

  /* ---------- Cotización ---------- */
  const KEY = 'presservac-cotizacion';
  let items = [];
  try { items = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { items = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} };
  const quote = $('#quote'), veil = $('.q-veil'), list = $('#q-list'), notes = $('#q-notes'), send = $('#q-send');
  const countEl = $('.ch-count'), quoteBtn = $('.ch-quote');
  const has = (id) => items.some(i => i.id === id);
  function render() {
    list.innerHTML = '';
    items.forEach((it, idx) => {
      const li = document.createElement('li');
      const img = document.createElement('img'); img.alt = ''; img.src = `assets/vitrina/${it.img}.png?v=3`;
      const txt = document.createElement('div');
      const b = document.createElement('b'); b.textContent = it.name;
      const sm = document.createElement('small'); sm.textContent = it.detail || 'Formato a la medida';
      txt.append(b, sm);
      const rm = document.createElement('button'); rm.type = 'button'; rm.textContent = '×'; rm.setAttribute('aria-label', `Quitar ${it.name}`);
      rm.addEventListener('click', () => { items.splice(idx, 1); save(); render(); });
      li.append(img, txt, rm); list.append(li);
    });
    quote.classList.toggle('has-items', items.length > 0);
    countEl.textContent = items.length;
    $$('[data-add]').forEach(b => b.setAttribute('aria-pressed', String(has(b.dataset.add))));
    updateSend();
  }
  function updateSend() {
    const lines = items.map((it, i) => `${i + 1}. ${it.name}${it.detail ? ' — ' + it.detail : ''}`);
    let msg = 'Hola Presservac, quiero cotizar:\n' + lines.join('\n');
    if (notes.value.trim()) msg += '\n\nSobre mi producto: ' + notes.value.trim();
    send.href = `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;
  }
  notes.addEventListener('input', updateSend);
  const bump = () => { quoteBtn.classList.remove('bump'); void quoteBtn.offsetWidth; quoteBtn.classList.add('bump'); };
  $$('[data-add]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.add, p = DATA[id]; if (!p) return;
    if (has(id)) { items = items.filter(i => i.id !== id); say(`${p.n} salió de tu cotización`); }
    else { items.push({ id, name: p.n, img: p.img }); say(`✓ ${p.n} agregado a tu cotización`); bump(); }
    save(); render();
  }));
  let lastFocus = null;
  const openQuote = () => { lastFocus = document.activeElement; quote.classList.add('is-open'); veil.classList.add('is-open'); quote.setAttribute('aria-hidden', 'false'); $('[data-close-quote]', quote).focus(); };
  const closeQuote = () => { quote.classList.remove('is-open'); veil.classList.remove('is-open'); quote.setAttribute('aria-hidden', 'true'); lastFocus?.focus?.(); };
  $$('[data-open-quote]').forEach(b => b.addEventListener('click', openQuote));
  $$('[data-close-quote]').forEach(b => b.addEventListener('click', closeQuote));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && quote.classList.contains('is-open')) closeQuote(); });

  /* ---------- Medidas ---------- */
  let mic = '65', w = null, l = null;
  const wBox = $('#pk-w'), lBox = $('#pk-l'), sel = $('#pk-sel'), add = $('#pk-add'), bag = $('#sz-bag');
  const btn = (txt, on, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.setAttribute('aria-pressed', String(on)); b.addEventListener('click', fn); return b; };
  function paintSizes() {
    const table = SIZES[mic] || {};
    wBox.innerHTML = ''; Object.keys(table).map(Number).sort((a, b) => a - b).forEach(x => wBox.append(btn(x, x === w, () => { w = x; l = null; paintSizes(); })));
    lBox.innerHTML = '';
    if (w === null) { const s = document.createElement('span'); s.className = 'pk-empty'; s.textContent = 'Primero elige un ancho'; lBox.append(s); }
    else (table[w] || []).forEach(y => lBox.append(btn(y, y === l, () => { l = y; paintSizes(); })));
    sel.textContent = w === null ? 'Elige un ancho' : l === null ? `Ancho ${w} cm · elige el largo` : `${w} × ${l} cm · ${mic} mic`;
    add.disabled = !(w && l);
    // bolsa proporcional: 40 cm de ancho = 78 % del escenario, 70 cm de largo = 86 %
    const W = w || 20, L = l || 30;
    bag.style.setProperty('--bw', (W / 40 * 78).toFixed(1) + '%');
    bag.style.setProperty('--bh', (L / 70 * 86).toFixed(1) + '%');
    bag.classList.toggle('is-set', !!(w && l));
    $('#sz-w').textContent = w ? `${w} cm` : '— cm';
    $('#sz-l').textContent = l ? `${l} cm` : '— cm';
    $('#sz-mic').textContent = `${mic} mic`;
  }
  $$('.seg button').forEach(b => b.addEventListener('click', () => {
    mic = b.dataset.mic; w = null; l = null;
    $$('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); paintSizes();
  }));
  add.addEventListener('click', () => {
    const name = 'Bolsa al vacío genérica', detail = `${w} × ${l} cm, ${mic} mic`;
    if (items.some(i => i.name === name && i.detail === detail)) { say('Esa medida ya está en tu cotización'); return; }
    items.push({ id: `vacio-${mic}-${w}x${l}`, name, detail, img: 'vacio' }); save(); render(); bump(); say(`✓ ${detail} agregada`);
  });

  /* ---------- Inicio ---------- */
  paintSizes(); render();
  slides.forEach(s => { s.hidden = true; });
  const start = slides.findIndex(s => `#${s.id}` === location.hash);
  go(start > 0 ? start : 0, { noHash: start <= 0 });
  addEventListener('hashchange', () => { const k = slides.findIndex(s => `#${s.id}` === location.hash); if (k >= 0) go(k, { noHash: true }); });
})();
