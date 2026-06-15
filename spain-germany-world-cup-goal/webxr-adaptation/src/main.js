/**
 * WebXR adaptation — "Germany's Late Equalizer Revives Its World Cup Hopes" (NYT, Nov 27 2022)
 * Rebuilt from captured public assets:
 *  - world-cup-2022-spain-germany.glb  (players, ball, projection plane, shadow floor, projection camera)
 *  - FieldAnnotations_spain_germany2.glb (arrows, field lines, goal, flags)
 *  - gergoalNNNN_*.webp frame sequence  (photo scrub, projected texture)
 *  - data_state.json (Theatre.js timeline: camera path, annotation opacities, frame numbers)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { VRButton } from 'three/addons/VRButton.js';

const ASSET_BASE = '../captures/active/';
const TEX_BASE = ASSET_BASE + 'textures/';
const MODEL_BASE = ASSET_BASE + 'models/';
const EYE_HEIGHT = 1.6;

// ---------- data ----------
const [anim, beatsData] = await Promise.all([
  fetch('./data/story-animation.json').then(r => r.json()),
  fetch('./data/beats.json').then(r => r.json()),
]);
const BEATS = beatsData.beats;

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
    const s = u * u * (3 - 2 * u); // smoothstep easing approximation
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

const camX = track('Camera', '["position","x"]');
const camY = track('Camera', '["position","y"]');
const camZ = track('Camera', '["position","z"]');
const tgtX = track('Camera Target', '["position","x"]');
const tgtZ = track('Camera Target', '["position","z"]');
const frameNoEval = track('Pano / Sequence', '["frameNo"]', { step: true });
const planeOpacity = track('Main Scene / projection_plane', '["material","shader","opacity"]');
const labelOpacity = track('Markers 💬 / germany-label-3d-one', '["opacity"]');

const ANNOTATION_TRACKS = {
  Arrow: track('Field Annotations / Arrow', '["material","opacity"]'),
  Arrow2: track('Field Annotations / Arrow2', '["material","opacity"]'),
  FieldLines_All: track('Field Annotations / FieldLines_All', '["material","opacity"]'),
  LowPolyGoal: track('Field Annotations / LowPolyGoal', '["material","opacity"]'),
  FlagLeft: track('Field Annotations / FlagLeft', '["material","opacity"]'),
  FlagRight: track('Field Annotations / FlagRight', '["material","opacity"]'),
  OpenSpace: track('Field Annotations / OpenSpace', '["material","opacity"]'),
};
// base colors for annotation meshes (otherwise they keep dark original materials)
const ANNOTATION_COLORS = {
  FieldLines_All: 0xf6f2e9,
  LowPolyGoal: 0xf6f2e9,
  FlagLeft: 0xffd23f,
  FlagRight: 0xffd23f,
  Arrow: 0xffd23f,
  Arrow2: 0xffd23f,
  OpenSpace: 0xffe066,
};
const PLAYER_TINTS = {};
for (const obj of Object.keys(anim.tracks)) {
  const m = obj.match(/^Main Scene \/ (player_mesh_\S+)/);
  if (m) PLAYER_TINTS[m[1]] = track(obj, '["material","shader","transitionColor"]');
}

const camStatic = anim.static['Camera'] || {};
const FOV = camStatic.fov || 17.2;
const camPosAt = (t) => new THREE.Vector3(camX(t), camY(t), camZ(t));
const camTgtAt = (t) => new THREE.Vector3(tgtX(t), 0.15, tgtZ(t)); // aim at pitch level (players sit at y≈0.06)

// ---------- renderer / scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101511);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.05, 1000);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

scene.add(new THREE.AmbientLight(0xffffff, 1.2));

// ---------- projected texture shaders ----------
const PANO_W = anim.panoCanvas[0], PANO_H = anim.panoCanvas[1];
const PROJ_GLSL = /* glsl */`
  vec2 cropUV(vec3 ndc, vec4 rect) {
    float fu = ndc.x * 0.5 + 0.5;          // 0..1 across full pano canvas
    float fv = 1.0 - (ndc.y * 0.5 + 0.5);  // measured from top
    return vec2((fu - rect.x) / (rect.z - rect.x), (fv - rect.y) / (rect.w - rect.y));
  }
  bool inside(vec2 uv) { return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0; }
`;
const PROJ_VERT = /* glsl */`
  varying vec4 vWorldPos;
  void main() {
    vWorldPos = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vWorldPos;
  }`;

