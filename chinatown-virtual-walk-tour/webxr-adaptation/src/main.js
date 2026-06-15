/**
 * WebXR adaptation — "Chinatown, Resilient and Proud" (NYT, Dec 2 2020).
 * A photogrammetry walk down Doyers Street. The original streams Umbra 3-D tiles; we ripped
 * the rendered geometry into doyers_all.glb as 7 point-of-interest nodes (p1..p7), each baked
 * in that POI's camera (view) space — so placing the camera at the origin reproduces the view.
 * One node per story beat; drag to look around; Next/Prev to walk; Enter VR to stand inside it.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRButton } from 'three/addons/VRButton.js';

const ASSET_BASE = '../captures/active/';
const data = await fetch('./data/beats.json').then(r => r.json());
const BEATS = data.beats;

// ---------- renderer / scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101012);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
try { renderer.xr.setReferenceSpaceType('local'); } catch (e) {}   // headset starts at the captured eye
document.body.appendChild(renderer.domElement);
const vrbtn = VRButton.createButton(renderer); vrbtn.classList.add('vrbtn-fallback'); document.body.appendChild(vrbtn);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 24);  // tight far plane clips distant smeared tiles
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
scene.add(new THREE.AmbientLight(0xffffff, 1.0));

// ---------- load the street ----------
const world = new THREE.Group(); scene.add(world);
const setLoading = (m) => { const e = document.getElementById('loading'); if (e) e.textContent = m; };
const loader = new GLTFLoader();
const gltf = await new Promise((res, rej) => loader.load(ASSET_BASE + data.model, res, undefined, rej));
world.add(gltf.scene);

// Textures are baked photogrammetry color → render unlit so they look as captured.
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  const map = o.material && o.material.map ? o.material.map : null;
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  o.material = new THREE.MeshBasicMaterial({ map, color: map ? 0xffffff : 0x9b9b95, side: THREE.FrontSide });
  // hide only the original's DARK billboard quads (the mirrored in-scene year label / blank panels);
  // keep bright quads (the archival photos, which are part of the story and mask holes behind them).
  const pc = o.geometry && o.geometry.attributes.position ? o.geometry.attributes.position.count : 0;
  if (pc <= 16) {
    let bright = 255;
    if (map && map.image) { try { const c = document.createElement('canvas'); c.width = c.height = 4; const x = c.getContext('2d'); x.drawImage(map.image, 0, 0, 4, 4); const d = x.getImageData(0, 0, 4, 4).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; bright = s / (16 * 3); } catch (e) {} }
    else bright = 0; // untextured quad
    if (bright < 45) { o.visible = false; o.userData.billboard = true; }
    else if (map) { map.wrapS = THREE.RepeatWrapping; map.repeat.x = -1; map.offset.x = 1; map.needsUpdate = true; o.userData.billboard = true; } // un-mirror the kept archival photo planes
  }
});

const nodes = {};
for (const b of BEATS) { const n = gltf.scene.getObjectByName(b.node); if (n) nodes[b.node] = n; }
Object.values(nodes).forEach(n => (n.visible = false));

// ---------- VR caption panel (DOM overlay isn't visible inside VR) ----------
const capCanvas = document.createElement('canvas'); capCanvas.width = 1024; capCanvas.height = 320;
const capTex = new THREE.CanvasTexture(capCanvas); capTex.colorSpace = THREE.SRGBColorSpace;
const vrCaption = new THREE.Mesh(
  new THREE.PlaneGeometry(0.9, 0.9 * 320 / 1024),
  new THREE.MeshBasicMaterial({ map: capTex, transparent: true, depthTest: false })
);
vrCaption.position.set(0, -0.32, -1.1); vrCaption.renderOrder = 30; vrCaption.visible = false; rig.add(vrCaption);
function drawVRCaption(year, text) {
  const g = capCanvas.getContext('2d'); g.clearRect(0, 0, 1024, 320);
  g.fillStyle = 'rgba(10,12,10,0.82)'; g.beginPath(); g.roundRect(0, 0, 1024, 320, 22); g.fill();
  g.fillStyle = '#d8a657'; g.font = '600 56px georgia, serif'; g.textBaseline = 'top'; g.fillText(year || '', 36, 26);
  g.fillStyle = '#f3efe6'; g.font = '30px georgia, serif';
  let line = '', y = 104; for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > 952 && line) { g.fillText(line, 36, y); y += 40; line = w; } else line = t; } g.fillText(line, 36, y);
  capTex.needsUpdate = true;
}

// ---------- UI ----------
const capText = document.getElementById('caption-text');
const capPanel = document.getElementById('caption-panel');
const yearBadge = document.getElementById('year-badge');
const indicator = document.getElementById('beat-indicator');
const titleCard = document.getElementById('title-card');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
document.querySelector('#title-card .headline').textContent = data.headline;
document.querySelector('#title-card .byline').textContent = data.byline;

// ---------- look-around (desktop drag) ----------
let yaw = 0, pitch = 0, dragging = false, lx = 0, ly = 0;
const el = renderer.domElement;
el.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
addEventListener('pointerup', () => (dragging = false));
addEventListener('pointermove', (e) => {
  if (!dragging || renderer.xr.isPresenting) return;
  yaw -= (e.clientX - lx) * 0.0020; pitch -= (e.clientY - ly) * 0.0020;
  yaw = THREE.MathUtils.clamp(yaw, -0.32, 0.32); pitch = THREE.MathUtils.clamp(pitch, -0.20, 0.20);
  lx = e.clientX; ly = e.clientY;
});

// ---------- beats ----------
let beatIndex = 0;
function goToBeat(i) {
  beatIndex = THREE.MathUtils.clamp(i, 0, BEATS.length - 1);
  const b = BEATS[beatIndex];
  Object.values(nodes).forEach(n => (n.visible = false));
  if (nodes[b.node]) nodes[b.node].visible = true;
  yaw = 0; pitch = 0;
  if (b.fov) { camera.fov = b.fov; camera.updateProjectionMatrix(); }   // match original framing per POI
  capText.textContent = b.text; capPanel.classList.add('show');
  yearBadge.textContent = b.year || ''; yearBadge.style.opacity = b.year ? 0.92 : 0;
  indicator.textContent = (beatIndex + 1) + ' / ' + BEATS.length;
  titleCard.classList.toggle('hidden', beatIndex !== 0);
  prevBtn.disabled = beatIndex === 0; nextBtn.disabled = beatIndex === BEATS.length - 1;
  drawVRCaption(b.year, b.text);
}
prevBtn.addEventListener('click', () => goToBeat(beatIndex - 1));
nextBtn.addEventListener('click', () => goToBeat(beatIndex + 1));
addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === ' ') goToBeat(beatIndex + 1); if (e.key === 'ArrowLeft') goToBeat(beatIndex - 1); });

// VR controllers: trigger advances
for (let i = 0; i < 2; i++) { const c = renderer.xr.getController(i); c.addEventListener('select', () => goToBeat(beatIndex + 1)); rig.add(c); }
renderer.xr.addEventListener('sessionstart', () => { vrCaption.visible = true; });
renderer.xr.addEventListener('sessionend', () => { vrCaption.visible = false; });

// ---------- loop ----------
renderer.setAnimationLoop(() => {
  if (!renderer.xr.isPresenting) { camera.position.set(0, 0, 0); camera.rotation.set(pitch, yaw, 0, 'YXZ'); }
  renderer.render(scene, camera);
});

// ---------- start ----------
goToBeat(0);
document.getElementById('loading').classList.add('done');
