/**
 * WebXR adaptation — "A Volcano Turns a Town Into a Cemetery" (NYT, June 19 2018).
 * The original is an AR object piece: a single photogrammetry scan of an ash-buried truck and the
 * ground around it in San Miguel Los Lotes, Guatemala, after the Volcán de Fuego eruption. The only
 * interaction was "Rotate to explore the damage." So here the scan (car.glb, a textured unlit mesh)
 * is the hero, framed by an orbit camera that auto-rotates and can be dragged. Five caption beats,
 * drawn from the article, narrate the eruption while you circle the wreck. Enter VR to stand by it.
 */
import * as THREE from 'three';
import { VRButton } from 'three/addons/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ASSET_BASE = '../captures/active/';
const data = await fetch('./data/beats.json').then(r => r.json());
const BEATS = data.beats;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0b0a);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
try { renderer.xr.setReferenceSpaceType('local'); } catch (e) {}
document.body.appendChild(renderer.domElement);
const vrbtn = VRButton.createButton(renderer); vrbtn.classList.add('vrbtn-fallback'); document.body.appendChild(vrbtn);

// lights (the scan is mostly unlit/baked, but ambient + a soft key keep any lit submeshes legible)
scene.add(new THREE.AmbientLight(0xffffff, 1.1));
const key = new THREE.DirectionalLight(0xfff1e0, 0.7); key.position.set(1, 2, 1); scene.add(key);

// ---------- load the photogrammetry scan ----------
const setLoading = (m) => { const e = document.getElementById('loading'); if (e) e.textContent = m; };
const loader = new GLTFLoader();
const gltf = await new Promise((res, rej) =>
  loader.load(ASSET_BASE + data.model, res, (p) => setLoading('Loading the scan… ' + (p.total ? Math.round(p.loaded / p.total * 100) + '%' : '')), rej));
const model = gltf.scene;

// recentre + measure so the orbit camera frames it regardless of authored offsets
const box = new THREE.Box3().setFromObject(model);
const center = box.getCenter(new THREE.Vector3());
const size = box.getSize(new THREE.Vector3());
model.position.sub(center);                       // bring the wreck to the origin
const SPHERE = Math.max(size.x, size.y, size.z) * 0.62 + 1e-3; // ~bounding-sphere radius
scene.add(model);

// ---------- camera (orbit around the wreck) ----------
const target = new THREE.Vector3(0, size.y * 0.05, 0);
const cam = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, SPHERE * 0.01, SPHERE * 200);
const rig = new THREE.Group(); const xrCam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 1e4); rig.add(xrCam); scene.add(rig);
const orbit = { theta: 0.6, phi: BEATS[0].phi, radius: BEATS[0].radius * SPHERE };
function updateCam() {
  const r = orbit.radius, st = Math.sin(orbit.phi);
  cam.position.set(target.x + r * st * Math.sin(orbit.theta), target.y + r * Math.cos(orbit.phi), target.z + r * st * Math.cos(orbit.theta));
  cam.lookAt(target); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
}
updateCam();

let dragging = false, lx = 0, ly = 0, idle = 0;
const AUTO_SPEED = 0.0016;           // slow continuous "rotate to explore" spin when idle
renderer.domElement.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; idle = 0; tween = null; });
addEventListener('pointerup', () => (dragging = false));
addEventListener('pointermove', e => { if (!dragging || renderer.xr.isPresenting) return; orbit.theta -= (e.clientX - lx) * 0.005; orbit.phi = THREE.MathUtils.clamp(orbit.phi - (e.clientY - ly) * 0.005, 0.2, 1.45); lx = e.clientX; ly = e.clientY; idle = 0; });
addEventListener('wheel', e => { orbit.radius = THREE.MathUtils.clamp(orbit.radius * (1 + Math.sign(e.deltaY) * 0.1), SPHERE * 0.7, SPHERE * 6); idle = 0; tween = null; }, { passive: true });

// ---------- UI ----------
const capText = document.getElementById('caption-text');
const capPanel = document.getElementById('caption-panel');
const indicator = document.getElementById('beat-indicator');
const titleCard = document.getElementById('title-card');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
document.querySelector('#title-card .headline').textContent = data.headline;
document.querySelector('#title-card .byline').textContent = data.byline;

let beatIndex = 0, tween = null;
function snapRig() { cam.updateWorldMatrix(true, false); const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); cam.matrixWorld.decompose(p, q, s); rig.position.copy(p); rig.quaternion.copy(q); }
function goToBeat(i, instant) {
  beatIndex = THREE.MathUtils.clamp(i, 0, BEATS.length - 1);
  const b = BEATS[beatIndex];
  capText.textContent = b.caption; capPanel.classList.add('show');
  indicator.textContent = (beatIndex + 1) + ' / ' + BEATS.length;
  titleCard.classList.toggle('hidden', beatIndex !== 0);
  prevBtn.disabled = beatIndex === 0; nextBtn.disabled = beatIndex === BEATS.length - 1;
  const to = { phi: b.phi, radius: b.radius * SPHERE };  // beats reframe height + distance; theta keeps spinning
  if (instant || renderer.xr.isPresenting) { Object.assign(orbit, to); updateCam(); snapRig(); }
  else { tween = { from: { phi: orbit.phi, radius: orbit.radius }, to, start: performance.now(), dur: 2200 }; }
}
prevBtn.addEventListener('click', () => goToBeat(beatIndex - 1));
nextBtn.addEventListener('click', () => goToBeat(beatIndex + 1));
addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === ' ') goToBeat(beatIndex + 1); if (e.key === 'ArrowLeft') goToBeat(beatIndex - 1); });
for (let i = 0; i < 2; i++) { const c = renderer.xr.getController(i); c.addEventListener('select', () => goToBeat(beatIndex + 1)); rig.add(c); }
renderer.xr.addEventListener('sessionstart', () => { Object.assign(orbit, { phi: BEATS[beatIndex].phi, radius: BEATS[beatIndex].radius * SPHERE }); updateCam(); snapRig(); });
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); xrCam.aspect = innerWidth / innerHeight; xrCam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (tween) {
    const u = Math.min(1, (now - tween.start) / tween.dur), s = u * u * (3 - 2 * u);
    orbit.phi = tween.from.phi + (tween.to.phi - tween.from.phi) * s;
    orbit.radius = tween.from.radius + (tween.to.radius - tween.from.radius) * s;
    if (u >= 1) tween = null;
  }
  if (!dragging && !renderer.xr.isPresenting) { idle += dt; if (idle > 0.6) orbit.theta += AUTO_SPEED * 60 * dt; }
  if (renderer.xr.isPresenting) renderer.render(scene, xrCam);
  else { updateCam(); renderer.render(scene, cam); }
});

goToBeat(0, true);
document.getElementById('loading').classList.add('done');
