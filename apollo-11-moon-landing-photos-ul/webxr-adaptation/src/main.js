/**
 * WebXR adaptation — "Apollo 11: As They Shot It" (NYT, July 18 2019).
 * GLB explainer (lander_scene_87.glb): animated camera + "Take 001" clip, the lunar module / ladder /
 * flag / bootprints / Buzz / environment, and an opacity-driver system (opacity_driver_N.x × 100 →
 * opacity_target_N). 34 beats scrub the clip to a normalized position (from NYTG.IMMERSIVE_DATA) and
 * show the Apollo 11 transcript caption. Do NOT scale the scene (it would scale the in-GLB camera).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRButton } from 'three/addons/VRButton.js';

const ASSET_BASE = '../captures/active/';
const data = await fetch('./data/beats.json').then(r => r.json());
const BEATS = data.beats;
const DURATION = data.duration || 52;

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

scene.add(new THREE.AmbientLight(0xffffff, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(3, 8, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0xbfd0ff, 0.4); fill.position.set(-4, 2, -3); scene.add(fill);

const rig = new THREE.Group(); const xrCam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1e5); rig.add(xrCam); scene.add(rig);

const loader = new GLTFLoader();
const gltf = await new Promise((res, rej) => loader.load(ASSET_BASE + data.model, res, undefined, rej));
scene.add(gltf.scene);   // do NOT scale — scaling also scales the in-GLB camera and breaks its view matrix

const _box = new THREE.Box3().setFromObject(gltf.scene);
const R0 = Math.max(_box.getBoundingSphere(new THREE.Sphere()).radius, 0.01);
let cam = gltf.cameras && gltf.cameras[0];
if (!cam) { cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, R0 * 0.001, R0 * 1000); cam.position.set(0, R0, R0 * 2.5); cam.lookAt(0, 0, 0); }
cam.near = R0 * 0.001; cam.far = R0 * 1000; cam.updateProjectionMatrix();

const drivers = {}, targets = {};
gltf.scene.traverse((o) => {
  if (o.isMesh) { const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []); mats.forEach(mm => { mm.side = THREE.DoubleSide; }); } // panoramas are viewed from inside → render both sides
  let m = o.name && o.name.match(/^opacity_driver_(\d+)$/); if (m) drivers[m[1]] = o;
  let t = o.name && o.name.match(/^opacity_target_(\d+)$/);
  if (t) {
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    mats.forEach(mm => { mm.transparent = true; mm.depthWrite = false; });
    (targets[t[1]] = targets[t[1]] || []).push(o);
  }
});
function applyOpacity() {
  for (const n in drivers) {
    if (!targets[n]) continue;
    const op = THREE.MathUtils.clamp(drivers[n].position.x * 100, 0, 1);
    for (const mesh of targets[n]) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach(mm => { if (mm) mm.opacity = op; });
      mesh.visible = op > 0.02;
    }
  }
}

const mixer = new THREE.AnimationMixer(gltf.scene);
const clip = gltf.animations[0];
const action = mixer.clipAction(clip); action.play();
let curT = 0;
function scrubTo(t) { curT = THREE.MathUtils.clamp(t, 0, DURATION); mixer.setTime(curT); scene.updateMatrixWorld(true); applyOpacity(); }
function snapRig() { const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); cam.updateWorldMatrix(true, false); cam.matrixWorld.decompose(p, q, s); rig.position.copy(p); rig.quaternion.copy(q); }

const capText = document.getElementById('caption-text');
const capPanel = document.getElementById('caption-panel');
const indicator = document.getElementById('beat-indicator');
const titleCard = document.getElementById('title-card');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
document.querySelector('#title-card .headline').textContent = data.headline;
document.querySelector('#title-card .byline').textContent = data.byline;

let beatIndex = 0, tween = null;
function goToBeat(i, instant) {
  beatIndex = THREE.MathUtils.clamp(i, 0, BEATS.length - 1);
  const b = BEATS[beatIndex];
  const targetT = b.position * DURATION;
  capText.textContent = b.caption; capPanel.classList.add('show');
  indicator.textContent = (beatIndex + 1) + ' / ' + BEATS.length;
  titleCard.classList.toggle('hidden', beatIndex !== 0);
  prevBtn.disabled = beatIndex === 0; nextBtn.disabled = beatIndex === BEATS.length - 1;
  if (renderer.xr.isPresenting || instant) { scrubTo(targetT); snapRig(); }
  else { const dur = THREE.MathUtils.clamp(Math.abs(targetT - curT) * 620, 1300, 6500); tween = { from: curT, to: targetT, start: performance.now(), dur }; } // pace transitions by timeline distance so the camera glides instead of racing
}
prevBtn.addEventListener('click', () => goToBeat(beatIndex - 1));
nextBtn.addEventListener('click', () => goToBeat(beatIndex + 1));
addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === ' ') goToBeat(beatIndex + 1); if (e.key === 'ArrowLeft') goToBeat(beatIndex - 1); });
for (let i = 0; i < 2; i++) { const c = renderer.xr.getController(i); c.addEventListener('select', () => goToBeat(beatIndex + 1)); rig.add(c); }
renderer.xr.addEventListener('sessionstart', () => { scrubTo(BEATS[beatIndex].position * DURATION); snapRig(); });
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); xrCam.aspect = innerWidth / innerHeight; xrCam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

renderer.setAnimationLoop(() => {
  if (tween) {
    const u = Math.min(1, (performance.now() - tween.start) / tween.dur);
    const s = u * u * (3 - 2 * u);
    scrubTo(tween.from + (tween.to - tween.from) * s);
    if (u >= 1) tween = null;
  }
  if (renderer.xr.isPresenting) renderer.render(scene, xrCam);
  else { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.render(scene, cam); }
});

goToBeat(0, true);
document.getElementById('loading').classList.add('done');
