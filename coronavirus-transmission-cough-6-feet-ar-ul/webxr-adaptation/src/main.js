/**
 * WebXR adaptation — "This 3-D Simulation Shows Why Social Distancing Is So Important"
 * (NYT, April 14 2020).
 *
 * The source explainer is a GLB (transmission-200414-01.glb) holding the room, the
 * colored distance zones (opacity_target_*), three human figures, an animated camera
 * (locator3 → cam_anim9_exp) and two driver-node systems that the "Take 001" clip (~25.8 s)
 * animates:
 *   - opacity_driver_N.x * 100  → opacity of opacity_target_N (fade the colored zones in/out)
 *   - cough_driver_0..11.x * 100 → emission gate for 12 successive puffs of the cough cloud
 *
 * The actual droplet cloud was a SEPARATE .pcd point cloud in the original (not in the GLB),
 * which earlier adaptations never rendered. Here we RECONSTRUCT it procedurally and — crucially —
 * anchor it to the model's REAL world-space frame, read at runtime:
 *   - emit point  = world position of the cough_driver nodes (the cougher's mouth), and
 *   - cough axis  = direction from the 3 ft to the 26 ft distance marker (label_* nodes),
 * so the plume starts at the cougher's mouth and travels along the measured axis toward the
 * other figures, exactly like the source. Large droplets fall near the cougher; small aerosols
 * drift far and linger.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRButton } from 'three/addons/VRButton.js';

const ASSET_BASE = '../captures/active/';
const data = await fetch('./data/beats.json').then(r => r.json());
const BEATS = data.beats;
const DURATION = data.duration || 25.83;
const RING_FT = [3, 6, 10, 16, 26];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06080d);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
try { renderer.xr.setReferenceSpaceType('local'); } catch (e) {}
document.body.appendChild(renderer.domElement);
const vrbtn = VRButton.createButton(renderer); vrbtn.classList.add('vrbtn-fallback'); document.body.appendChild(vrbtn);

scene.add(new THREE.AmbientLight(0xffffff, 1.7));
const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(3, 8, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0xcfe0ff, 0.55); fill.position.set(-4, 2, -3); scene.add(fill);

const rig = new THREE.Group(); const xrCam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1e5); rig.add(xrCam); scene.add(rig);

const loader = new GLTFLoader();
const gltf = await new Promise((res, rej) => loader.load(ASSET_BASE + data.model, res, undefined, rej));
scene.add(gltf.scene);   // NOTE: do NOT scale the scene — scaling also scales the in-GLB camera and breaks its view matrix (black screen).

// Use the GLB's own animated camera (driven by the clip → it moves with each beat, like the original).
const _box = new THREE.Box3().setFromObject(gltf.scene);
const R0 = Math.max(_box.getBoundingSphere(new THREE.Sphere()).radius, 0.01);
let cam = gltf.cameras && gltf.cameras[0];
if (!cam) { cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, R0 * 0.001, R0 * 1000); cam.position.set(0, R0, R0 * 2.5); cam.lookAt(0, 0, 0); }
cam.near = R0 * 0.001; cam.far = R0 * 1000; cam.updateProjectionMatrix();

// ---- collect driver nodes ----
const drivers = {}, targets = {}, coughDrivers = [];
gltf.scene.traverse((o) => {
  let m = o.name && o.name.match(/^opacity_driver_(\d+)$/); if (m) drivers[m[1]] = o;
  let c = o.name && o.name.match(/^cough_driver_(\d+)$/); if (c) coughDrivers[+c[1]] = o;
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

// ---- decode the 12 cough-puff emission times straight from the clip ----
const emitT = new Array(12).fill(0).map((_, i) => 0.7 + i * 1.2); // fallback spacing
(function decodeEmitTimes() {
  const found = new Array(12).fill(null);
  for (let t = 0; t <= DURATION; t += 0.05) {
    mixer.setTime(t);
    for (let k = 0; k < 12; k++) {
      if (found[k] === null && coughDrivers[k] && coughDrivers[k].position.x * 100 >= 0.05) found[k] = t;
    }
  }
  for (let k = 0; k < 12; k++) if (found[k] !== null) emitT[k] = found[k];
  mixer.setTime(0);
})();

// ===================== REAL world-space frame (read from the model) =====================
gltf.scene.updateMatrixWorld(true);
const figMain = gltf.scene.getObjectByName('figure_main_geo');
const fbox = figMain ? new THREE.Box3().setFromObject(figMain) : new THREE.Box3(new THREE.Vector3(-0.01, 0, -0.01), new THREE.Vector3(0.01, 0.017, 0.01));
const fc = fbox.getCenter(new THREE.Vector3());
const mouthY = fbox.min.y + (fbox.max.y - fbox.min.y) * 0.855;  // mouth/face height (just below crown)
// Emit anchor = the cough_driver nodes' world position (they sit at the cougher's mouth/base).
const EMIT = new THREE.Vector3(fc.x, mouthY, fc.z);
if (coughDrivers[0]) { const w = new THREE.Vector3(); coughDrivers[0].getWorldPosition(w); EMIT.set(w.x, mouthY, w.z); }
const FOOT = new THREE.Vector3(EMIT.x, fbox.min.y, EMIT.z);     // ring centre under the cougher
// Cough axis + real scale, from the distance markers (label_3ft → label_26ft).
let DIR = new THREE.Vector3(0, 0, -1), UNIT_PER_FT = 0.00292;
const l3 = gltf.scene.getObjectByName('label_3ft'), l26 = gltf.scene.getObjectByName('label_26ft');
if (l3 && l26) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(); l3.getWorldPosition(a); l26.getWorldPosition(b);
  const d = b.clone().sub(a); d.y = 0; if (d.length() > 1e-6) { UNIT_PER_FT = d.length() / (26 - 3); DIR = d.normalize(); }
}
const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3().crossVectors(UP, DIR).normalize();
const FWD = DIR.clone();
// push the emit point to the FRONT of the mouth (out of the head), along the cough axis
EMIT.addScaledVector(DIR, 0.0028);

// ===================== cough-droplet cloud (REAL .pcd, progressively revealed) =====================
// The source is NOT an emission/spray animation. The original .pcd is a fixed point cloud and the
// cough_driver nodes are OPACITY gates that fade successive groups of points in over time (no motion).
// We load the REAL NYT droplet point cloud — the actual fluid-sim data, not a stand-in.
// FIELDS x y z + a group index (0..11) per point = the 12 cough_driver reveal groups. We fit the
// cloud into the scene at true human scale (PCD metres → scene feet) and reveal each point when its
// cough_driver fires (decoded emitT), reproducing the original's progressive near→far reveal.
const PCD_FILE = 'a_d_sequence_no_color-new_range_fix-skip-doughnut-range _small_range.pcd';
const pcdText = await fetch(ASSET_BASE + 'pointclouds/' + encodeURIComponent(PCD_FILE)).then(r => r.text());
const _ln = pcdText.split('\n');
const _di = _ln.findIndex(l => l.startsWith('DATA'));
const raw = [];
for (let i = _di + 1; i < _ln.length; i++) {
  const p = _ln[i].split(/\s+/); if (p.length < 5) continue;
  raw.push([+p[0], +p[1], +p[2], +p[4] | 0, +p[3] | 0]); // x, y, z, group(0..11), rgb-field(0..15)=colour/size
}
const COUNT = raw.length;
// PCD frame: z = up (floor ≈ 0); cough travels along the horizontal axis from group 0 (mouth) outward.
const cen = {}, cnt = {}; let zmin = Infinity;
for (const r of raw) { const g = r[3]; (cen[g] = cen[g] || [0, 0]); cen[g][0] += r[0]; cen[g][1] += r[1]; cnt[g] = (cnt[g] || 0) + 1; if (r[2] < zmin) zmin = r[2]; }
for (const g in cen) { cen[g][0] /= cnt[g]; cen[g][1] /= cnt[g]; }
const cNear = cen[0], cFar = cen[5] || cen[3];
let dirx = cFar[0] - cNear[0], diry = cFar[1] - cNear[1]; const _dl = Math.hypot(dirx, diry) || 1; dirx /= _dl; diry /= _dl;
const perpx = -diry, perpy = dirx;
const mX = cNear[0], mY = cNear[1];
const S = UNIT_PER_FT / 0.3048;            // world units per metre (1 ft = 0.3048 m) → real scale
const pos = new Float32Array(COUNT * 3);
const rev = new Float32Array(COUNT);       // reveal time = when this point's cough_driver fires
const misc = new Float32Array(COUNT * 3);  // type(0 large / 1 aerosol), size, seed
for (let i = 0; i < COUNT; i++) {
  const r = raw[i], g = Math.min(11, Math.max(0, r[3]));
  const dx = r[0] - mX, dy = r[1] - mY;
  const fwd = (dx * dirx + dy * diry) * S;  // along cough axis
  const side = (dx * perpx + dy * perpy) * S;
  const up = (r[2] - zmin) * S;             // height above floor
  pos[i * 3]     = EMIT.x + FWD.x * fwd + SIDE.x * side + UP.x * up;
  pos[i * 3 + 1] = FOOT.y + FWD.y * fwd + SIDE.y * side + UP.y * up;
  pos[i * 3 + 2] = EMIT.z + FWD.z * fwd + SIDE.z * side + UP.z * up;
  rev[i] = emitT[g] + (Math.random() * 2 - 1) * 0.18; // fades in when cough_driver g fires
  misc[i * 3] = r[4] === 0 ? 1 : 0;         // REAL colour field: 0 = aerosol (blue), else larger droplet (white)
  misc[i * 3 + 1] = 0.7 + Math.random() * 0.5;
  misc[i * 3 + 2] = Math.random();
}
const pgeo = new THREE.BufferGeometry();
pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
pgeo.setAttribute('aRev', new THREE.BufferAttribute(rev, 1));
pgeo.setAttribute('aMisc', new THREE.BufferAttribute(misc, 3));
pgeo.boundingSphere = new THREE.Sphere(FOOT.clone(), 1.0);

const pmat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uPix: { value: renderer.getPixelRatio() }, uScale: { value: 0.05 }, uCloudVis: { value: 1 } },
  vertexShader: /* glsl */`
    attribute float aRev; attribute vec3 aMisc;
    uniform float uTime, uPix, uScale;
    varying float vAlpha; varying float vType;
    void main(){
      float type=aMisc.x, size=aMisc.y, seed=aMisc.z;
      float age=uTime-aRev;
      float alpha=0.0;
      if(age>0.0){
        alpha=smoothstep(0.0,1.1,age);                 // GRADUAL fade-in in place (no spew)
        alpha*=(0.82+0.18*sin(seed*40.0+uTime*2.4));   // gentle shimmer
        alpha*=(type>0.5?0.5:0.68);                    // real cloud: keep points distinct, no blowout
      }
      vAlpha=alpha; vType=type;
      vec4 mv=modelViewMatrix*vec4(position,1.0);
      gl_PointSize=clamp(size*uScale/max(-mv.z,1e-4),0.5,4.5)*uPix;
      gl_Position=projectionMatrix*mv;
    }`,
  fragmentShader: /* glsl */`
    varying float vAlpha; varying float vType;
    uniform float uCloudVis;
    void main(){
      vec2 uv=gl_PointCoord-0.5; float d=length(uv);
      if(d>0.5||vAlpha*uCloudVis<=0.001) discard;
      float soft=smoothstep(0.5,0.0,d);
      vec3 large=vec3(0.93,0.96,1.0);    // white — "larger droplets"
      vec3 small=vec3(0.40,0.66,1.0);    // blue — "smaller droplets / aerosols"
      vec3 c=mix(large,small,step(0.5,vType));
      gl_FragColor=vec4(c, soft*vAlpha*uCloudVis);
    }`
});
const droplets = new THREE.Points(pgeo, pmat);
droplets.frustumCulled = false;
scene.add(droplets);

