/**
 * WebXR adaptation — "Explore NASA's InSight Mission on Mars" (NYT AR, 2018).
 * The original is a multi-scene AR piece. This adaptation keeps its three real acts (a fourth scene in
 * the source is a car ad, dropped):
 *   1. MARS GLOBE — a textured Mars with a tour of past landing sites; each beat shows that mission's
 *      lander model and a callout (InSight, Curiosity, Phoenix, Opportunity, Spirit, Pathfinder, Viking).
 *   2. EARLY MARS — the "wet" Mars globe, an artist's conception of the planet when it had water.
 *   3. INSIGHT LANDER — the lander on a patch of Martian ground, playing its 8.5 s deployment
 *      animation while the camera moves through its three instruments (SEIS, HP³, RISE).
 * The source's per-scene camera/scale numbers are tied to its own engine, so each scene is instead
 * recentred and reframed from the GLB bounding boxes (as in Stories 8–9). Drag to rotate, scroll to
 * zoom, Next/Prev to step, Enter VR.
 */
import * as THREE from 'three';
import { VRButton } from 'three/addons/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ASSET = '../captures/active/models/';
const data = await fetch('./data/beats.json').then(r => r.json());
const BEATS = data.beats;
const setLoading = (m) => { const e = document.getElementById('loading'); if (e) e.textContent = m; };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
try { renderer.xr.setReferenceSpaceType('local'); } catch (e) {}
document.body.appendChild(renderer.domElement);
const vrbtn = VRButton.createButton(renderer); vrbtn.classList.add('vrbtn-fallback'); document.body.appendChild(vrbtn);

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const sun = new THREE.DirectionalLight(0xfff1e0, 1.5); sun.position.set(1, 1.1, 0.6); scene.add(sun);
const fill = new THREE.DirectionalLight(0x6688bb, 0.35); fill.position.set(-1, -0.3, -0.8); scene.add(fill);

// ---------- loader helpers ----------
const loader = new GLTFLoader();
const load = (name) => new Promise((res, rej) => loader.load(ASSET + name, g => res(g), undefined, rej));
function frame(obj, R) {                       // scale so bounding-sphere radius ≈ R and recentre at origin
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const r = Math.max(s.x, s.y, s.z) / 2 || 1;
  const k = R / r;
  obj.scale.multiplyScalar(k);
  obj.position.copy(c.multiplyScalar(-k));
  return R;
}

setLoading('Loading the Mars models… ');
const [marsG, wetG, starG, landerG, groundG] = await Promise.all(
  ['mars.glb', 'mars_wet.glb', 'starfield.glb', 'lander.glb', 'ground.glb'].map(load)
);

// ---------- starfield (always-on backdrop, seen from inside) ----------
const star = starG.scene;
star.traverse(o => { if (o.material) { o.material.side = THREE.BackSide; o.material.depthWrite = false; o.material.fog = false; } });
frame(star, 700); scene.add(star);

// ---------- scene 1: Mars globe + landing-site tour ----------
const marsScene = new THREE.Group(); scene.add(marsScene);
const globe = marsG.scene; frame(globe, 60); marsScene.add(globe);
// a glowing location pin on the globe's upper-front face marks the highlighted landing site.
// (The source's per-site lander GLBs are crude schematic blobs meant to read as dots on the globe,
// not as recognisable models, so the pin + caption carry the tour instead.)
const pinG = new THREE.Group();
{
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.6, 18, 18), new THREE.MeshBasicMaterial({ color: 0xffb070 }));
  head.position.set(0, 26, 0); pinG.add(head);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(4.2, 18, 18), new THREE.MeshBasicMaterial({ color: 0xff8a3c, transparent: true, opacity: 0.25 }));
  halo.position.set(0, 26, 0); pinG.add(halo);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 18, 8), new THREE.MeshBasicMaterial({ color: 0xffb070 }));
  stem.position.set(0, 17, 0); pinG.add(stem);
  pinG.position.set(0, 40, 50); pinG.lookAt(0, 40, 400);
}
marsScene.add(pinG);

// ---------- scene 2: early "wet" Mars ----------
const wetScene = new THREE.Group(); wetScene.visible = false; scene.add(wetScene);
const wetGlobe = wetG.scene; frame(wetGlobe, 55); wetScene.add(wetGlobe);

// ---------- scene 3: InSight lander on the surface ----------
const landerScene = new THREE.Group(); landerScene.visible = false; scene.add(landerScene);
const landerRoot = new THREE.Group();
landerRoot.add(landerG.scene); landerRoot.add(groundG.scene);
landerScene.add(landerRoot); frame(landerRoot, 45);
const mixer = new THREE.AnimationMixer(landerG.scene);
const clip = landerG.animations[0];
const deployDur = clip ? clip.duration : 1;
if (clip) { const a = mixer.clipAction(clip); a.play(); }

