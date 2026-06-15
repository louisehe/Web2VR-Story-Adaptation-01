# Story 7 — Apollo 11: As They Shot It

- **Slug:** `apollo-11-moon-landing-photos-ul`
- **Source:** https://www.nytimes.com/interactive/2019/07/18/science/apollo-11-moon-landing-photos-ul.html
- **Status:** ✅ done
- **Run:** `npm run serve:https` → `https://127.0.0.1:8443/apollo-11-moon-landing-photos-ul/webxr-adaptation/`

## What this story is

A 34-step retelling of the first moonwalk, set to the Apollo 11 air-to-ground transcript (Armstrong,
Aldrin, Houston, Collins in orbit). The 3-D scene is the reconstructed landing site — the lunar module,
ladder, flag, bootprints, Buzz Aldrin, and 360° surface panoramas. Next / Prev step through the beats;
Enter VR to stand on the surface.

## Asset pipeline

Discovery found a real GLB: `lander_scene_87.glb` (~9.8 MB) — same engine family as Stories 5/6, but
configured via `NYTG.IMMERSIVE_DATA` (not `WEBGL_DATA`). It contains an animated camera, a "Take 001"
clip (~52 s), the lander/ladder/flag/bootprint/Buzz/environment + panorama groups, and 34
opacity_driver↔opacity_target pairs. The 34 captions + normalized positions (0.013→0.908) come from
that config (caption fields can be one line or several speaker lines, joined with " / "). Assets are
organized under `captures/active/{models,textures,data,metadata}/`.

## Engine (`src/main.js`)

Same as Story 6: `AnimationMixer` scrubs "Take 001" to `position × duration` per beat (eased), driving
the animated camera + opacity fades; captions shown per beat; VR rig snaps to the camera pose. The GLB
is **not scaled** (scaling would also scale the in-GLB camera and break its view matrix).

## Notes

- **Condensed storyline:** the original config has 34 transcript steps, but many sit at camera/scene
  transitions that render dark. The brightness of every position was scanned, the black ones (pos <
  0.05) dropped, and the story condensed to **10 well-framed beats**. Transitions are paced by
  timeline distance (≈620 ms per timeline-second, 1.3–6.5 s) so the camera glides; the longest move is
  split into intermediate stops so it doesn't race past empty space.
- **Double-sided materials:** this is partly a 360-panorama experience (you're inside the spheres), so
  materials are forced to `DoubleSide` — otherwise the panorama interiors back-face-cull to black.
- Content beats render well (lunar surface + module against the black sky); the black sky is correct.
  Especially suited to the VR view (standing inside the panorama).
- **Build gotcha (fixed):** copying `index.html`/`main.js` between story folders via the sandbox `cp`
  silently truncated them, leaving the page blank. They were rewritten with the editor. For new stories,
  author these files directly (or verify byte sizes after copying).

## Files

```
apollo-11-moon-landing-photos-ul/
  captures/active/models/lander_scene_87.glb
  webxr-adaptation/  index.html  src/main.js  src/styles.css  data/beats.json (8 condensed beats)  vendor/
  tools/collector.js
```