// Breath fog (beats 9–10): a soft GRAINY cloud of many fine dim points in front of the mouth — matches
// the 2D version's noisy exhale, NOT a smooth glow halo. Overall opacity driven by uHaze.
const BREATH_N = 4500;
const bpos = new Float32Array(BREATH_N * 3);
const bseed = new Float32Array(BREATH_N);
const bCenter = EMIT.clone().addScaledVector(DIR, 3.2 * UNIT_PER_FT); bCenter.y = EMIT.y;
const gauss = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
for (let i = 0; i < BREATH_N; i++) {
  const a = gauss() * 3.0 * UNIT_PER_FT, s = gauss() * 2.2 * UNIT_PER_FT, uu = gauss() * 1.6 * UNIT_PER_FT;
  bpos[i * 3]     = bCenter.x + FWD.x * a + SIDE.x * s + UP.x * uu;
  bpos[i * 3 + 1] = bCenter.y + FWD.y * a + SIDE.y * s + UP.y * uu;
  bpos[i * 3 + 2] = bCenter.z + FWD.z * a + SIDE.z * s + UP.z * uu;
  bseed[i] = Math.random();
}
const bgeo = new THREE.BufferGeometry();
bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
bgeo.setAttribute('aSeed', new THREE.BufferAttribute(bseed, 1));
bgeo.boundingSphere = new THREE.Sphere(bCenter.clone(), 0.3);
const bmat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uPix: { value: renderer.getPixelRatio() }, uScale: { value: 0.04 }, uHaze: { value: 0 }, uTime: { value: 0 } },
  vertexShader: /* glsl */`
    attribute float aSeed; uniform float uPix, uScale, uHaze, uTime; varying float vA;
    void main(){
      vA = uHaze * (0.4 + 0.6 * sin(aSeed * 50.0 + uTime * 1.1));   // per-grain twinkle
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = clamp(uScale / max(-mv.z, 1e-4), 0.5, 2.6) * uPix * (0.7 + aSeed * 0.7);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    varying float vA;
    void main(){
      vec2 uv = gl_PointCoord - 0.5; float d = length(uv);
      if (d > 0.5 || vA <= 0.001) discard;
      float soft = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(vec3(0.82, 0.86, 0.93), soft * vA * 0.38);   // dim grain, no bright halo
    }`
});
const breath = new THREE.Points(bgeo, bmat);
breath.frustumCulled = false; breath.visible = false;
scene.add(breath);