// ---------- camera / orbit ----------
const target = new THREE.Vector3(0, 0, 0);
const cam = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 1, 6000);
const rig = new THREE.Group(); const xrCam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 1e5); rig.add(xrCam); scene.add(rig);
const PRESET = {
  mars:   { theta: 0,   phi: 1.12, radius: 215 },
  wet:    { theta: 0,   phi: 1.05, radius: 135 },
  lander: { theta: 0.6, phi: 1.0,  radius: 150 }
};
const orbit = { theta: 0, phi: 1.12, radius: 150 };
let animNow = 0;            // current scrub time of the deploy animation
function updateCam() {
  const r = orbit.radius, st = Math.sin(orbit.phi);
  cam.position.set(target.x + r * st * Math.sin(orbit.theta), target.y + r * Math.cos(orbit.phi), target.z + r * st * Math.cos(orbit.theta));
  cam.lookAt(target); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
}
updateCam();

let dragging = false, lx = 0, ly = 0, idle = 0;
renderer.domElement.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; idle = 0; tween = null; });
addEventListener('pointerup', () => (dragging = false));
addEventListener('pointermove', e => { if (!dragging || renderer.xr.isPresenting) return; orbit.theta -= (e.clientX - lx) * 0.005; orbit.phi = THREE.MathUtils.clamp(orbit.phi - (e.clientY - ly) * 0.005, 0.2, 1.5); lx = e.clientX; ly = e.clientY; idle = 0; });
addEventListener('wheel', e => { orbit.radius = THREE.MathUtils.clamp(orbit.radius * (1 + Math.sign(e.deltaY) * 0.1), 60, 400); idle = 0; tween = null; }, { passive: true });

// ---------- UI ----------
const capText = document.getElementById('caption-text');
const capPanel = document.getElementById('caption-panel');
const indicator = document.getElementById('beat-indicator');
const titleCard = document.getElementById('title-card');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
document.querySelector('#title-card .headline').textContent = data.headline;
document.querySelector('#title-card .byline').textContent = data.byline;

let beatIndex = 0, tween = null, curScene = '';
function setScene(name) {
  if (name === curScene) return;
  curScene = name;
  marsScene.visible = name === 'mars';
  wetScene.visible = name === 'wet';
  landerScene.visible = name === 'lander';
}
function snapRig() { cam.updateWorldMatrix(true, false); const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); cam.matrixWorld.decompose(p, q, s); rig.position.copy(p); rig.quaternion.copy(q); }
function goToBeat(i, instant) {
  beatIndex = THREE.MathUtils.clamp(i, 0, BEATS.length - 1);
  const b = BEATS[beatIndex];
  capText.innerHTML = b.caption; capPanel.classList.add('show');
  indicator.textContent = (beatIndex + 1) + ' / ' + BEATS.length;
  titleCard.classList.toggle('hidden', beatIndex !== 0);
  prevBtn.disabled = beatIndex === 0; nextBtn.disabled = beatIndex === BEATS.length - 1;
  setScene(b.scene);
  const p = PRESET[b.scene];
  const to = {
    phi: p.phi,
    radius: b.scene === 'lander' ? (b.radius || 1.5) * 80 : p.radius,
    anim: b.scene === 'lander' ? (b.anim || 0) * deployDur : animNow
  };
  if (instant || renderer.xr.isPresenting) {
    orbit.phi = to.phi; orbit.radius = to.radius; animNow = to.anim;
    if (b.scene !== 'lander') orbit.theta = p.theta;
    updateCam(); snapRig();
  } else {
    tween = { from: { phi: orbit.phi, radius: orbit.radius, anim: animNow }, to, start: performance.now(), dur: 2200 };
  }
}
prevBtn.addEventListener('click', () => goToBeat(beatIndex - 1));
nextBtn.addEventListener('click', () => goToBeat(beatIndex + 1));
addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === ' ') goToBeat(beatIndex + 1); if (e.key === 'ArrowLeft') goToBeat(beatIndex - 1); });
for (let i = 0; i < 2; i++) { const c = renderer.xr.getController(i); c.addEventListener('select', () => goToBeat(beatIndex + 1)); rig.add(c); }
renderer.xr.addEventListener('sessionstart', () => goToBeat(beatIndex, true));
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); xrCam.aspect = innerWidth / innerHeight; xrCam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (tween) {
    const u = Math.min(1, (now - tween.start) / tween.dur), s = u * u * (3 - 2 * u);
    orbit.phi = tween.from.phi + (tween.to.phi - tween.from.phi) * s;
    orbit.radius = tween.from.radius + (tween.to.radius - tween.from.radius) * s;
    animNow = tween.from.anim + (tween.to.anim - tween.from.anim) * s;
    if (u >= 1) tween = null;
  }
  if (!dragging && !renderer.xr.isPresenting) {
    idle += dt;
    if (curScene === 'mars') globe.rotation.y += 0.16 * dt;
    else if (curScene === 'wet') wetGlobe.rotation.y += 0.20 * dt;
    else if (curScene === 'lander' && idle > 0.5) orbit.theta += 0.12 * dt;
  }
  if (curScene === 'lander' && clip) mixer.setTime(THREE.MathUtils.clamp(animNow, 0, deployDur));
  if (renderer.xr.isPresenting) renderer.render(scene, xrCam);
  else { updateCam(); renderer.render(scene, cam); }
});

goToBeat(0, true);
document.getElementById('loading').classList.add('done');
