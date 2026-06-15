# Germany's Late Equalizer Revives Its World Cup Hopes

- Source: https://www.nytimes.com/interactive/2022/11/27/sports/world-cup/spain-germany-world-cup-goal.html
- Slug: `spain-germany-world-cup-goal` · Template: world-cup goal · Status: **✅ ready**

This is the worked reference adaptation. It reuses the original NYT projection-camera + photo-frame pipeline rather than abstract markers.

## Run

```bash
cd web2vr
npm install            # for build only; runtime uses bundled vendor/ + import map
npm run serve:https
```

Open: `https://127.0.0.1:8443/spain-germany-world-cup-goal/webxr-adaptation/`
Headset (same Wi-Fi): `npm run serve:https:lan`, then the printed `https://<LAN-IP>:8443/...` URL.

Controls: Next / Prev buttons, ←/→/space; in VR, controller trigger = next beat.

## How it's built (from captured data, not invented)

- **Timeline** — `data/story-animation.json` is extracted from the captured `data_state.json` (the page's Theatre.js animation state). 14.72-unit scroll timeline: photo frame-scrub (frames 4→58), frozen 3-D segment (≈3.8–8), photo scrub to the finish (58→148).
- **Camera** — original keyframed camera position/target reused (broadcast angle → low angle → "Above The Action" overhead → back to broadcast). FOV 17.2°.
- **Players** — 12 player meshes are photo-textured by re-projecting frame 58 through the GLB's projection camera (yfov 28.4°, aspect 2.156); verified all players fall inside the crop window.
- **Annotations** — field lines, goal, flags, arrows and player highlight tints all driven by the original opacity/transitionColor keyframe tracks.
- **Text** — all 9 narrative beats preserved verbatim in `data/beats.json`.

## VR comfort adaptation

The original scroll continuously sweeps the camera; in VR that is replaced by fade-to-black teleport between beats. Desktop keeps the smooth original camera motion. Low-angle beats are raised to standing eye height in VR.

## Regenerate the instance summary

```bash
node spain-germany-world-cup-goal/webxr-adaptation/tools/build-story-instance.mjs
```
