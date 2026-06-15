/**
 * WebXR adaptation — "See Inside Typhoon Mangkhut in 3-D" (NYT, Sept 15 2018).
 * The storm is a NASA radar point cloud (storm.pcd, ~491k points) with rainfall colour baked in
 * (blue = light, red = intense). The original's GLB camera/map live in a different, tiny coordinate
 * space that doesn't align with the geographic point cloud, so here the point cloud is the hero,
 * viewed with an orbit camera that reframes per beat (wide establishing → into the red eyewall →
 * out to the drizzle edge → landfall). Drag to rotate, scroll to zoom, Enter VR to stand inside it.
 */
import * as THREE from 'three';
import { VRButton } from 'three/addons/VRButton.js';

const ASSET_BASE = '../captures/active/';
const data = await fetch('./data/beats.json').then(r => r.json());
const BEATS = data.beats;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080a10);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
try { renderer.xr.setReferenceSpaceType('local'); } catch (e) {}
document.body.appendChild(renderer.domElement);
const vrbtn = VRButton.createButton(renderer); vrbtn.classList.add('vrbtn-fallback'); document.body.appendChild(vrbtn);

// ---------- load + parse the storm point cloud ----------
const setLoading = (m) => { const e = document.getElementById('loading'); if (e) e.textContent = m; };
const txt = await fetch(ASSET_BASE + data.pcd).then(r => r.text());
const lines = txt.split('\n');
let di = 0; while (di < lines.length && !/^DATA/.test(lines[di])) di++; di++;
const cap = lines.length - di;
const pos = new Float32Array(cap * 3), col = new Float32Array(cap * 3);
let n = 0, minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9, miny = 1e9, maxy = -1e9;
for (let i = di; i < lines.length; i++) {
  const l = lines[i]; if (!l) continue;
  const p = l.split(' '); if (p.length < 6) continue;
  const r = +p[3], g = +p[4], b = +p[5]; if (r + g + b < 20) continue; // drop empty/near-black samples
  const lon = +p[0], lat = +p[1], h = +p[2];
  pos[n * 3] = lon; pos[n * 3 + 1] = h; pos[n * 3 + 2] = lat;        // y-up: rainfall height
  col[n * 3] = r / 255; col[n * 3 + 1] = g / 255; col[n * 3 + 2] = b / 255;
  if (lon < minx) minx = lon; if (lon > maxx) maxx = lon; if (lat < minz) minz = lat; if (lat > maxz) maxz = lat; if (h < miny) miny = h; if (h > maxy) maxy = h;
  n++;
}
const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, cz = (minz + maxz) / 2;
for (let i = 0; i < n; i++) { pos[i * 3] -= cx; pos[i * 3 + 1] -= cy; pos[i * 3 + 2] -= cz; }
const SPAN = Math.max(maxx - minx, maxz - minz, 1);
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 3), 3));
geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, n * 3), 3));
const cloudMat = new THREE.PointsMaterial({ size: SPAN * 0.0045, vertexColors: true, sizeAttenuation: true });
scene.add(new THREE.Points(geo, cloudMat));

// ---------- camera (orbit around the storm centre) ----------
const target = new THREE.Vector3(0, 0, 0);
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, SPAN * 0.005, SPAN * 100);
const rig = new THREE.Group(); const xrCam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 1e4); rig.add(xrCam); scene.add(rig);
const orbit = { theta: BEATS[0].theta, phi: BEATS[0].phi, radius: BEATS[0].radius * SPAN / 5 };
const RS = SPAN / 5; // beat radii are authored relative to a ~5-unit span
function updateCam() {
  const r = orbit.radius, st = Math.sin(orbit.phi);
  cam.position.set(target.x + r * st * Math.sin(orbit.theta), target.y + r * Math.cos(orbit.phi), target.z + r * st * Math.cos(orbit.theta));
  cam.lookAt(target); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
}
updateCam();
let dragging = false, lx = 0, ly = 0;
renderer.domElement.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; tween = null; });
addEventListener('pointerup', () => (dragging = false));
addEventListener('pointermove', e => { if (!dragging || renderer.xr.isPresenting) return; orbit.theta -= (e.clientX - lx) * 0.005; orbit.phi = THREE.MathUtils.clamp(orbit.phi - (e.clientY - ly) * 0.005, 0.25, 1.5); lx = e.clientX; ly = e.clientY; });
addEventListener('wheel', e => { orbit.radius = THREE.MathUtils.clamp(orbit.radius * (1 + Math.sign(e.deltaY) * 0.1), RS * 1.5, RS * 16); tween = null; }, { passive: true });

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
  const to = { theta: b.theta, phi: b.phi, radius: b.radius * RS };
  if (instant || renderer.xr.isPresenting) { Object.assign(orbit, to); updateCam(); snapRig(); }
  else { tween = { from: { ...orbit }, to, start: performance.now(), dur: 2600 }; }
}
prevBtn.addEventListener('click', () => goToBeat(beatIndex - 1));
nextBtn.addEventListener('click', () => goToBeat(beatIndex + 1));
addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === ' ') goToBeat(beatIndex + 1); if (e.key === 'ArrowLeft') goToBeat(beatIndex - 1); });
for (let i = 0; i < 2; i++) { const c = renderer.xr.getController(i); c.addEventListener('select', () => goToBeat(beatIndex + 1)); rig.add(c); }
renderer.xr.addEventListener('sessionstart', () => { Object.assign(orbit, { theta: BEATS[beatIndex].theta, phi: BEATS[beatIndex].phi, radius: BEATS[beatIndex].radius * RS }); updateCam(); snapRig(); });
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); xrCam.aspect = innerWidth / innerHeight; xrCam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

renderer.setAnimationLoop(() => {
  if (tween) {
    const u = Math.min(1, (performance.now() - tween.start) / tween.dur), s = u * u * (3 - 2 * u);
    orbit.theta = tween.from.theta + (tween.to.theta - tween.from.theta) * s;
    orbit.phi = tween.from.phi + (tween.to.phi - tween.from.phi) * s;
    orbit.radius = tween.from.radius + (tween.to.radius - tween.from.radius) * s;
    if (u >= 1) tween = null;
  }
  if (renderer.xr.isPresenting) renderer.render(scene, xrCam);
  else { updateCam(); renderer.render(scene, cam); }
});

goToBeat(0, true);
document.getElementById('loading').classList.add('done');
