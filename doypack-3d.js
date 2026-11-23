/* Doypack 3D — experiencia cinematográfica.
   Recorrido por scroll con cambios de cámara: PET (primer plano), barrera (vista lateral con partículas),
   PE (vista superior con sello por calor), boquilla (tapa que se desenrosca) y final con configurador
   (acabado + "tu marca" impresa en vivo). Estructura de capas de ejemplo. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const section = document.querySelector('.d3');
const stage = section?.querySelector('.d3-stage');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (section && stage) { try { init(); } catch (e) { console.warn('3D no disponible', e); section.classList.add('no-webgl'); } }

function init() {
  const { MathUtils: M } = THREE;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c4d6, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(3, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff4a5a, 1.4); rim.position.set(-5, 2, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x9cc2ff, 0.5); fill.position.set(-4, -1, 5); scene.add(fill);

  /* ---------- Forma ---------- */
  const W = 1.45, H = 2.3, CH = 0.42, RB = 0.1, SEAL = 0.06, BULGE = 0.28;
  const xl = (y) => {
    let x = -W / 2;
    if (y > H / 2 - CH) x = -W / 2 + (y - (H / 2 - CH));
    if (y < -H / 2 + RB) { const d = -H / 2 + RB - y; x = -W / 2 + RB - Math.sqrt(Math.max(0, RB * RB - d * d)); }
    return x;
  };
  const xr = (y) => { let x = W / 2; if (y < -H / 2 + RB) { const d = -H / 2 + RB - y; x = W / 2 - RB + Math.sqrt(Math.max(0, RB * RB - d * d)); } return x; };
  const xAt = (u, y) => xl(y) + (u + 1) / 2 * (xr(y) - xl(y));
  const uOf = (x, y) => 2 * (x - xl(y)) / Math.max(1e-4, xr(y) - xl(y)) - 1;
  const bulge = (u, y) => {
    const t = (y + H / 2) / H, half = (xr(y) - xl(y)) / 2, edge = half - Math.abs(u) * half;
    const seal = M.smoothstep(edge, SEAL * 0.7, SEAL * 2.6), top = 1 - M.smoothstep(t, 0.74, 0.9);
    return BULGE * Math.pow(Math.max(0, 1 - u * u), 0.55) * seal * top * (0.55 + 0.45 * Math.pow(1 - t, 1.1));
  };
  const crease = (u, y) => 0.011 * Math.sin(4.2 * y + 1.6 * u + Math.sin(2.3 * u + 1.1)) + 0.006 * Math.sin(9.5 * u - 1.7 * y + 0.7) * Math.cos(2.1 * y) + 0.003 * Math.sin(13 * y - 5 * u + 2);
  function panel(sign, inflate = 1) {
    const g = new THREE.PlaneGeometry(2, H, 90, 130), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i), y = p.getY(i), b = bulge(u, y); p.setXYZ(i, xAt(u, y), y, sign * (b * inflate + crease(u, y) * (b / BULGE))); }
    g.computeVertexNormals(); return g;
  }

  /* ---------- Acabados e impresión (personalizable) ---------- */
  const FIN = {
    metal: { base: ['#f4f6f9', '#c9cfd8', '#f7f8fa', '#bcc3cd', '#e8ebef'], ink: '#D60517', band: '#eef1f5', mat: { metalness: 0.72, roughness: 0.26, clearcoat: 0.8 } },
    kraft: { base: ['#c9a477', '#b89062', '#caa679', '#ad865a', '#c19c6e'], ink: '#051C46', band: '#D60517', mat: { metalness: 0, roughness: 0.88, clearcoat: 0 }, paper: true },
    blanco: { base: ['#ffffff', '#f2f4f7', '#ffffff', '#eceff3', '#f8f9fb'], ink: '#051C46', band: '#D60517', mat: { metalness: 0.05, roughness: 0.42, clearcoat: 0.6 } },
    clear: { base: null, ink: '#D60517', band: '#051C46', mat: { metalness: 0, roughness: 0.12, clearcoat: 1 }, clear: true },
  };
  let finish = 'metal', brand = '';
  function printTexture() {
    const f = FIN[finish];
    const c = document.createElement('canvas'); c.width = 1024; c.height = 1620; const x = c.getContext('2d');
    if (f.base) {
      const g = x.createLinearGradient(0, 0, 1024, 1620); f.base.forEach((col, i) => g.addColorStop(i / (f.base.length - 1), col));
      x.fillStyle = g; x.fillRect(0, 0, 1024, 1620);
    } else { x.fillStyle = 'rgba(235,242,250,0.22)'; x.fillRect(0, 0, 1024, 1620); }
    if (f.paper) { for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '90,60,30' : '255,240,210'},${Math.random() * .12})`; x.fillRect(Math.random() * 1024, Math.random() * 1620, 2, 2); } }
    x.fillStyle = f.ink; x.beginPath(); x.moveTo(0, 0); x.lineTo(760, 0); x.bezierCurveTo(560, 60, 220, 220, 0, 520); x.fill();
    x.strokeStyle = f.band; x.lineWidth = 22; x.beginPath(); x.moveTo(820, -10); x.bezierCurveTo(600, 70, 240, 250, -10, 590); x.stroke();
    x.fillStyle = f.ink; x.beginPath(); x.moveTo(0, 1180); x.bezierCurveTo(300, 1290, 700, 1300, 1024, 1060); x.lineTo(1024, 1620); x.lineTo(0, 1620); x.fill();
    x.strokeStyle = f.band; x.lineWidth = 26; x.beginPath(); x.moveTo(0, 1120); x.bezierCurveTo(300, 1230, 700, 1240, 1024, 1000); x.stroke();
    x.strokeStyle = f.ink; x.lineWidth = 16; x.beginPath(); x.moveTo(0, 1075); x.bezierCurveTo(300, 1185, 700, 1195, 1024, 955); x.stroke();
    if (brand) {
      x.textAlign = 'center'; x.fillStyle = '#051C46';
      let size = 150; x.font = `800 ${size}px "Plus Jakarta Sans", Arial, sans-serif`;
      while (x.measureText(brand).width > 820 && size > 60) { size -= 6; x.font = `800 ${size}px "Plus Jakarta Sans", Arial, sans-serif`; }
      x.fillText(brand, 540, 800);
      x.fillStyle = '#D60517'; x.font = '700 40px "Plus Jakarta Sans", Arial, sans-serif'; x.fillText('EMPACADO POR PRESSERVAC', 540, 870);
    }
    const sealPx = SEAL / W * 1024 * 1.2; x.fillStyle = f.clear ? 'rgba(255,255,255,.5)' : '#ffffff40';
    for (let y = 0; y < 1620; y += 6) { x.fillRect(0, y, sealPx, 2); x.fillRect(1024 - sealPx, y, sealPx, 2); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  const mats = {
    pet: new THREE.MeshPhysicalMaterial({ envMapIntensity: 1.6, side: THREE.DoubleSide, transparent: true }),
    back: new THREE.MeshPhysicalMaterial({ envMapIntensity: 1.4, side: THREE.DoubleSide, transparent: true }),
    metal: new THREE.MeshStandardMaterial({ color: 0xf1f4f8, metalness: 0.88, roughness: 0.24, envMapIntensity: 1.8, side: THREE.DoubleSide, transparent: true }),
    pe: new THREE.MeshPhysicalMaterial({ color: 0xf7f9fc, roughness: 0.42, transmission: 0.5, thickness: 0.25, ior: 1.5, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
    red: new THREE.MeshPhysicalMaterial({ color: 0xD60517, roughness: 0.3, clearcoat: 0.6 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xf6f6f6, roughness: 0.32, clearcoat: 0.4 }),
  };
  function applyFinish() {
    const f = FIN[finish], tex = printTexture();
    for (const m of [mats.pet, mats.back]) { m.map?.dispose(); m.map = tex; Object.assign(m, f.mat); m.clearcoatRoughness = 0.1; m.needsUpdate = true; }
    mats.back.roughness = Math.min(1, f.mat.roughness + 0.04);
  }
  applyFinish();
  document.fonts?.ready.then(applyFinish);

  const pouch = new THREE.Group(); scene.add(pouch);
  const backGroup = new THREE.Group(); pouch.add(backGroup);
  backGroup.add(new THREE.Mesh(panel(-1), mats.back));
  const gusset = new THREE.Mesh(new THREE.CircleGeometry(1, 64), mats.back);
  gusset.scale.set((xr(-H / 2) - xl(-H / 2)) / 2, BULGE * 0.98, 1); gusset.rotation.x = Math.PI / 2;
  gusset.position.set((xr(-H / 2) + xl(-H / 2)) / 2, -H / 2 + 0.002, 0); backGroup.add(gusset);
  const layers = [
    { mesh: new THREE.Mesh(panel(1, 0.975), mats.pe) },
    { mesh: new THREE.Mesh(panel(1, 0.99), mats.metal) },
    { mesh: new THREE.Mesh(panel(1, 1.0), mats.pet) },
  ];
  layers.forEach((l, i) => { l.base = i * 0.004; pouch.add(l.mesh); });

  // sello por calor: línea incandescente que recorre el borde de la capa PE
  const edgePts = [];
  for (let y = -H / 2 + 0.02; y <= H / 2 - 0.02; y += 0.04) edgePts.push(new THREE.Vector3(xl(y) + 0.03, y, 0.006));
  for (let x = xl(H / 2 - 0.02) + 0.03; x <= W / 2 - 0.03; x += 0.04) edgePts.push(new THREE.Vector3(x, H / 2 - 0.03, 0.006));
  for (let y = H / 2 - 0.02; y >= -H / 2 + 0.02; y -= 0.04) edgePts.push(new THREE.Vector3(xr(y) - 0.03, y, 0.006));
  const sealGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePts), 400, 0.014, 6, false);
  const sealMat = new THREE.MeshBasicMaterial({ color: 0xff6a2b, transparent: true, opacity: 0, toneMapped: false });
  const sealLine = new THREE.Mesh(sealGeo, sealMat); layers[0].mesh.add(sealLine);
  const sealIdx = sealGeo.index.count;

  // zipper y boquilla
  const extras = new THREE.Group(); pouch.add(extras);
  const zipY = H / 2 - 0.5;
  const zip = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, W * 0.7, 6, 16), mats.red);
  zip.rotation.z = Math.PI / 2; zip.position.set(0.08, zipY, bulge(0.1, zipY) * 0.6); extras.add(zip);
  const zip2 = zip.clone(); zip2.position.y -= 0.045; extras.add(zip2);
  const spout = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.06), mats.white); plate.position.y = -0.02;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.16, 40), mats.white); neck.position.y = 0.08;
  const thread = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.008, 8, 40), mats.white); thread.rotation.x = Math.PI / 2; thread.position.y = 0.15;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.02, 12, 40), mats.white); collar.rotation.x = Math.PI / 2; collar.position.y = 0.1;
  const capG = new THREE.CylinderGeometry(0.11, 0.11, 0.17, 96, 1); const cp = capG.attributes.position;
  for (let i = 0; i < cp.count; i++) { const a = Math.atan2(cp.getZ(i), cp.getX(i)), r = Math.hypot(cp.getX(i), cp.getZ(i)); if (r > 0.05) { const kk = 1 + 0.045 * (Math.sin(a * 32) > 0 ? 1 : 0); cp.setX(i, cp.getX(i) * kk); cp.setZ(i, cp.getZ(i) * kk); } }
  capG.computeVertexNormals();
  const cap = new THREE.Mesh(capG, mats.red); cap.position.y = 0.24;
  spout.add(plate, neck, thread, collar, cap);
  spout.position.set(-W / 2 + CH / 2 - 0.035, H / 2 - CH / 2 + 0.035, 0); spout.rotation.z = Math.PI / 4; extras.add(spout);

  // sombra
  const sc = document.createElement('canvas'); sc.width = sc.height = 256; const sx = sc.getContext('2d');
  const rg = sx.createRadialGradient(128, 128, 10, 128, 128, 128); rg.addColorStop(0, 'rgba(5,28,70,.45)'); rg.addColorStop(1, 'rgba(5,28,70,0)');
  sx.fillStyle = rg; sx.fillRect(0, 0, 256, 256);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -H / 2 - 0.16; scene.add(shadow);

  // partículas de la barrera
  const N = 48, pMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, toneMapped: false });
  const parts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 12, 12), pMat, N); pouch.add(parts);
  const cols = [new THREE.Color(0xffd54a), new THREE.Color(0x5ba8ff), new THREE.Color(0x5ee0e8)];
  const P = [...Array(N)].map(() => ({ x: (Math.random() - .5) * W * 0.6 + 0.08, y: (Math.random() - .5) * H * 0.6, ph: Math.random(), sp: 0.7 + Math.random() * 0.6, dx: (Math.random() - .5) * 0.5 }));
  P.forEach((_, i) => parts.setColorAt(i, cols[i % 3]));
  const dummy = new THREE.Object3D();

  /* ---------- HTML: etiquetas, ficha de detalle, configurador ---------- */
  const labels = [...section.querySelectorAll('.d3-label')];
  const items = [...section.querySelectorAll('.d3-layers li')];
  const lines = [...section.querySelectorAll('.d3-lines line')];
  const xsec = section.querySelector('.d3-xsec'), xrows = [...section.querySelectorAll('.d3-xsec [data-l]')];
  const hint = section.querySelector('.d3-hint');
  const card = section.querySelector('.d3-focus');
  const STEPS = [
    { n: '01', k: 'PET impreso · 12 µm', t: 'Tu marca, en primer plano', b: ['Va impresa por el reverso: la tinta queda protegida', 'Acabado brillante o mate', 'Da rigidez y resistencia al rayado'] },
    { n: '02', k: 'Barrera metalizada · 7–9 µm', t: 'El escudo de tu producto', b: ['Bloquea luz, oxígeno y humedad', 'Conserva aroma, sabor y textura', 'Es más delgada que un cabello humano'] },
    { n: '03', k: 'PE de sellado · 80–120 µm', t: 'Sella con calor y protege por dentro', b: ['Los bordes se funden y quedan herméticos', 'Es la capa que toca el producto', 'Da cuerpo y resistencia a la caída'] },
    { n: '04', k: 'Zipper y boquilla', t: 'Abre, sirve y vuelve a cerrar', b: ['Boquilla con tapa rosca para líquidos', 'Zipper resellable para secos', 'Se eligen según tu producto'] },
    { n: '05', k: 'Personalízalo', t: 'Así se vería tu doypack', b: ['Elige el acabado', 'Escribe el nombre de tu marca', 'Cotízalo con nuestro equipo'] },
  ];
  let shownStep = -2;
  function showCard(f) {
    if (!card || f === shownStep) return; shownStep = f;
    if (f < 0) { card.classList.remove('is-on'); return; }
    const st = STEPS[f]; card.classList.remove('is-on'); card.dataset.side = f % 2 ? 'right' : 'left'; void card.offsetWidth;
    card.querySelector('.df-n').textContent = st.n; card.querySelector('.df-k').textContent = st.k; card.querySelector('.df-t').textContent = st.t;
    const ul = card.querySelector('.df-b'); ul.innerHTML = ''; st.b.forEach(x => { const li = document.createElement('li'); li.textContent = x; ul.append(li); });
    card.classList.add('is-on');
  }
  section.querySelectorAll('.d3-finish button').forEach(b => b.addEventListener('click', () => {
    finish = b.dataset.finish; section.querySelectorAll('.d3-finish button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    layers[1].mesh.visible = finish !== 'clear'; applyFinish();
  }));
  const brandInput = section.querySelector('.d3-brand input'); let bt;
  brandInput?.addEventListener('input', () => { clearTimeout(bt); bt = setTimeout(() => { brand = brandInput.value.trim().slice(0, 18).toUpperCase(); applyFinish(); }, 120); });

  /* ---------- Interacción ---------- */
  let dragRot = 0, dragTarget = 0, startX = null, startRot = 0;
  stage.addEventListener('pointerdown', e => { if (e.target.closest('.d3-config')) return; startX = e.clientX; startRot = dragTarget; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', e => { if (startX !== null) dragTarget = startRot + (e.clientX - startX) * 0.008; });
  const end = () => { startX = null; }; stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);

  const scrollP = () => { if (reduced) return 0.9; const r = section.getBoundingClientRect(); return M.clamp(-r.top / (r.height - innerHeight), 0, 1); };
  const ease = t => t * t * (3 - 2 * t);
  const part = (p, a, b) => ease(M.clamp((p - a) / (b - a), 0, 1));

  let narrow = false;
  function resize() { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; narrow = w / h < 0.9; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(stage); resize();

  let visible = false, raf = 0, p = scrollP(); const clock = new THREE.Clock();
  const v = new THREE.Vector3(), wp = new THREE.Vector3(), camPos = new THREE.Vector3(0, 0.3, 8), camTgt = new THREE.Vector3(0, 0.05, 0);
  const goalPos = new THREE.Vector3(), goalTgt = new THREE.Vector3();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) loop(); }, { rootMargin: '120px' }).observe(section);

  function loop() {
    if (!visible) { raf = 0; return; }
    raf = requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    p += (scrollP() - p) * (reduced ? 1 : 0.08);
    const s = [part(p, .08, .2), part(p, .24, .36), part(p, .4, .52), part(p, .56, .68)];
    const back = part(p, .74, .84);                                         // la bolsa se vuelve a armar
    const focus = p < .08 ? -1 : p < .24 ? 0 : p < .4 ? 1 : p < .56 ? 2 : p < .74 ? 3 : 4;
    const k = 1 - back;

    // abanico de capas
    const SP = narrow ? 0.95 : 1.4, spread = 0.55 + 0.45 * Math.max(s[1], s[2]);
    const T = { pet: [-1.5, 0.55], met: [-0.5, 0.35], pe: [0.5, 0.18], back: [1.5, 0] };
    const mv = (obj, tg, amt, base) => obj.position.set(tg[0] * SP * spread * amt * k, 0, base + tg[1] * amt * k);
    mv(layers[2].mesh, T.pet, s[0], layers[2].base);
    mv(layers[1].mesh, T.met, Math.max(s[1], s[0] * .45), layers[1].base);
    mv(layers[0].mesh, T.pe, Math.max(s[2], s[1] * .45), layers[0].base);
    mv(backGroup, T.back, Math.max(s[2], s[1] * .45), 0);
    extras.position.set(-0.12 * s[3] * k, 0.16 * s[3] * k, 0.55 * s[3] * k);
    zip.visible = zip2.visible = s[3] > 0.02 && back < 0.95;
    const capOn = focus === 3 ? 1 : 0;                                      // tapa que se desenrosca
    cap.position.y = M.lerp(cap.position.y, 0.24 + 0.16 * capOn * (0.5 + 0.5 * Math.sin(t * 1.6)), .08);
    cap.rotation.y += capOn * 0.06;
    zip2.position.y = zipY - 0.045 - capOn * 0.05 * (0.5 + 0.5 * Math.sin(t * 2.2));

    // transparencias de enfoque
    const ghost = 0.12, explaining = focus >= 0 && focus <= 3;
    const want = { pet: !explaining || focus === 0 ? 1 : ghost, metal: !explaining || focus === 1 ? 1 : ghost, pe: !explaining || focus === 2 ? 0.95 : ghost, back: !explaining ? 1 : ghost };
    if (focus === 3) want.pet = want.metal = want.pe = want.back = 0.28;
    if (finish === 'clear' && focus === 4) { want.pet = 0.55; want.back = 0.55; }
    for (const m of ['pet', 'metal', 'pe', 'back']) { mats[m].opacity = M.lerp(mats[m].opacity, want[m], .1); mats[m].depthWrite = mats[m].opacity > 0.85; }

    // sello por calor
    sealMat.opacity = M.lerp(sealMat.opacity, focus === 2 ? 1 : 0, .1);
    sealLine.visible = sealMat.opacity > 0.02;
    if (sealLine.visible) { const run = (t % 2.4) / 2.4; sealGeo.setDrawRange(0, Math.floor(sealIdx * run / 3) * 3); }

    // rotación del grupo
    dragRot += (dragTarget - dragRot) * 0.08;
    const openAmt = ease(M.clamp(p * 1.7, 0, 1)) * k;
    const turn = focus === 4 && !reduced ? Math.sin(t * 0.35) * 0.6 - 0.3 : 0;
    pouch.rotation.y = M.lerp(0.32 + Math.sin(t * 0.5) * 0.12, -0.5, openAmt) + turn + dragRot;
    pouch.rotation.x = 0.05 + Math.sin(t * 0.7) * 0.015;
    pouch.position.y = Math.sin(t * 1.1) * 0.03;
    shadow.material.opacity = 0.9 - Math.sin(t * 1.1) * 0.1;

    // cámara cinematográfica por etapa
    pouch.updateMatrixWorld(true);
    const far = narrow ? 1.35 : 1;
    if (focus === 0) { layers[2].mesh.getWorldPosition(wp); goalTgt.copy(wp).add(v.set(0.05, 0.15, 0.2)); goalPos.copy(goalTgt).add(v.set(-0.6, 0.35, 6.6 * far)); }
    else if (focus === 1) { layers[1].mesh.getWorldPosition(wp); goalTgt.copy(wp).add(v.set(0, 0.05, 0.25)); goalPos.copy(goalTgt).add(v.set(4.4 * far, 0.55, 4.6 * far)); }
    else if (focus === 2) { layers[0].mesh.getWorldPosition(wp); goalTgt.copy(wp).add(v.set(0, 0.0, 0.1)); goalPos.copy(goalTgt).add(v.set(-1.4, 3.2, 5.6 * far)); }
    else if (focus === 3) { cap.getWorldPosition(wp); goalTgt.copy(wp).add(v.set(0.3, -0.75, 0)); goalPos.copy(goalTgt).add(v.set(1.6, 0.7, 5.6 * far)); }
    else if (focus === 4) { goalTgt.set(narrow ? 0 : 0.75, narrow ? -1.1 : 0.05, 0); goalPos.set(narrow ? 0 : 0.95, narrow ? -0.6 : 0.35, (narrow ? 9.2 : 7.6)); }
    else { goalTgt.set(0, 0.05, 0); goalPos.set(0, 0.25, 7.4 * far); }
    if (narrow && focus >= 0 && focus <= 3) { goalTgt.y -= 0.45; goalPos.y -= 0.45; }
    const lerpK = reduced ? 1 : 0.06;
    camPos.lerp(goalPos, lerpK); camTgt.lerp(goalTgt, lerpK * 1.3);
    camera.position.copy(camPos); camera.lookAt(camTgt);

    // partículas
    pMat.opacity = M.lerp(pMat.opacity, focus === 1 ? 1 : 0, .12);
    parts.visible = pMat.opacity > 0.03;
    if (parts.visible) {
      const zMetal = layers[1].mesh.position.z, gap = Math.max(0.3, layers[2].mesh.position.z - zMetal + 0.2), xo = layers[1].mesh.position.x;
      P.forEach((q, i) => {
        const kk = ((t * q.sp * 0.6) + q.ph) % 1;
        const z = kk < .5 ? M.lerp(zMetal + gap, zMetal + 0.04, kk * 2) : M.lerp(zMetal + 0.04, zMetal + gap, (kk - .5) * 2);
        const x = q.x + (kk < .5 ? 0 : (kk - .5) * 2 * q.dx);
        dummy.position.set(x + xo, q.y, z + bulge(uOf(x, q.y), q.y));
        dummy.scale.setScalar(kk > .46 && kk < .54 ? 1.8 : 1); dummy.updateMatrix(); parts.setMatrixAt(i, dummy.matrix);
      });
      parts.instanceMatrix.needsUpdate = true;
    }
    renderer.render(scene, camera);

    // etiqueta de la capa activa
    const w = stage.clientWidth, h = stage.clientHeight;
    const anchors = [layers[2].mesh, layers[1].mesh, layers[0].mesh];
    labels.forEach((lab, i) => {
      if (i < 3) anchors[i].localToWorld(v.set(xAt(0.2, H / 2 - 0.08), H / 2 - 0.08, 0)); else cap.localToWorld(v.set(0, 0.1, 0));
      v.project(camera);
      const ax = (v.x * .5 + .5) * w, ay = (-v.y * .5 + .5) * h;
      const show = focus === i && v.z < 1;
      const lw = lab.offsetWidth, lift = narrow ? 34 : 54, lx = M.clamp(ax - lw / 2, 6, w - lw - 6), ly = ay - lift - 14;
      lab.style.opacity = show ? 1 : 0; lab.classList.toggle('is-focus', show);
      lab.style.transform = `translate(${lx}px, ${ly}px)`;
      if (lines[i]) { lines[i].setAttribute('x1', ax); lines[i].setAttribute('y1', ay); lines[i].setAttribute('x2', ax); lines[i].setAttribute('y2', ly + 28); lines[i].style.opacity = show ? 1 : 0; }
    });
    items.forEach((it, i) => { it.classList.toggle('is-on', focus >= i); it.classList.toggle('is-focus', focus === i); });
    if (xsec) { xsec.classList.toggle('is-on', focus >= 0 && focus <= 2); xrows.forEach(r => r.classList.toggle('is-focus', +r.dataset.l === focus)); }
    section.classList.toggle('is-barrier', focus === 1);
    section.classList.toggle('is-final', focus === 4);
    showCard(focus);
    if (hint) hint.style.opacity = p > 0.05 ? 0 : 1;
  }
}
