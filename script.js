const canvas = document.getElementById('scene');
const PIXEL = isTouch() ? 0.28 : 0.35;
function isTouch() {
  return (('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0));
}
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setSize(Math.floor(innerWidth * PIXEL), Math.floor(innerHeight * PIXEL), false);
canvas.style.width = '100vw';
canvas.style.height = '100vh';
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x8ed6ef, 26, 60);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(14, 13, 18);

const hemi = new THREE.HemisphereLight(0xffffff, 0x7fae6b, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3c4, 2.0);
sun.position.set(-18, 30, 10);
scene.add(sun);
const moon = new THREE.DirectionalLight(0x8ab6ff, 0.5);
moon.position.set(18, 24, -12);
scene.add(moon);

const G = new THREE.BoxGeometry(1, 1, 1);
const GRASS = new THREE.Color(0x5dd94f);
const DIRT = new THREE.Color(0x8a5a32);
const STONE = new THREE.Color(0x8f8f9b);
const LOG = new THREE.Color(0x6b4a2b);
const LEAF = new THREE.Color(0x2f9e44);
const BEDROCK = new THREE.Color(0x3a3a46);

const BLOCK_TYPES = [
  { name: 'RUMPUT', color: 0x5dd94f },
  { name: 'BATU', color: 0x8f8f9b },
  { name: 'KAYU', color: 0x6b4a2b },
  { name: 'EMAS', color: 0xffd94a },
  { name: 'AWAN', color: 0xffffff },
  { name: 'MERAH', color: 0xff4b4b },
  { name: 'UNGU', color: 0x9b5bff },
];
let blockIdx = 0;

const SIZE = 36;
const FLOOR = 5;
const H = new Uint8Array(SIZE * SIZE);

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
}
function heightAt(x, z) {
  const nx = x / SIZE, nz = z / SIZE;
  const island = Math.max(0, 1 - Math.hypot(nx - 0.5, nz - 0.5) * 2);
  let h = FLOOR + island * 7 + noise(x * 0.11, z * 0.11) * 5 + noise(x * 0.45, z * 0.45) * 2.5;
  return Math.max(1, Math.floor(h));
}

let land, landMat, mtx;
const treeGroup = new THREE.Group();
const placedGroup = new THREE.Group();
const placedBlocks = [];
const clouds = [];
let player;

function buildWorld() {
  if (land) { scene.remove(land); land.geometry.dispose(); landMat.dispose(); }
  scene.remove(treeGroup); scene.remove(placedGroup);
  mtx = new THREE.Matrix4();
  const meshes = [];
  for (let x = 0; x < SIZE; x++) {
    for (let z = 0; z < SIZE; z++) {
      const h = heightAt(x, z);
      H[x * SIZE + z] = h;
      for (let y = 0; y <= h; y++) {
        let c;
        if (y === h) c = y === 1 ? STONE : GRASS;
        else if (y >= h - 3) c = DIRT;
        else if (y === 0) c = BEDROCK;
        else c = STONE;
        meshes.push([x + 0.5, y + 0.5, z + 0.5, c]);
      }
    }
  }
  landMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  land = new THREE.InstancedMesh(G, landMat, meshes.length);
  const col = new THREE.Color();
  for (let i = 0; i < meshes.length; i++) {
    const [px, py, pz, c] = meshes[i];
    mtx.makeTranslation(px, py, pz);
    land.setMatrixAt(i, mtx);
    col.set(c);
    land.setColorAt(i, col);
  }
  land.instanceMatrix.needsUpdate = true;
  if (land.instanceColor) land.instanceColor.needsUpdate = true;
  scene.add(land);

  const leafC = new THREE.MeshLambertMaterial({ color: LEAF });
  const logC = new THREE.MeshLambertMaterial({ color: LOG });
  for (let i = 0; i < 11; i++) {
    const tx = 3 + Math.floor(Math.random() * (SIZE - 6));
    const tz = 3 + Math.floor(Math.random() * (SIZE - 6));
    const th = H[tx * SIZE + tz];
    if (th < FLOOR + 3) continue;
    const trunk = 2 + Math.floor(Math.random() * 2);
    for (let y = 0; y < trunk; y++) treeGroup.add(box(LOG, tx + 0.5, th + 1 + y, tz + 0.5, logC));
    const lv = th + trunk;
    const leafP = [[0, 1], [1, 1], [-1, 1], [0, 2], [1, 2], [-1, 2], [0, 3]];
    for (const [dx, dy] of leafP) treeGroup.add(box(LEAF, tx + 0.5 + dx, lv + dy, tz + 0.5, leafC));
  }
  scene.add(treeGroup);
  scene.add(placedGroup);
}

