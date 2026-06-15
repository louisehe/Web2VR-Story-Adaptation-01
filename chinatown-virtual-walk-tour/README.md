# Story 4 — Chinatown: A Walk Down Doyers Street

- **Slug:** `chinatown-virtual-walk-tour`
- **Source:** https://www.nytimes.com/interactive/2020/12/02/arts/design/chinatown-virtual-walk-tour.html
  ("Chinatown, Resilient and Proud" / "Time Travel Through a New York Gem", by Michael Kimmelman, NYT, Dec 2 2020)
- **Status:** ✅ done (with known photogrammetry limitations — see below)
- **Run:** `npm run serve:https` → `https://127.0.0.1:8443/chinatown-virtual-walk-tour/webxr-adaptation/`

## What this story is

A guided walk down Doyers Street in Manhattan's Chinatown, told through 7 points of interest
(c. 1900 → 1964). At each stop the reader sees the reconstructed 3-D street, an archival photo
from that era, a year label, and a caption. Drag to look around; Next / Prev to walk between
points; Enter VR for the immersive version.

This is **not** the same template as the World-Cup stories (1–3). It is a street / photogrammetry
walk-through, so the WebXR engine here is purpose-built (`src/main.js`): it shows one captured
point-of-interest node at a time with the camera placed at that view's origin.

## Why the asset pipeline was unusual (important)

The original story does **not** ship a GLB. Its 3-D street is **Umbra**-streamed photogrammetry:
NYT reconstructed Doyers Street from 4,447 photos, and the page streams the geometry as proprietary
`.geom` tiles from `https://int.nyt.com/data/3dscenes/...`, decoded by a bundled three.js + Umbra
runtime and drawn to a single WebGL canvas. There is no public loader for that format, so the
standard "download the GLB → three.js" path used for stories 1–3 does not apply.

To get usable geometry we **ripped the live WebGL scene** instead (see `tools/webgl-rip.js`):

1. Hook `WebGLRenderingContext` (`bufferData`, `drawElements`, `texImage2D`,
   `compressedTexImage2D`).
2. Force one context lose/restore so the currently-resident tiles re-upload and are captured.
3. At each of the 7 points, read back the vertex buffers (positions are plain `FLOAT` vec3 + `FLOAT`
   vec2 UV, `USHORT` indices) and bake them into that point's camera (view) space using the live
   `modelViewMatrix`; skip the full-screen post passes (perspective-projection draws only).
4. Capture the **compressed** street textures by rendering each to an offscreen framebuffer and
   reading the pixels back (compressed textures can't be read directly).
5. Emit one GLB node per point of interest (`p1`..`p7`).

`tools/rebuild-glb.js` then re-packs the in-memory capture into the final
`captures/active/models/doyers_all.glb` with textures stored as **binary** in the BIN chunk
(the first build embedded them as base64 in JSON, which bloated the file to ~67 MB and truncated on
download). Final model: ~46 MB, 7 nodes, ~700k triangles total, textured.

## How the engine presents it (`src/main.js`)

- Loads `doyers_all.glb`; each node `p1`..`p7` maps to one story beat (`data/beats.json`).
- Materials are forced to **unlit** `MeshBasicMaterial` (the textures are baked photogrammetry color,
  so lighting would double-darken them).
- Camera sits at the origin (the captured eye); per-beat FOV matches the original framing; look-around
  is clamped to a small range so the reader mostly sees the well-reconstructed front of each view.
- A radial **vignette** darkens the frame edges, and a tight far-plane + front-face culling drop the
  worst peripheral junk.
- The original's in-scene **dark year-label billboards are hidden**; the **archival photo planes are
  kept** (and horizontally un-mirrored, since the rip flips those quads).
- VR: headset starts at the captured eye (`local` reference space); controller trigger advances beats;
  a 3-D caption panel is shown since the DOM overlay isn't visible in VR.

## Known limitations (inherent to a client-side rip)

- **Holes / smeared "ribbon" geometry**, especially to the sides and behind each viewpoint. The
  original looks complete because Umbra continuously streams the exact tiles for wherever you look, at
  high LOD. Our capture only contains the tiles that were loaded in the single frame we grabbed per
  point, so anything outside that view's loaded set is missing or low-LOD. Framing + vignette hide
  much of it but cannot fill it.
- Points **p5 / p6** captured a smaller area than the others.
- Fully matching the original's completeness would require capturing many frames per point while
  panning and merging them with cross-frame alignment (heavier, and still imperfect) — deliberately
  out of scope for this pass.

## Files

```
chinatown-virtual-walk-tour/
  captures/active/models/doyers_all.glb     ripped 3-D street (7 POI nodes)
  webxr-adaptation/
    index.html  src/main.js  src/styles.css
    data/beats.json                         7 beats: node + year + caption + fov
    vendor/                                 bundled three.js + addons
  tools/
    collector.js     NYT asset collector (captured the archival photos + scene config)
    webgl-rip.js     live-WebGL → GLB ripper (geometry + compressed textures)
    rebuild-glb.js   re-pack in-memory capture into a compact, complete GLB
```
