# Story 5 — "Les masques, ça marche." (mask & particle filtration explainer)

- **Slug:** `wear-mask-covid-particles-ul-fr`
- **Source:** https://www.nytimes.com/interactive/2020/11/11/science/wear-mask-covid-particles-ul-fr.html
  (French edition of the NYT masks explainer, Nov 11 2020)
- **Status:** ✅ done
- **Run:** `npm run serve:https` → `https://127.0.0.1:8443/wear-mask-covid-particles-ul-fr/webxr-adaptation/`

## What this story is

A 23-step explainer of how masks filter exhaled particles: woven cotton vs. FFP2/N95 fibres, the
three filtration mechanisms (impaction of large particles, brownian zig-zag of small particles,
electrostatic capture by FFP2), mask fit / breathing zone / valves, and combined filtration with
distancing. Next / Prev steps through the 23 beats; Enter VR for the immersive version.

## Asset pipeline (clean — unlike Story 4)

The discovery probe (`tools/collector.js`) showed this story **does ship a real GLB**:
`masks-088.glb` (~9.5 MB, a Maya export). So no WebGL ripping was needed — we just captured and
loaded it. The GLB is a complete animated scene:

- **One animation clip "Take 001" (~93 s, 190 channels)** that the original scroll-scrubs.
- An **animated camera** that frames each section.
- **Baked particle motion** (`a_brown` brownian, `a_imp` impaction, `a_electro` electrostatic, MASH
  repro-meshes) — the particles are animated geometry, not a live simulation.
- Mask / fibre / people / breathing-zone / 6-feet geometry, plus 3-D label placeholders.
- An **opacity-driver system**: each `opacity_driver_N` node's local x (×100) is the opacity of the
  matching `opacity_target_N` mesh — that's how the original fades parts in and out.

The 23 captions and their normalized timeline positions (0.02 → 0.84), plus the French marker labels,
came from the page's `NYTG.WEBGL_DATA` config (captured into
`captures/active/.../story_structure_candidates.json` and baked into `data/beats.json`).

## How the engine works (`src/main.js`)

- Loads `masks-088.glb`; builds an `AnimationMixer` for "Take 001".
- Each beat scrubs the clip to `position × duration` (a smooth eased scrub between beats on desktop),
  which moves the GLB's own camera and the baked particles into place.
- Replicates the opacity system every frame: `opacity = clamp(opacity_driver_N.x × 100, 0, 1)` applied
  to `opacity_target_N` materials.
- Renders through the GLB's animated camera on desktop; in VR the headset rig snaps to that camera's
  pose per beat (static per beat for comfort) and the reader looks around the microscopic scene.
- Captions are the French `slides` text; lighting is ambient + two directionals.

## Status / notes

- All 23 beats verified rendering correctly (intro people → cotton-fibre forest with size-coded
  aerosols → FFP2 fibres / electrostatic → mask fit & breathing zone → combined filtration).
- The source page is the French edition, but the captions and labels in `data/beats.json` have been
  translated to **English** (the displayed language). Headline/byline/UI are English.
- Possible polish: overlay the 3-D marker labels (sizes, "183 cm", efficacy %) at their label nodes;
  add desktop drag-to-look; tune VR scale.

## Files

```
wear-mask-covid-particles-ul-fr/
  captures/active/models/masks-088.glb      the explainer scene (camera + animation + particles)
  webxr-adaptation/
    index.html  src/main.js  src/styles.css
    data/beats.json                         23 beats: position (timeline) + caption
    vendor/                                  bundled three.js + addons
  tools/collector.js                        discovery probe + asset collector
```