function box(color, x, y, z, mat) {
  const m = mat ? null : new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(G, m);
  mesh.position.set(x, y, z);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
function addBoxToGroup(g, color, x, y, z) {
  const mesh = box(color, x, y, z);
  g.add(mesh);
  return mesh;
}

function buildPlayer() {
  const g = new THREE.Group();
  const skin = new THREE.Color(0xdd8a66);
  const shirt = new THREE.Color(0x33c3e0);
  const pants = new THREE.Color(0x3357d9);
  const hairC = new THREE.Color(0x2b2b2b);

  const head = addBoxToGroup(g, skin, 0, 2.55, 0);
  const hairTop = addBoxToGroup(g, hairC, 0, 2.95, 0);
  const hairBack = addBoxToGroup(g, hairC, 0, 2.7, -0.27);
  const eyeL = addBoxToGroup(g, 0xffffff, -0.15, 2.62, 0.28);
  const eyeR = addBoxToGroup(g, 0xffffff, 0.17, 2.62, 0.28);
  const pupL = addBoxToGroup(g, 0x1b4a8a, -0.15, 2.62, 0.33);
  const pupR = addBoxToGroup(g, 0x1b4a8a, 0.17, 2.62, 0.33);
  const body = addBoxToGroup(g, shirt, 0, 1.55, 0);
  body.scale.set(1, 1.1, 0.62);
  const armL = addBoxToGroup(g, shirt, -0.45, 1.6, 0);
  armL.scale.set(0.34, 0.9, 0.34);
  const armR = addBoxToGroup(g, shirt, 0.45, 1.6, 0);
  armR.scale.set(0.34, 0.9, 0.34);
  const handL = addBoxToGroup(g, skin, -0.45, 1.15, 0);
  handL.scale.set(0.34, 0.3, 0.34);
  const handR = addBoxToGroup(g, skin, 0.45, 1.15, 0);
  handR.scale.set(0.34, 0.3, 0.34);
  const legL = addBoxToGroup(g, pants, -0.22, 0.45, 0);
  legL.scale.set(0.34, 0.9, 0.36);
  const legR = addBoxToGroup(g, pants, 0.22, 0.45, 0);
  legR.scale.set(0.34, 0.9, 0.36);

  const top = H[(SIZE / 2) | 0];
  g.position.set(SIZE / 2 + 0.5, top + 1.4, SIZE / 2 + 0.5);
  scene.add(g);
  player = g;
}

function buildClouds() {
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group();
    const w = 2 + Math.random() * 2;
    const d = 1.2 + Math.random() * 1.2;
    for (let j = 0; j < 4; j++) {
      const p = addBoxToGroup(c, 0xffffff, (Math.random() - 0.5) * w, j === 0 ? 0.15 : 0, (Math.random() - 0.5) * d);
      p.scale.set(0.9 + Math.random() * 0.7, 0.55, 0.9 + Math.random() * 0.7);
    }
    c.position.set((Math.random() - 0.5) * 44, 17 + Math.random() * 4, (Math.random() - 0.5) * 44);
    c.userData.speed = 0.4 + Math.random() * 0.8;
    scene.add(c);
    clouds.push(c);
  }
}

function makeSunMoon() {
  const sunGeo = new THREE.BoxGeometry(2.6, 2.6, 2.6);
  const sunMesh = new THREE.Mesh(sunGeo, new THREE.MeshBasicMaterial({ color: 0xffe64d }));
  sunMesh.position.set(-20, 18, 16);
  scene.add(sunMesh);
  const moonMesh = new THREE.Mesh(sunGeo, new THREE.MeshBasicMaterial({ color: 0xeef2ff }));
  moonMesh.position.set(26, 22, -22);
  scene.add(moonMesh);
  return [sunMesh, moonMesh];
}

const STAR_COUNT = 260;
const starGeo = new THREE.BufferGeometry();
const sp = new Float32Array(STAR_COUNT * 3);
for (let i = 0; i < STAR_COUNT; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 38 + Math.random() * 26;
  sp[i * 3] = Math.cos(a) * r;
  sp[i * 3 + 1] = 18 + Math.random() * 20;
  sp[i * 3 + 2] = Math.sin(a) * r;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, sizeAttenuation: true });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

buildWorld();
buildPlayer();
buildClouds();
const [sunMesh, moonMesh] = makeSunMoon();

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;
controls.minDistance = 5;
controls.maxDistance = 42;
controls.minPolarAngle = 0.15;
controls.maxPolarAngle = Math.PI / 2.1;
controls.enablePan = false;

let dayFactor = 1, targetDay = 1;
const DAY_SKY = new THREE.Color(0x8ed6ef);
const NIGHT_SKY = new THREE.Color(0x0b1030);
const DAY_FOG = new THREE.Color(0x8ed6ef);
const NIGHT_FOG = new THREE.Color(0x0b1030);
let starsVis = 0;

function toast(txt) {
  const el = document.getElementById('msg');
  el.textContent = txt;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1600);
}