// ===================== distance rings + labels (centred on the cougher) =====================
function makeLabelSprite(text, highlight) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const ctx = cv.getContext('2d');
  ctx.font = '600 54px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = highlight ? '#bfe8ff' : '#cdd6e4';
  ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 10;
  ctx.fillText(text, 128, 50);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false }));
}
const ringGroup = new THREE.Group(); scene.add(ringGroup);
for (const ft of RING_FT) {
  const r = ft * UNIT_PER_FT, hi = ft === 6;
  const segs = 128, arr = new Float32Array((segs + 1) * 3);
  for (let i = 0; i <= segs; i++) { const a = i / segs * Math.PI * 2; arr[i * 3] = FOOT.x + Math.cos(a) * r; arr[i * 3 + 1] = FOOT.y + 0.0003; arr[i * 3 + 2] = FOOT.z + Math.sin(a) * r; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  ringGroup.add(new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: hi ? 0x6fd2ff : 0x44506a, transparent: true, opacity: hi ? 0.95 : 0.5 })));
  const sp = makeLabelSprite(ft + ' ft', hi);
  sp.position.copy(FOOT).addScaledVector(DIR, r); sp.position.y = FOOT.y + 0.004;
  sp.scale.set(0.013, 0.0048, 1); ringGroup.add(sp);
}

