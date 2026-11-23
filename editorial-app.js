const dialog = document.querySelector('#sector-dialog');
const segmentos = document.querySelector('#segmentos');
const cards = [...segmentos.querySelectorAll('[data-sector]')];
const searchInput = document.querySelector('#search');
const results = document.querySelector('#results');
const clearSearch = document.querySelector('.clear-search');
const normalize = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function openSector(id) {
  const s = sectors.find((x) => x.id === id);
  if (!s) return;
  const image = document.querySelector('#detail-image');
  image.src = `assets/${s.id}-escena.jpg?v=4`;
  image.alt = `Concepto de empaque para ${s.name.toLowerCase()}`;
  document.querySelector('#detail-title').textContent = s.name;
  document.querySelector('#detail-text').textContent = s.text;
  document.querySelector('#detail-link').href = 'https://wa.me/573160268619?text=' + encodeURIComponent('Hola, quisiera asesoría sobre empaques para ' + s.name.toLowerCase() + '.');
  dialog.showModal();
}

cards.forEach((card) => {
  const s = sectors.find((x) => x.id === card.dataset.sector);
  card.dataset.search = normalize(`${card.textContent} ${s.name} ${s.summary} ${s.text}`);
  card.onclick = () => openSector(card.dataset.sector);
});

function search(query) {
  let count = 0;
  cards.forEach((card) => {
    card.hidden = !card.dataset.search.includes(query);
    if (!card.hidden) count += 1;
  });
  results.textContent = !query ? '' : count
    ? `${count} ${count === 1 ? 'segmento coincide' : 'segmentos coinciden'} con tu búsqueda.`
    : 'No encontramos ese término. Prueba con alimentos, mascotas, aseo o agroquímicos.';
  clearSearch.hidden = !query;
}

document.querySelector('.search').onsubmit = (e) => {
  e.preventDefault();
  search(normalize(searchInput.value.trim()));
  segmentos.scrollIntoView({ behavior: 'smooth' });
};
clearSearch.onclick = () => {
  searchInput.value = '';
  search('');
};

document.querySelector('.close').onclick = () => dialog.close();
dialog.onclick = (e) => {
  if (e.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
};

const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('nav');
const closeMenu = () => {
  nav.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'Abrir menú');
};
menu.onclick = () => {
  const open = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  if (innerWidth > 650) {
    segmentos.scrollIntoView({ behavior: 'smooth' });
    closeMenu();
  }
};
nav.querySelectorAll('a').forEach((a) => { a.onclick = closeMenu; });
