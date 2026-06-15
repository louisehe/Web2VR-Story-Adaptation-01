/**
 * WebXR adaptation — "Weston McKennie Is Going to Want This One Back" (NYT, Nov 25 2022)
 * Same NYT 3-D goal template, generalized opacity/annotation engine.
 * Mostly a photo scrub of the whole play, with a single 3-D climax (the missed half-volley).
 * Rebuilt from captured public assets:
 *  - world-cup-2022-usa-england-6.glb  (players, ball, projection plane, projection camera)
 *  - Field_Annots3D.glb                (field lines, goal, flags)
 *  - playoneNNNN_*.webp frame sequence (photo scrub)
 *  - data_state.json                   (Theatre.js timeline)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { VRButton } from 'three/addons/VRButton.js';

const ASSET_BASE = '../captures/active/';
const TEX_BASE = ASSET_BASE + 'textures/';
const MODEL_BASE = ASSET_BASE + 'models/';
const EYE_HEIGHT = 1.6;
const MAIN_GLB = 'nyt_mckennie__model__assets_world-cup-2022-usa-england-6.glb';
const ANNO_GLB = 'nyt_mckennie__model__assets_Field_Annots3D.glb';

// ---------- data ----------
const [anim, beatsData] = await Promise.all([
  fetch('./data/story-animation.json').then(r => r.json()),
  fetch('./data/beats.json').then(r => r.json()),
]);
const BEATS = beatsData.beats;
const TEAM = beatsData.teamColors;

// ---------- track evaluation ----------
function makeEval(keyframes, { step = false } = {}) {
  if (!keyframes || keyframes.length === 0) return null;
  const kf = keyframes.map(k => ({ t: k.t, v: typeof k.v === 'string' ? parseFloat(k.v) : k.v }));
  return (t) => {
    if (t <= kf[0].t) return kf[0].v;
    if (t >= kf[kf.length - 1].t) return kf[kf.length - 1].v;
    let i = 0;
    while (i < kf.length - 1 && kf[i + 1].t <= t) i++;
    const a = kf[i], b = kf[i + 1];
    if (step) return a.v;
    const u = (t - a.t) / (b.t - a.t);
    const s = u * u * (3 - 2 * u);
    if (typeof a.v === 'object') {
      const out = {};
      for (const k of Object.keys(a.v)) out[k] = a.v[k] + (b.v[k] - a.v[k]) * s;
      return out;
    }
    return a.v + (b.v - a.v) * s;
  };
}
const track = (obj, prop, opts) => {
  const o = anim.tracks[obj];
  return o && o[prop] ? makeEval(o[prop], opts) : null;
};
const lastSeg = (name) => name.split('/').pop().trim();

const camX = track('Camera', '["position","x"]');
const camY = track('Camera', '["position","y"]');
const camZ = track('Camera', '["position","z"]');
const frameNoEval = track('Pano / Sequence', '["frameNo"]', { step: true });
const planeOpacity = track('Main Scene / projection_plane', '["material","shader","opacity"]');

// camera target: use a track if present, else the static override
const tgtX = track('Camera Target', '["position","x"]');
const tgtY = track('Camera Target', '["position","y"]');
const tgtZ = track('Camera Target', '["position","z"]');
const tgtStatic = (anim.static['Camera Target'] || {}).position || { x: 0, y: 0.05, z: 0 };
const camStatic = anim.static['Camera'] || {};
const FOV = camStatic.fov || 12;
const camPosAt = (t) => new THREE.Vector3(camX(t), camY(t), camZ(t));
const camTgtAt = (t) => tgtX
  ? new THREE.Vector3(tgtX(t), Math.max(tgtY(t), 0.1), tgtZ(t))
  : new THREE.Vector3(tgtStatic.x, Math.max(tgtStatic.y, 0.1), tgtStatic.z);

// generic opacity tracks: key = last name segment, value = eval fn + player tints
const OPACITY_TRACKS = {};
const PLAYER_TINTS = {};
for (const obj of Object.keys(anim.tracks)) {
  const props = anim.tracks[obj];
  for (const prop of Object.keys(props)) {
    if (/opacity/.test(prop) && !/projection_plane/.test(obj)) {
      OPACITY_TRACKS[lastSeg(obj)] = makeEval(props[prop]);
    }
    if (/transitionColor/.test(prop)) {
      const m = obj.match(/(player_mesh_\S+)/);
      if (m) PLAYER_TINTS[m[1]] = makeEval(props[prop]);
    }
  }
}

// annotation color heuristic
function annoColor(name) {
  const n = name.toLowerCase();
  if (/flag|arrow|trajector|trejactory|bezier|circle|marker|penalt/.test(n)) return 0xffd23f;
  if (/openspace/.test(n)) return 0xffe066;
  return 0xf6f2e9; // lines, goal, offside
}

// ---------- renderer / scene ----------
const scene = new THREE.Scene();
const BG_COLOR = 0xe9e9e6, GRASS_COLOR = 0x86ab78;
scene.background = new THREE.Color(BG_COLOR);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.05, 2000);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(2.5, 6, 3);
scene.add(keyLight);

// ---------- projected backdrop shader (VR photo phase only) ----------
const PANO_W = anim.panoCanvas[0], PANO_H = anim.panoCanvas[1];
const normRect = (r) => new THREE.Vector4(r[0] / PANO_W, r[1] / PANO_H, r[2] / PANO_W, r[3] / PANO_H);
function planeMaterialFactory() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { map: { value: null }, rect: { value: new THREE.Vector4(0, 0, 1, 1) }, projVP: { value: new THREE.Matrix4() }, opacity: { value: 1 } },
    vertexShader: `varying vec4 vW; void main(){ vW = modelMatrix*vec4(position,1.); gl_Position = projectionMatrix*viewMatrix*vW; }`,
    fragmentShader: `
      uniform sampler2D map; uniform vec4 rect; uniform mat4 projVP; uniform float opacity; varying vec4 vW;
      void main(){
        vec4 clip = projVP*vW; if(clip.w<=0.) discard;
        vec3 ndc = clip.xyz/clip.w;
        float fu = ndc.x*.5+.5, fv = 1.-(ndc.y*.5+.5);
        vec2 uv = vec2((fu-rect.x)/(rect.z-rect.x),(fv-rect.y)/(rect.w-rect.y));
        if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.) discard;
        gl_FragColor = vec4(texture2D(map, vec2(uv.x,1.-uv.y)).rgb, opacity);
      }`,
  });
}

// ---------- loaders ----------
const texLoader = new THREE.TextureLoader();
const frameTex = {};
const loadTex = (file) => new Promise((res, rej) => texLoader.load(TEX_BASE + file, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; res(t); }, undefined, rej));
const draco = new DRACOLoader().setDecoderPath('./vendor/draco/');
const gltfLoader = new GLTFLoader().setDRACOLoader(draco);
const loadGLB = (file) => new Promise((res, rej) => gltfLoader.load(MODEL_BASE + file, res, undefined, rej));
const setLoading = (m) => { const e = document.getElementById('loading'); if (e) e.textContent = m; };

setLoading('Loading 3-D models…');
const [mainGltf, annoGltf] = await Promise.all([loadGLB(MAIN_GLB), loadGLB(ANNO_GLB)]);
scene.add(mainGltf.scene); scene.add(annoGltf.scene);
mainGltf.scene.updateMatrixWorld(true);

// projection camera (for VR backdrop)
const projCam = mainGltf.cameras && mainGltf.cameras[0];
let projVP = new THREE.Matrix4();
if (projCam) {
  projCam.updateMatrixWorld(true);
  projVP.multiplyMatrices(projCam.projectionMatrix, new THREE.Matrix4().copy(projCam.matrixWorld).invert());
}

setLoading('Loading photography…');
const inpaintedTex = anim.inpainted ? await loadTex(anim.inpainted.file) : null;

// ---------- material assignment (both scenes) ----------
let planeMesh = null;
const playerMats = {};
const annoMats = {};   // key -> [materials]
function classifyMesh(o) {
  const nm = ((o.name || '') + ' ' + (o.parent ? o.parent.name : '')).toLowerCase();
  if (/projection_plane/.test(nm)) {
    planeMesh = o;
    o.material = planeMaterialFactory();
    o.material.uniforms.projVP.value.copy(projVP);
    if (inpaintedTex) { o.material.uniforms.map.value = inpaintedTex; o.material.uniforms.rect.value.copy(normRect(anim.inpainted.rect)); }
    o.renderOrder = -5; o.visible = false;
    return;
  }
  if (/player_mesh_/.test(nm)) {
    const key = (o.name && /player_mesh_/.test(o.name)) ? o.name : o.parent.name;
    let base = 0x9aa0a6;
    // USA players: shooter, hugged, hugger, guardian, us_6, usInpainted → blue. England → white.
    if (/england/.test(nm)) base = parseInt(TEAM.england.slice(1), 16);
    else base = parseInt(TEAM.usa.slice(1), 16);
    o.material = new THREE.MeshLambertMaterial({ color: base });
    playerMats[key] = { mat: o.material, base: new THREE.Color(base) };
    return;
  }
  if (/shadow_floor|defaultobject|sprite_hide/.test(nm)) { o.visible = false; return; }
  if (/soccerball|ball_texture/.test(nm)) { o.material = new THREE.MeshLambertMaterial({ color: 0xffffff }); o.visible = false; return; } // hidden — replaced by animated shot ball
  // annotation / trajectory: match against an opacity track key
  let key = null;
  let n = o;
  while (n) { const seg = (n.name || ''); if (OPACITY_TRACKS[seg]) { key = seg; break; } n = n.parent; }
  if (!key) { // also try the mesh's own descriptive name keywords
    for (const k of Object.keys(OPACITY_TRACKS)) { if (nm.includes(k.toLowerCase())) { key = k; break; } }
  }
  if (key) {
    const mat = new THREE.MeshBasicMaterial({ color: annoColor(key), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    o.material = mat;
    o.renderOrder = /openspace/i.test(key) ? -6 : 4;
    (annoMats[key] = annoMats[key] || []).push(mat);
  } else {
    o.visible = false; // unknown geometry — don't let it occlude
  }
}
mainGltf.scene.traverse((o) => { if (o.isMesh) classifyMesh(o); });
annoGltf.scene.traverse((o) => { if (o.isMesh) classifyMesh(o); });

// ---------- player name labels ----------
function makeLabel(text, height) {
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  ctx.font = '600 64px helvetica, arial, sans-serif';
  const w = Math.ceil(ctx.measureText(text).width) + 60; c.width = w; c.height = 110;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,12,10,0.78)'; g.beginPath(); g.roundRect(0, 0, w, 96, 16); g.fill();
  g.font = '600 64px helvetica, arial, sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, 48);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(height * w / 96, height, 1); sp.renderOrder = 20;
  return sp;
}
const labels = [];
for (const pl of beatsData.playerLabels) {
  const node = mainGltf.scene.getObjectByName(pl.mesh);
  if (!node) continue;
  const box = new THREE.Box3().setFromObject(node);
  const h = Math.max(box.max.y - box.min.y, 0.05);
  const sp = makeLabel(pl.name, h * 0.3);
  sp.position.set((box.min.x + box.max.x) / 2, box.max.y + h * 0.22, (box.min.z + box.max.z) / 2);
  scene.add(sp); labels.push(sp);
}

// ---------- the shot (beat 8 climax): ball flight + yellow trajectory ----------
// The original NYT story marks McKennie's half-volley with a yellow arc that
// skyrockets over the goal into the stands. The captured GLB has no trajectory
// mesh and the ball is frozen at his foot, so we author the shot here.
// Coordinates are in scene/world units (players ≈ 0.13 tall, goal crossbar ≈ 0.25,
// goal at x ≈ -2.09; the stands are beyond the goal at x < -2.1).
const SHOT_LAUNCH_T = 13.3;   // ball leaves the foot (inside the 3-D window 13.07–16.8)
const SHOT_LAND_T = 16.4;     // ball is up in the stands
const SHOT_P0 = new THREE.Vector3(-1.45, 0.07, 0.53); // launch (shooter's foot)
const SHOT_P1 = new THREE.Vector3(-2.15, 0.85, 0.51); // apex — high, directly over the goal mouth
const SHOT_P2 = new THREE.Vector3(-2.70, 0.30, 0.50); // descending just behind the goal (into the stands)
const shotCurve = new THREE.QuadraticBezierCurve3(SHOT_P0, SHOT_P1, SHOT_P2);
const shotPos = (s) => shotCurve.getPoint(THREE.MathUtils.clamp(s, 0, 1));

// progressively-revealed yellow trajectory tube (vUv.x runs 0→1 along the curve)
const trajMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
  uniforms: { uColor: { value: new THREE.Color(0xffd23f) }, uProgress: { value: 0 }, uOpacity: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `uniform vec3 uColor; uniform float uProgress; uniform float uOpacity; varying vec2 vUv;
    void main(){ if (vUv.x > uProgress) discard; gl_FragColor = vec4(uColor, uOpacity); }`,
});
const trajMesh = new THREE.Mesh(new THREE.TubeGeometry(shotCurve, 120, 0.0045, 10, false), trajMat);
trajMesh.renderOrder = 6; trajMesh.visible = false; scene.add(trajMesh);

// the flying ball + a soft yellow marker glow at its current position
const shotBall = new THREE.Mesh(new THREE.SphereGeometry(0.012, 20, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
shotBall.renderOrder = 8; shotBall.visible = false; scene.add(shotBall);
const shotGlow = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, depthWrite: false, depthTest: false }));
shotGlow.renderOrder = 7; shotGlow.visible = false; scene.add(shotGlow);

function updateShot(t) {
  const env = planeOpacity ? (1 - planeOpacity(t)) : 0; // 0 during photo phases, 1 during the 3-D climax
  const show = env > 0.02;
  trajMesh.visible = shotBall.visible = shotGlow.visible = show;
  if (!show) return;
  const s = THREE.MathUtils.clamp((t - SHOT_LAUNCH_T) / (SHOT_LAND_T - SHOT_LAUNCH_T), 0, 1);
  const se = s * s * (3 - 2 * s); // ease the flight
  const p = shotPos(se);
  shotBall.position.copy(p); shotGlow.position.copy(p);
  trajMat.uniforms.uProgress.value = se;
  trajMat.uniforms.uOpacity.value = 0.95 * env;
  shotGlow.material.opacity = 0.35 * env;
}

// ---------- pitch ground ----------
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ color: GRASS_COLOR }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.renderOrder = -10;
scene.add(ground);

// ---------- VR caption panel ----------
const capCanvas = document.createElement('canvas'); capCanvas.width = 1024; capCanvas.height = 360;
const capTex = new THREE.CanvasTexture(capCanvas); capTex.colorSpace = THREE.SRGBColorSpace;
const captionPanel = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6 * 360 / 1024), new THREE.MeshBasicMaterial({ map: capTex, transparent: true, depthTest: false }));
captionPanel.renderOrder = 30; captionPanel.position.set(0, EYE_HEIGHT - 0.55, -1.6); captionPanel.rotation.x = -0.25; rig.add(captionPanel);
function drawCaption(text) {
  const g = capCanvas.getContext('2d'); g.clearRect(0, 0, 1024, 360);
  g.fillStyle = 'rgba(10,12,10,0.82)'; g.beginPath(); g.roundRect(0, 0, 1024, 360, 28); g.fill();
  g.fillStyle = '#fff'; g.font = '34px georgia, serif'; g.textBaseline = 'top';
  let line = '', y = 34; for (const w of text.split(' ')) { const test = line ? line + ' ' + w : w; if (g.measureText(test).width > 944 && line) { g.fillText(line, 40, y); y += 46; line = w; } else line = test; } g.fillText(line, 40, y);
  capTex.needsUpdate = true;
}
const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false });
const fadeSphere = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), fadeMat); fadeSphere.renderOrder = 100; fadeSphere.visible = false; camera.add(fadeSphere);

// ---------- frame loading ----------
// Desktop photo phases use the 2-D <img> layer (browser-cached), NOT GPU textures, so we do
// NOT preload all frames as THREE textures (73 full-res textures would exhaust GPU memory).
// For VR we lazily upload only the frame currently needed.
setLoading('Preparing…');
const ensureFrameTex = (no) => {
  if (frameTex[no] !== undefined) return frameTex[no];
  frameTex[no] = null; // mark in-flight
  loadTex(anim.frames[no].file).then(t => { frameTex[no] = t; }).catch(() => {});
  return null;
};

// ---------- timeline ----------
const photoLayer = document.getElementById('photo-layer');
const photoImg = document.getElementById('photo-img');
let currentImgFrame = null;
function applyTime(t) {
  const fno = String(Math.round(frameNoEval(t)));
  const frameOp = planeOpacity ? planeOpacity(t) : 1;
  const presenting = renderer.xr.isPresenting;
  if (!presenting) {
    if (fno !== currentImgFrame && anim.frames[fno]) { photoImg.src = TEX_BASE + anim.frames[fno].file; currentImgFrame = fno; }
    photoLayer.style.opacity = frameOp;
    photoLayer.style.visibility = frameOp > 0.01 ? 'visible' : 'hidden';
  } else { photoLayer.style.visibility = 'hidden'; }
  if (planeMesh) {
    const tex = presenting && frameOp > 0.5 ? ensureFrameTex(fno) : null;
    if (tex) { const u = planeMesh.material.uniforms; u.map.value = tex; u.rect.value.copy(normRect(anim.frames[fno].rect)); u.opacity.value = frameOp; }
    planeMesh.visible = !!tex;
  }
  for (const [key, fn] of Object.entries(OPACITY_TRACKS)) {
    if (!annoMats[key]) continue;
    const op = fn(t);
    for (const m of annoMats[key]) { m.opacity = op; m.visible = op > 0.01; }
  }
  for (const [mesh, fn] of Object.entries(PLAYER_TINTS)) {
    if (!playerMats[mesh]) continue;
    const c = fn(t), pm = playerMats[mesh];
    if (c && typeof c === 'object' && c.a > 0.01) pm.mat.color.copy(pm.base).lerp(new THREE.Color(c.r, c.g, c.b), Math.min(c.a, 1));
    else pm.mat.color.copy(pm.base);
  }
  updateShot(t);
  const lop = 1;
  const showLabels = frameOp < 0.5; // labels only during the 3-D segment
  for (const sp of labels) { sp.material.opacity = lop; sp.visible = showLabels; }
  if (!presenting) { camera.position.copy(camPosAt(t)); camera.lookAt(camTgtAt(t)); }
}
function placeRigAt(t) {
  const pos = camPosAt(t), tgt = camTgtAt(t);
  rig.position.set(pos.x, Math.max(pos.y - EYE_HEIGHT, pos.y > 3 ? pos.y - EYE_HEIGHT : 0), pos.z);
  rig.rotation.set(0, Math.atan2(tgt.x - pos.x, tgt.z - pos.z) + Math.PI, 0);
}

// ---------- beat navigation ----------
let beatIndex = 0, timelineT = BEATS[0].time, tween = null;
const captionEl = document.getElementById('caption-text');
const indicatorEl = document.getElementById('beat-indicator');
const titleCard = document.getElementById('title-card');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
document.querySelector('#title-card .kicker').textContent = beatsData.kicker;
document.querySelector('#title-card .headline').textContent = beatsData.headline;
document.querySelector('#title-card .byline').textContent = beatsData.byline;
// Sweep the timeline across the shot window so the ball actually flies the arc.
function startShotSweep() { timelineT = SHOT_LAUNCH_T; tween = { kind: 'shot', start: performance.now(), dur: 2600, fromT: SHOT_LAUNCH_T, targetT: SHOT_LAND_T }; }
function goToBeat(i, instant = false) {
  beatIndex = THREE.MathUtils.clamp(i, 0, BEATS.length - 1);
  const beat = BEATS[beatIndex];
  const isShot = beat.phase === '3d';
  captionEl.textContent = beat.text; drawCaption(beat.text);
  indicatorEl.textContent = (beatIndex + 1) + ' / ' + BEATS.length;
  titleCard.classList.toggle('hidden', beatIndex !== 0);
  prevBtn.disabled = beatIndex === 0; nextBtn.disabled = beatIndex === BEATS.length - 1;
  if (renderer.xr.isPresenting) {
    fadeSphere.visible = true;
    // for the climax, fade to the launch moment, then fly the shot after the fade
    tween = { kind: 'xrfade', start: performance.now(), dur: 700, targetT: isShot ? SHOT_LAUNCH_T : beat.time, applied: false, thenShot: isShot };
  }
  else if (isShot && !instant) {
    // Desktop climax: animate the ball along the trajectory over the goal.
    startShotSweep(); applyTime(timelineT);
  }
  else {
    // Desktop: jump straight to the beat. We deliberately do NOT scrub through every
    // intermediate photo frame — with 73 large frame images that cycles the 2-D layer
    // fast enough to stall the main thread. A short camera-only ease keeps it smooth.
    const fromT = timelineT, toT = beat.time;
    const both3D = (planeOpacity ? planeOpacity(fromT) : 1) < 0.5 && (planeOpacity ? planeOpacity(toT) : 1) < 0.5;
    if (instant || !both3D) { timelineT = toT; applyTime(timelineT); }   // photo phases jump (no frame cycling)
    else { tween = { kind: 'ease', start: performance.now(), dur: 900, fromT, targetT: toT }; } // camera-only sweep in 3-D
  }
}
prevBtn.addEventListener('click', () => goToBeat(beatIndex - 1));
nextBtn.addEventListener('click', () => goToBeat(beatIndex + 1));
addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === ' ') goToBeat(beatIndex + 1); if (e.key === 'ArrowLeft') goToBeat(beatIndex - 1); });
for (let i = 0; i < 2; i++) { const ctrl = renderer.xr.getController(i); ctrl.addEventListener('select', () => goToBeat(beatIndex + 1)); rig.add(ctrl); }
renderer.xr.addEventListener('sessionstart', () => {
  const b = BEATS[beatIndex];
  if (b.phase === '3d') { placeRigAt(SHOT_LAUNCH_T); startShotSweep(); applyTime(timelineT); }
  else { placeRigAt(b.time); timelineT = b.time; applyTime(timelineT); }
});
renderer.xr.addEventListener('sessionend', () => { rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); applyTime(timelineT); });

renderer.setAnimationLoop(() => {
  captionPanel.visible = renderer.xr.isPresenting;
  if (tween) {
    const u = Math.min(1, (performance.now() - tween.start) / tween.dur);
    if (tween.kind === 'scrub' || tween.kind === 'ease' || tween.kind === 'shot') { const s = u * u * (3 - 2 * u); timelineT = tween.fromT + (tween.targetT - tween.fromT) * s; applyTime(timelineT); if (u >= 1) tween = null; }
    else if (tween.kind === 'xrfade') {
      fadeMat.opacity = u < 0.5 ? u * 2 : (1 - u) * 2;
      if (u >= 0.5 && !tween.applied) { timelineT = tween.targetT; placeRigAt(timelineT); applyTime(timelineT); tween.applied = true; }
      if (u >= 1) { const thenShot = tween.thenShot; tween = null; fadeSphere.visible = false; fadeMat.opacity = 0; if (thenShot) startShotSweep(); } // fly the shot once the fade completes
    }
  }
  renderer.render(scene, camera);
});

// ---------- start ----------
goToBeat(0, true);
applyTime(timelineT);
document.getElementById('loading').classList.add('done');
