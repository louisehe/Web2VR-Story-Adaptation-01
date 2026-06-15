# Story 10 — Explore NASA's InSight Mission on Mars (AR)

- **Slug:** `mars-nasa-insight-ar-3d-ul`
- **Source:** https://www.nytimes.com/interactive/2018/05/01/science/mars-nasa-insight-ar-3d-ul.html
- **Status:** ✅ done
- **Run:** `npm run serve:https` → `https://127.0.0.1:8443/mars-nasa-insight-ar-3d-ul/webxr-adaptation/`

## What this story is

A multi-scene AR explainer about NASA's InSight lander. The original `webgl-window` config holds four
scenes; the fourth is a car advertisement (`ad-assets.nytimes.com/bmw-ar`) and is dropped. The
adaptation keeps the three real acts as a single 12-beat walkthrough:

1. **Mars globe — a tour of landing sites** (7 beats). A textured, slowly-rotating Mars with a glowing
   pin marking the highlighted site; each beat's caption names that mission (InSight, Curiosity,
   Phoenix, Opportunity, Spirit, Pathfinder, Viking 1 & 2).
2. **Early Mars** (1 beat). The "wet" Mars globe — an artist's conception of the planet before its
   water was lost.
3. **The InSight lander** (4 beats). The lander on a patch of Martian ground, **playing its 8.5-second
   deployment animation** (solar panels unfold, the arm lowers the instruments) while the camera zooms
   in through the three experiments — the SEIS seismometer, the HP³ heat-flow probe, and the RISE radio
   experiment. Captions are taken from the source's `poi` callouts.

## Asset pipeline

Discovery found the asset base `static01.nyt.com/newsgraphics/2018/04/16/ar-mars/assets/fb/models/`
(the page's own relative paths 404 — they resolve against the article URL, not the CDN). 16 GLBs were
fetched directly with a small console snippet (the collector's cross-origin fetch was blocked):

- **used:** `mars.glb` / `mars_wet.glb` (unit-sphere Mars globes, dry & wet, textured PBR),
  `starfield.glb` (unlit Milky-Way backdrop, rendered `BackSide`), `lander.glb` (41 nodes / 19 meshes,
  textured, **"Take 001" 8.46 s deploy animation**), `ground.glb` (textured terrain patch).
- **captured but not used:** the per-site landers (`insight/curiosity/phoenix/opportunity/spirit/
  pathfinder/viking1/viking2.glb`), `inactivepins.glb`, and the instrument markers
  (`heatprobe.glb`, `rise.glb`). The per-site landers are crude low-poly blobs meant to read as dots on
  the globe, not as recognisable models, so a glowing pin + caption carry the site tour instead.

The source's per-scene camera/scale numbers are tied to its own engine (e.g. Mars at scale 20000,
y −200), so — as in Stories 8–9 — each scene is **recentred and reframed from the GLB bounding boxes**
by a `frame(obj, R)` helper, and all three scenes share one origin-centred orbit camera.

## How the viewer works (`src/main.js`)

Three `THREE.Group` scenes (mars / wet / lander), only one visible at a time; a large starfield sphere
stays visible across all of them so transitions never show a black frame. Lit PBR models get an ambient
light + a warm key (sun) + a cool fill. The lander's clip is scrubbed via `mixer.setTime(anim·duration)`
and the scrub value is tweened between beats, so the lander visibly deploys as you advance. Orbit camera
with `theta/phi/radius`; the globes auto-rotate, the lander view slowly orbits, and per-beat the camera
tweens height + distance (smoothstep, ~2.2 s). Drag to rotate, scroll to zoom, Next/Prev or arrows to
step, controller `select` in VR.

## Files

```
mars-nasa-insight-ar-3d-ul/
  captures/active/models/      16 source GLBs (+ clean-named copies the engine loads)
  captures/active/textures/    cover/thumbnail images from the article
  captures/active/metadata/    page HTML (scene config), story text, structure candidates, manifest
  webxr-adaptation/  index.html  src/main.js  src/styles.css  data/beats.json (12 beats)  vendor/
  tools/collector.js
```

## Verified

Loaded live at the URL above: all three acts render (Mars globe + pin, blue-tinged early Mars, and the
fully-textured InSight lander deploying on terrain); beats step and the deploy animation + camera
zoom-in progress correctly (confirmed beats 1, 8, 9, 12); transitions are smooth with no black frames.
"VR NOT SUPPORTED" on the desktop test machine (expected without a headset).

## Possible follow-ups

- Brighten the early-Mars globe (much of it sits in terminator shadow).
- Place the real instrument markers (`heatprobe.glb`, `rise.glb`) on the deck for the act-3 callouts.
