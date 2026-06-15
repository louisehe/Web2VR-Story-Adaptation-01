# Story 6 — This 3-D Simulation Shows Why Social Distancing Is So Important

- **Slug:** `coronavirus-transmission-cough-6-feet-ar-ul`
- **Source:** https://www.nytimes.com/interactive/2020/04/14/science/coronavirus-transmission-cough-6-feet-ar-ul.html
  (NYT Science, April 14 2020)
- **Status:** ✅ done (GLB scene; droplet point-cloud is an optional add-on — see notes)
- **Run:** `npm run serve:https` → `https://127.0.0.1:8443/coronavirus-transmission-cough-6-feet-ar-ul/webxr-adaptation/`

## What this story is

A 13-step explainer on why six feet may not be far enough: a person coughs in a ~600 sq ft room,
and respiratory droplets spread past 6 ft (cough ~16 ft, sneeze ~26 ft). The scene shows figures,
concentric distance rings (3 / 6 / 10 / 16 / 26 ft) and a red close-proximity zone, ending on masks +
distancing. Next / Prev step the beats; drag to orbit; scroll to zoom; Enter VR to stand in the room.

## Asset pipeline

Discovery (`tools/collector.js`) found a real GLB: `transmission-200414-01.glb` (~2.5 MB) — same family
as Story 5. It contains an animated camera, a "Take 001" clip (~25.8 s), figures, the distance-ring
markers + labels, and an opacity-driver system (`opacity_driver_N.x × 100 → opacity_target_N`). The 13
captions + normalized timeline positions came from the page's `NYTG.WEBGL_DATA` config.

Captured source assets are organized under `captures/active/{models,textures,data,metadata}/`.

## How the engine works (`src/main.js`)

- Loads `transmission-200414-01.glb`; `AnimationMixer` scrubs "Take 001" to `position × duration`
  per beat (eased), animating the rings / figures / opacity.
- Replicates the opacity-driver fades each frame.
- **Camera:** uses the GLB's own **animated camera**, so the shot moves with each beat (ground-level
  close-ups → pulled-back elevated views of the distance rings), like the original. Important: the
  scene must NOT be scaled — scaling the GLB also scales the in-camera node and breaks its view matrix
  (black screen); the config's `scale 100` is therefore not applied. In VR the rig snaps to the
  camera's pose per beat.
- Materials are unlit (`KHR_materials_unlit`, as authored).

## Cough droplets — not included

The original's droplets are a separate `.pcd` point-cloud sequence (`pcd/a_d_sequence_…pcd`). That
asset has been **removed from NYT's CDN** (every URL/encoding returns 404), so the real simulation data
can't be retrieved. A procedural stand-in was tried and removed per review; the current build shows the
room, figures, distance rings (3–26 ft) and the close-proximity zone with the animated camera, which
carry the "6 ft isn't enough" argument, but **without the droplet cloud**.

## Story completeness

All 13 caption beats from the original `NYTG.WEBGL_DATA` config are present and in order (transmission
basics → cough emits droplets → dispersal → CDC 6 ft → droplets travel farther / aerosols suspended →
"continuum" → M.I.T. 16/26 ft → dilution with distance → talking & breathing → 5 min talking ≈ one
cough → masks → a mask disrupts the plume → wear a mask). No gaps.

## Files

```
coronavirus-transmission-cough-6-feet-ar-ul/
  captures/active/models/transmission-200414-01.glb
  webxr-adaptation/  index.html  src/main.js  src/styles.css  data/beats.json (13 beats)  vendor/
  tools/collector.js
```