// players / objects: single projected photo (freeze frame)
function projectedMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      map: { value: null },
      projVP: { value: new THREE.Matrix4() },
      rect: { value: new THREE.Vector4(0, 0, 1, 1) },
      tint: { value: new THREE.Vector4(1, 1, 1, 0) },
    },
    vertexShader: PROJ_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      uniform mat4 projVP;
      uniform vec4 rect;
      uniform vec4 tint;
      varying vec4 vWorldPos;
      ${PROJ_GLSL}
      void main() {
        vec4 clip = projVP * vWorldPos;
        vec3 ndc = clip.xyz / clip.w;
        vec2 uv = cropUV(ndc, rect);
        vec3 col = inside(uv) && clip.w > 0.0
          ? texture2D(map, vec2(uv.x, 1.0 - uv.y)).rgb
          : vec3(0.35, 0.4, 0.35);
        col = mix(col, tint.rgb, tint.a);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// backdrop plane: projected photo (live frame or inpainted), fades per Theatre.js opacity track
function planeMaterialFactory() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      map: { value: null },
      rect: { value: new THREE.Vector4(0, 0, 1, 1) },
      projVP: { value: new THREE.Matrix4() },
      opacity: { value: 1 },
    },
    vertexShader: PROJ_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      uniform vec4 rect;
      uniform mat4 projVP;
      uniform float opacity;
      varying vec4 vWorldPos;
      ${PROJ_GLSL}
      void main() {
        vec4 clip = projVP * vWorldPos;
        if (clip.w <= 0.0) discard;
        vec3 ndc = clip.xyz / clip.w;
        vec2 uv = cropUV(ndc, rect);
        if (!inside(uv)) discard;
        vec3 col = texture2D(map, vec2(uv.x, 1.0 - uv.y)).rgb;
        gl_FragColor = vec4(col, opacity);
      }`,
  });
}
const normRect = (r) => new THREE.Vector4(r[0] / PANO_W, r[1] / PANO_H, r[2] / PANO_W, r[3] / PANO_H);

// ---------- texture loading ----------
const texLoader = new THREE.TextureLoader();
const frameTex = {};
function loadTex(file) {
  return new Promise((res, rej) => texLoader.load(TEX_BASE + file, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    res(t);
  }, undefined, rej));
}

// ---------- GLB loading ----------
const draco = new DRACOLoader().setDecoderPath('./vendor/draco/');
const gltfLoader = new GLTFLoader().setDRACOLoader(draco);
const loadGLB = (file) => new Promise((res, rej) => gltfLoader.load(MODEL_BASE + file, res, undefined, rej));

const FREEZE_FRAME = '58';
const setLoading = (msg) => { document.getElementById('loading').textContent = msg; };

setLoading('Loading 3-D models…');
const [mainGltf, annoGltf] = await Promise.all([
  loadGLB('nyt_spain_germany__model__assets_world-cup-2022-spain-germany.glb'),
  loadGLB('nyt_spain_germany__model__assets_FieldAnnotations_spain_germany2.glb'),
]);
scene.add(mainGltf.scene);
scene.add(annoGltf.scene);
mainGltf.scene.updateMatrixWorld(true);

// projection camera from GLB
const projCam = mainGltf.cameras && mainGltf.cameras[0];
projCam.updateMatrixWorld(true);
projCam.aspect = 2.1555678059536936;
projCam.fov = THREE.MathUtils.radToDeg(0.49568401659713346);
projCam.updateProjectionMatrix();
const projView = new THREE.Matrix4().copy(projCam.matrixWorld).invert();
const projVP = new THREE.Matrix4().multiplyMatrices(projCam.projectionMatrix, projView);

// key textures
setLoading('Loading photography…');
const inpaintedTex = await loadTex(anim.inpainted.file);
const freezeTex = await loadTex(anim.frames[FREEZE_FRAME].file);
const freezeRect = normRect(anim.frames[FREEZE_FRAME].rect);

// projection plane material
let planeMesh = null;
const playerMats = {}; // meshName -> material
mainGltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  // GLTFLoader flattens nodes, so match against the mesh's own name + parent name.
  const nm = ((o.name || '') + ' ' + (o.parent ? o.parent.name : '')).toLowerCase();
  if (/projection_plane/.test(nm)) {
    planeMesh = o;
    o.material = planeMaterialFactory();
    o.material.uniforms.projVP.value.copy(projVP);
    o.material.uniforms.map.value = inpaintedTex;
    o.material.uniforms.rect.value.copy(normRect(anim.inpainted.rect));
    o.renderOrder = -5;
    o.visible = false; // shown only in VR photo phase (see applyTime)
  } else if (/player_mesh_/.test(nm)) {
    const key = (o.name && /player_mesh_/.test(o.name)) ? o.name : o.parent.name;
    // Solid team-kit colors (robust, always visible) — Germany 2022 white, Spain red.
    let base = 0x9aa0a6;
    if (/germany|german/.test(nm)) base = 0xf2f2f0;       // Germany white kit
    else if (/spain/.test(nm)) base = 0xc91f37;            // Spain red kit
    const mat = new THREE.MeshLambertMaterial({ color: base });
    o.material = mat;
    o.castShadow = false;
    playerMats[key] = { mat, base: new THREE.Color(base) };
  } else if (/shadow_floor/.test(nm)) {
    o.visible = false; // baked shadow plate caused a black overlay
  } else if (/defaultobject/.test(nm)) {
    o.visible = false; // stadium-surround geometry, only lit by the photo projection
  } else if (/soccerball|ball_texture/.test(nm)) {
    o.material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  }
});

// soft lighting so MeshLambert players read as solid 3-D figures
const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(2.5, 6, 3);
scene.add(keyLight);

// annotation materials: replace with controlled flat materials, indexed by node name.
// Anything we don't recognise is hidden so no dark original material can occlude the pitch.
const annoMats = {};
annoGltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  let n = o;
  while (n && !ANNOTATION_TRACKS[n.name] && n.parent) n = n.parent;
  const key = n && ANNOTATION_TRACKS[n.name] ? n.name : null;
  if (key) {
    const mat = new THREE.MeshBasicMaterial({
      color: ANNOTATION_COLORS[key] ?? 0xf6f2e9,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    o.material = mat;
    o.renderOrder = key === 'OpenSpace' ? -6 : 4; // OpenSpace sits flat on the pitch
    (annoMats[key] = annoMats[key] || []).push(mat);
  } else {
    o.visible = false;
  }
});

// ---------- pitch ground ----------
const GRASS_COLOR = 0x86ab78;      // soft pitch green (adjust against original)
const BG_COLOR = 0xe9e9e6;         // page-like light background for the 3-D segment
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshBasicMaterial({ color: GRASS_COLOR })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
ground.renderOrder = -10;
scene.add(ground);
scene.background = new THREE.Color(BG_COLOR);

// ---------- player name labels ----------
function makeLabel(text, height) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = '600 64px helvetica, arial, sans-serif';
  const w = Math.ceil(ctx.measureText(text).width) + 60;
  c.width = w; c.height = 110;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,12,10,0.78)';
  g.beginPath(); g.roundRect(0, 0, w, 96, 16); g.fill();
  g.font = '600 64px helvetica, arial, sans-serif';
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, 48);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(height * w / 96, height, 1);
  sp.renderOrder = 20;
  return sp;
}
const labels = [];
for (const pl of beatsData.playerLabels) {
  const node = mainGltf.scene.getObjectByName(pl.mesh);
  if (!node) continue;
  const box = new THREE.Box3().setFromObject(node);
  const playerH = Math.max(box.max.y - box.min.y, 0.05);
  const sp = makeLabel(pl.name, playerH * 0.28); // label height ~28% of player height
  sp.position.set((box.min.x + box.max.x) / 2, box.max.y + playerH * 0.22, (box.min.z + box.max.z) / 2);
  scene.add(sp);
  labels.push(sp);
}

// ---------- VR caption panel ----------
const captionCanvas = document.createElement('canvas');
captionCanvas.width = 1024; captionCanvas.height = 360;
const captionTex = new THREE.CanvasTexture(captionCanvas);
captionTex.colorSpace = THREE.SRGBColorSpace;
const captionPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(1.6, 1.6 * 360 / 1024),
  new THREE.MeshBasicMaterial({ map: captionTex, transparent: true, depthTest: false })
);
captionPanel.renderOrder = 30;
captionPanel.position.set(0, EYE_HEIGHT - 0.55, -1.6);
captionPanel.rotation.x = -0.25;
rig.add(captionPanel);

function drawCaption(text) {
  const g = captionCanvas.getContext('2d');
  g.clearRect(0, 0, 1024, 360);
  g.fillStyle = 'rgba(10,12,10,0.82)';
  g.beginPath(); g.roundRect(0, 0, 1024, 360, 28); g.fill();
  g.fillStyle = '#fff';
  g.font = '34px georgia, serif';
  g.textBaseline = 'top';
  const words = text.split(' ');
  let line = '', y = 34;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > 944 && line) {
      g.fillText(line, 40, y); y += 46; line = w;
    } else line = test;
  }
  g.fillText(line, 40, y);
  captionTex.needsUpdate = true;
}

// VR fade sphere for comfortable beat transitions
const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false });
const fadeSphere = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), fadeMat);
fadeSphere.renderOrder = 100;
fadeSphere.visible = false;
camera.add(fadeSphere);

// ---------- frame texture preloading ----------
const frameNos = Object.keys(anim.frames);
setLoading('Loading photo sequence (' + frameNos.length + ' frames)…');
let loaded = 0;
await Promise.all(frameNos.map(async (no) => {
  frameTex[no] = await loadTex(anim.frames[no].file).catch(() => null);
  setLoading('Loading photo sequence (' + (++loaded) + '/' + frameNos.length + ')…');
}));

// ---------- crop-window center (world space, for camera aim during photo phase) ----------
const raycaster = new THREE.Raycaster();
const cropCenterCache = {};
function cropCenterWorld(fno) {
  if (cropCenterCache[fno]) return cropCenterCache[fno];
  const r = anim.frames[fno].rect;
  const cu = (r[0] + r[2]) / 2 / PANO_W;          // 0..1 from left
  const cv = (r[1] + r[3]) / 2 / PANO_H;          // 0..1 from top
  const ndc = new THREE.Vector2(cu * 2 - 1, (1 - cv) * 2 - 1);
  raycaster.setFromCamera(ndc, projCam);
  const hit = raycaster.intersectObject(planeMesh, false)[0];
  const p = hit ? hit.point.clone() : camTgtAt(0);
  cropCenterCache[fno] = p;
  return p;
}

// ---------- timeline application ----------
const photoLayer = document.getElementById('photo-layer');
const photoImg = document.getElementById('photo-img');
let currentImgFrame = null;

function applyTime(t) {
  const fno = String(Math.round(frameNoEval(t)));
  const frameOp = planeOpacity ? planeOpacity(t) : 1;
  const presenting = renderer.xr.isPresenting;

  // Desktop photo phase = 2-D layer scrubbing through the real frames (like the original page).
  if (!presenting) {
    if (fno !== currentImgFrame && anim.frames[fno]) {
      photoImg.src = TEX_BASE + anim.frames[fno].file;
      currentImgFrame = fno;
    }
    photoLayer.style.opacity = frameOp;
    photoLayer.style.visibility = frameOp > 0.01 ? 'visible' : 'hidden';
  } else {
    photoLayer.style.visibility = 'hidden';
  }

  // 3-D backdrop plane: only used in VR to show the photo phase (no DOM layer there).
  // On desktop the 2-D photoLayer handles photos, so the plane stays hidden — this is
  // what previously rendered as a big black/wrong billboard during the 3-D segment.
  if (planeMesh) {
    const u = planeMesh.material.uniforms;
    const showPlane = presenting && frameOp > 0.5 && frameTex[fno];
    if (showPlane) {
      u.map.value = frameTex[fno];
      u.rect.value.copy(normRect(anim.frames[fno].rect));
      u.opacity.value = frameOp;
    }
    planeMesh.visible = showPlane;
  }
  // annotations
  for (const [name, fn] of Object.entries(ANNOTATION_TRACKS)) {
    if (!fn || !annoMats[name]) continue;
    const op = fn(t);
    for (const m of annoMats[name]) { m.opacity = op; m.visible = op > 0.01; }
  }
  // player highlight: lerp kit color toward the original transitionColor when active
  for (const [mesh, fn] of Object.entries(PLAYER_TINTS)) {
    if (!fn || !playerMats[mesh]) continue;
    const c = fn(t);
    const pm = playerMats[mesh];
    if (c && typeof c === 'object' && c.a > 0.01) {
      pm.mat.color.copy(pm.base).lerp(new THREE.Color(c.r, c.g, c.b), Math.min(c.a, 1));
    } else {
      pm.mat.color.copy(pm.base);
    }
  }
  // labels
  const lop = labelOpacity ? labelOpacity(t) : 1;
  for (const sp of labels) { sp.material.opacity = lop; sp.visible = lop > 0.02; }
  // desktop camera: during photo phase aim at the moving crop window, otherwise follow the story target
  if (!renderer.xr.isPresenting) {
    camera.position.copy(camPosAt(t));
    camera.lookAt(aimTargetAt(t, fno, frameOp));
  }
}

// where should the viewer look at time t
function aimTargetAt(t, fno, frameOp) {
  const tgt = camTgtAt(t);
  if (frameOp > 0.01 && planeMesh) {
    const cc = cropCenterWorld(fno);
    return tgt.clone().lerp(cc, frameOp);
  }
  return tgt;
}

// place the XR rig so the viewer stands at the story camera pose for beat time t
function placeRigAt(t) {
  const fno = String(Math.round(frameNoEval(t)));
  const frameOp = planeOpacity ? planeOpacity(t) : 1;
  const pos = camPosAt(t), tgt = aimTargetAt(t, fno, frameOp);
  rig.position.set(pos.x, Math.max(pos.y - EYE_HEIGHT, pos.y > 3 ? pos.y - EYE_HEIGHT : 0), pos.z);
  const yaw = Math.atan2(tgt.x - pos.x, tgt.z - pos.z) + Math.PI;
  rig.rotation.set(0, yaw, 0);
}

// ---------- beat navigation ----------
let beatIndex = 0;
let timelineT = BEATS[0].time;
let tween = null;

const captionEl = document.getElementById('caption-text');
const indicatorEl = document.getElementById('beat-indicator');
const titleCard = document.getElementById('title-card');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

document.querySelector('#title-card .kicker').textContent = beatsData.kicker;
document.querySelector('#title-card .headline').textContent = beatsData.headline;
document.querySelector('#title-card .byline').textContent = beatsData.byline;

function goToBeat(i, instant = false) {
  beatIndex = THREE.MathUtils.clamp(i, 0, BEATS.length - 1);
  const beat = BEATS[beatIndex];
  captionEl.textContent = beat.text;
  drawCaption(beat.text);
  indicatorEl.textContent = (beatIndex + 1) + ' / ' + BEATS.length;
  titleCard.classList.toggle('hidden', beatIndex !== 0);
  prevBtn.disabled = beatIndex === 0;
  nextBtn.disabled = beatIndex === BEATS.length - 1;

  if (renderer.xr.isPresenting) {
    // comfort: fade out, snap rig + time, fade in
    fadeSphere.visible = true;
    tween = { kind: 'xrfade', start: performance.now(), dur: 700, targetT: beat.time, applied: false };
  } else if (instant) {
    timelineT = beat.time;
    applyTime(timelineT);
  } else {
    const dist = Math.abs(beat.time - timelineT);
    tween = { kind: 'scrub', start: performance.now(), dur: Math.min(2600, 500 + dist * 450), fromT: timelineT, targetT: beat.time };
  }
}
prevBtn.addEventListener('click', () => goToBeat(beatIndex - 1));
nextBtn.addEventListener('click', () => goToBeat(beatIndex + 1));
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === ' ') goToBeat(beatIndex + 1);
  if (e.key === 'ArrowLeft') goToBeat(beatIndex - 1);
});

// XR controller input: trigger / A = next, B = prev
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  ctrl.addEventListener('select', () => goToBeat(beatIndex + 1));
  rig.add(ctrl);
}
renderer.xr.addEventListener('sessionstart', () => {
  placeRigAt(BEATS[beatIndex].time);
  timelineT = BEATS[beatIndex].time;
  applyTime(timelineT);
});
renderer.xr.addEventListener('sessionend', () => {
  rig.position.set(0, 0, 0);
  rig.rotation.set(0, 0, 0);
  applyTime(timelineT);
});

// ---------- main loop ----------
renderer.setAnimationLoop(() => {
  captionPanel.visible = renderer.xr.isPresenting;
  if (tween) {
    const u = Math.min(1, (performance.now() - tween.start) / tween.dur);
    if (tween.kind === 'scrub') {
      const s = u * u * (3 - 2 * u);
      timelineT = tween.fromT + (tween.targetT - tween.fromT) * s;
      applyTime(timelineT);
      if (u >= 1) tween = null;
    } else if (tween.kind === 'xrfade') {
      fadeMat.opacity = u < 0.5 ? u * 2 : (1 - u) * 2;
      if (u >= 0.5 && !tween.applied) {
        timelineT = tween.targetT;
        placeRigAt(timelineT);
        applyTime(timelineT);
        tween.applied = true;
      }
      if (u >= 1) { tween = null; fadeSphere.visible = false; fadeMat.opacity = 0; }
    }
  }
  renderer.render(scene, camera);
});

// ---------- start ----------
goToBeat(0, true);
applyTime(timelineT);
document.getElementById('loading').classList.add('done');