function setDropletTime(t) { pmat.uniforms.uTime.value = t; }

let curT = 0;
function scrubTo(t) { const tc = THREE.MathUtils.clamp(t, 0, DURATION); curT = tc; mixer.setTime(tc); scene.updateMatrixWorld(true); applyOpacity(); setDropletTime(tc); }
function snapRig() { const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); cam.updateWorldMatrix(true, false); cam.matrixWorld.decompose(p, q, s); rig.position.copy(p); rig.quaternion.copy(q); }

// ---- captions (with droplet color-coding) ----
function hlCaption(txt) {
  return txt
    .replace(/\b([Ll]arger droplets|large droplets)\b/g, '<span class="hl-large">$1</span>')
    .replace(/\b([Ss]maller droplets|small droplets|aerosols?)\b/g, '<span class="hl-small">$1</span>');
}
const capText = document.getElementById('caption-text');
const capPanel = document.getElementById('caption-panel');
const indicator = document.getElementById('beat-indicator');
const titleCard = document.getElementById('title-card');
const legend = document.getElementById('legend');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
document.querySelector('#title-card .headline').textContent = data.headline;
document.querySelector('#title-card .byline').textContent = data.byline;

// From the breathing beat (9) onward the original shows NO droplet cloud. Beats 9–10 show a soft
// exhale haze instead; the mask beats (11–12) show only the masked figures + distance rings.
const HAZE_BEATS = new Set([9, 10]);
let beatIndex = 0, tween = null, cloudVisCur = 1, cloudVisTarget = 1, hazeCur = 0, hazeTarget = 0;
function goToBeat(i, instant) {
  beatIndex = THREE.MathUtils.clamp(i, 0, BEATS.length - 1);
  const b = BEATS[beatIndex];
  const targetT = b.position * DURATION;
  capText.innerHTML = hlCaption(b.caption); capPanel.classList.add('show');
  indicator.textContent = (beatIndex + 1) + ' / ' + BEATS.length;
  titleCard.classList.toggle('hidden', beatIndex !== 0);
  cloudVisTarget = beatIndex >= 9 ? 0 : 1;          // no droplet cloud from the breathing beat onward
  hazeTarget = HAZE_BEATS.has(beatIndex) ? 1 : 0;
  if (instant) { cloudVisCur = cloudVisTarget; hazeCur = hazeTarget; }
  if (legend) legend.classList.toggle('show', beatIndex >= 1);
  prevBtn.disabled = beatIndex === 0; nextBtn.disabled = beatIndex === BEATS.length - 1;
  if (renderer.xr.isPresenting || instant) { scrubTo(targetT); snapRig(); }
  else { tween = { from: curT, to: targetT, start: performance.now(), dur: 1200 }; }
}
prevBtn.addEventListener('click', () => goToBeat(beatIndex - 1));
nextBtn.addEventListener('click', () => goToBeat(beatIndex + 1));
addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === ' ') goToBeat(beatIndex + 1); if (e.key === 'ArrowLeft') goToBeat(beatIndex - 1); });
for (let i = 0; i < 2; i++) { const c = renderer.xr.getController(i); c.addEventListener('select', () => goToBeat(beatIndex + 1)); rig.add(c); }
renderer.xr.addEventListener('sessionstart', () => { scrubTo(BEATS[beatIndex].position * DURATION); snapRig(); });
addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); xrCam.aspect = innerWidth / innerHeight; xrCam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); pmat.uniforms.uPix.value = renderer.getPixelRatio(); });

renderer.setAnimationLoop(() => {
  if (tween) {
    const u = Math.min(1, (performance.now() - tween.start) / tween.dur);
    const s = u * u * (3 - 2 * u);
    scrubTo(tween.from + (tween.to - tween.from) * s);
    if (u >= 1) tween = null;
  }
  // crossfade between the droplet cloud and the breath haze
  cloudVisCur += (cloudVisTarget - cloudVisCur) * 0.06;
  hazeCur += (hazeTarget - hazeCur) * 0.06;
  pmat.uniforms.uCloudVis.value = cloudVisCur;
  breath.visible = hazeCur > 0.01;
  if (breath.visible) { bmat.uniforms.uHaze.value = hazeCur; bmat.uniforms.uTime.value = performance.now() * 0.001; }
  if (renderer.xr.isPresenting) renderer.render(scene, xrCam);
  else { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.render(scene, cam); }
});

goToBeat(0, true);
document.getElementById('loading').classList.add('done');