document.getElementById('btnDay').addEventListener('click', () => {
  targetDay = targetDay > 0.5 ? 0 : 1;
  toast(targetDay > 0.5 ? 'SIANG ☀' : 'MALAM ☾');
});
document.getElementById('btnWorld').addEventListener('click', () => {
  buildWorld();
  placedBlocks.length = 0;
  toast('DUNIA BARU DIJANA');
});
document.getElementById('btnRotate').addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  toast(controls.autoRotate ? 'AUTO-ROTATE ON' : 'AUTO-ROTATE OFF');
});
document.getElementById('btnBlock').addEventListener('click', () => {
  blockIdx = (blockIdx + 1) % BLOCK_TYPES.length;
  document.getElementById('btnBlock').textContent = 'BLOK: ' + BLOCK_TYPES[blockIdx].name;
});
let mode = 'letak';
const btnMode = document.getElementById('btnMode');
btnMode.addEventListener('click', () => {
  mode = mode === 'letak' ? 'buang' : 'letak';
  btnMode.textContent = 'MODE: ' + mode.toUpperCase();
  toast('MODE: ' + mode.toUpperCase());
});
window.addEventListener('keydown', e => {
  if (e.key === 'd' || e.key === 'D') document.getElementById('btnDay').click();
  if (e.key === ' ') { e.preventDefault(); controls.autoRotate = !controls.autoRotate; }
});
window.addEventListener('contextmenu', e => e.preventDefault());

const raycastable = () => [land, ...treeGroup.children, ...placedBlockChildren(), player ? [...player.children] : []];

function placedBlockChildren() {
  const arr = [];
  for (const m of placedGroup.children) arr.push(...(m.isGroup ? m.children : [m]));
  return arr;
}

let downPos = null, moved = false;
canvas.addEventListener('pointerdown', e => {
  downPos = [e.clientX, e.clientY]; moved = false;
});
canvas.addEventListener('pointermove', e => {
  if (downPos && Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) > 8) moved = true;
});
canvas.addEventListener('pointerup', e => {
  if (!downPos || moved) { downPos = null; return; }
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(raycastable(), true);
  downPos = null;
  if (!hits.length) return;
  const h = hits[0];
  const remove = (e.button === 2) || (mode === 'buang' && e.button === 0);
  if (remove) {
    const obj = h.object.userData.editable;
    if (obj) {
      obj.parent.remove(obj);
      obj.geometry.dispose(); obj.material.dispose();
      const i = placedBlocks.indexOf(obj);
      if (i >= 0) placedBlocks.splice(i, 1);
      toast('BLOK DIANGGUR');
    }
    return;
  }
  const p = h.point.clone().add(h.face.normal.clone().multiplyScalar(0.5));
  const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
  if (px < 0 || pz < 0 || px >= SIZE || pz >= SIZE || py < 0 || py > 26) return;
  if (placedBlocks.length > 400) {
    const old = placedBlocks.shift();
    old.parent.remove(old); old.geometry.dispose(); old.material.dispose();
  }
  const bt = BLOCK_TYPES[blockIdx];
  const mesh = box(bt.color, px + 0.5, py + 0.5, pz + 0.5);
  mesh.userData.editable = mesh;
  placedGroup.add(mesh);
  placedBlocks.push(mesh);
  toast('LETAK: ' + bt.name);
});

let frames = 0, fpsTime = performance.now(), fps = 0, tris = 0;
const fpsEl = document.getElementById('fps');
const trisEl = document.getElementById('tris');

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(Math.floor(innerWidth * PIXEL), Math.floor(innerHeight * PIXEL), false);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) requestAnimationFrame(animate);
});

function animate(t) {
  const time = t * 0.001;
  dayFactor += (targetDay - dayFactor) * 0.02;

  const sky = DAY_SKY.clone().lerp(NIGHT_SKY, 1 - dayFactor);
  const fog = DAY_FOG.clone().lerp(NIGHT_FOG, 1 - dayFactor);
  scene.background = sky;
  scene.fog.color = fog;
  hemi.intensity = 1.1 * dayFactor + 0.25;
  sun.intensity = 2.0 * dayFactor;
  moon.intensity = 0.5 * (1 - dayFactor) + 0.08;
  sunMesh.visible = dayFactor > 0.35;
  moonMesh.visible = dayFactor < 0.65;
  starsVis += ((dayFactor < 0.5 ? 1 : 0) - starsVis) * 0.03;
  starMat.opacity = starsVis;
  starMat.transparent = true;

  if (player) {
    player.position.y = H[(SIZE / 2) | 0] + 1.4 + Math.abs(Math.sin(time * 2.4)) * 0.35;
    player.rotation.y = Math.sin(time * 0.6) * 0.35;
  }

  for (const c of clouds) {
    c.position.x += c.userData.speed * 0.016;
    if (c.position.x > 30) c.position.x = -30;
  }

  controls.update();
  renderer.render(scene, camera);

  frames++;
  const now = performance.now();
  if (now - fpsTime > 500) {
    fps = Math.round((frames * 1000) / (now - fpsTime));
    fpsTime = now; frames = 0;
    renderer.info.autoReset = false;
    tris = renderer.info.render.triangles;
    renderer.info.reset();
    fpsEl.textContent = fps + ' FPS';
    trisEl.textContent = (tris / 1000).toFixed(1) + 'K TRI';
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);