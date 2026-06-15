# Story 9 — A Volcano Turns a Town Into a Cemetery (Guatemala, AR)

- **Slug:** `guatemala-volcano-augmented-reality-ar-ul`
- **Source:** https://www.nytimes.com/interactive/2018/06/19/world/americas/guatemala-volcano-augmented-reality-ar-ul.html
- **Status:** ✅ done
- **Run:** `npm run serve:https` → `https://127.0.0.1:8443/guatemala-volcano-augmented-reality-ar-ul/webxr-adaptation/`

## What this story is

The original is an **augmented-reality object piece**, not a multi-beat scrollytelling 3-D. After the
Volcán de Fuego eruption of June 3, 2018, NYT photogrammetry-scanned a single ash-buried truck and the
ground around it in San Miguel Los Lotes, Guatemala. On a phone you placed the wreck in your room and
walked around it; the one on-screen instruction was *"Rotate to explore the damage."* The narrative
(the eruption, the pyroclastic flow, the 135 dead) lived in the surrounding article text, not in 3-D
callouts.

So the WebXR adaptation keeps that single-hero-object spirit: the scan is the hero, framed by an
**orbit camera that slowly auto-rotates** ("rotate to explore") and can be dragged/zoomed. Five caption
beats, curated from the article, narrate the disaster while you circle the wreck. Enter VR to stand
beside it.

## Asset pipeline

The `webgl-window` config (in `captures/active/metadata/nyt_volcano__page.html`) points to a single
model, `car.glb` — node `car_and_sides:Mesh`, one **KHR_materials_unlit** material with a baked
base-colour texture. It has **no camera and no animation** (unlike the GLB-scrub stories 5–7), and its
authored transform offsets it to `y:-160` with a camera target near `y:-100…-160`. Because those numbers
are tied to the original AR placement rather than a clean viewer space, the build ignores them and
instead **recentres the mesh at the origin and frames it from its own bounding box** (same robustness
approach as Story 8's point cloud).

`car.glb` (~12 MB) is in `captures/active/models/` (kept both the prefixed capture name and a clean
`car.glb`); 30 texture files in `captures/active/textures/`; article text + page HTML + manifest in
`captures/active/metadata/`.

## How the viewer works (`src/main.js`)

- `GLTFLoader` loads `car.glb`; `Box3` recentres it and sets `SPHERE` (≈ bounding-sphere radius) so the
  orbit radii in `beats.json` are authored as multiples of the model's size.
- Orbit camera with spherical `theta/phi/radius`. **`theta` advances continuously** (~5°/s) whenever the
  user is idle and not in VR, giving the "rotate to explore the damage" feel; dragging takes over and
  resets the idle timer. Wheel zooms within `0.7–6 × SPHERE`.
- Each beat reframes **height (`phi`) and distance (`radius`)** only — theta keeps spinning — tweened
  with a smoothstep over ~2.2 s. Beat 4 ("this truck … buried") pulls in close (`radius 1.05`).
- VR rig + `snapRig()`; controller `select` advances beats; ArrowLeft/Right / Space / Next-Prev step.

## Files

```
guatemala-volcano-augmented-reality-ar-ul/
  captures/active/models/car.glb              the ash-buried truck photogrammetry scan (hero)
  captures/active/textures/                   30 baked texture files
  captures/active/metadata/                   page HTML (config), story text, manifest
  webxr-adaptation/  index.html  src/main.js  src/styles.css  data/beats.json (5 beats)  vendor/
  tools/collector.js
```

## Verified

Loaded live at the URL above: scan renders fully textured, framed and centred; beats step and the
camera zooms/reframes (confirmed beat 1 → beat 4); auto-rotation circles the wreck; captions update.
"VR NOT SUPPORTED" shown on the desktop test machine (expected without a headset).

## Possible follow-ups

- Soft ground fade / vignette so the scan's cut edges read less as floating geometry.
- Add the article's victim photographs as framed plates around the scan for fuller context.
