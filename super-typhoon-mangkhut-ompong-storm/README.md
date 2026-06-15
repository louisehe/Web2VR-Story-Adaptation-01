# Story 8 — See Inside Typhoon Mangkhut in 3-D

- **Slug:** `super-typhoon-mangkhut-ompong-storm`
- **Source:** https://www.nytimes.com/interactive/2018/09/15/world/asia/super-typhoon-mangkhut-ompong-storm.html
- **Status:** ✅ done
- **Run:** `npm run serve:https` → `https://127.0.0.1:8443/super-typhoon-mangkhut-ompong-storm/webxr-adaptation/`

## What this story is

A NASA satellite radar **cross-section of Typhoon Mangkhut** rendered as a 3-D point cloud: a flat
cloud-top layer with rain columns rising out of it, coloured by rainfall rate (blue = light → red =
intense, in the eyewall). 7 beats walk through the radar method, the storm's size, the eyewall, the
taper to the edges, and landfall. Drag to rotate, scroll to zoom, Next/Prev to step, Enter VR.

## Asset pipeline (important)

The discovery report pointed to `cam3.glb`, but that is only the small Philippines basemap + an
animated camera, in a tiny normalized coordinate space. **The storm itself is a separate point cloud,
`storm.pcd` (~19 MB, 491,552 points)**, which the collector's extension filter didn't fetch. It was
downloaded separately (`/super-typhoon-3d/assets/pcd/storm.pcd`, HTTP 200 — still live, unlike Story
6's `.pcd`) and saved to `captures/active/data/storm.pcd`.

The PCD is non-standard: the header declares `FIELDS x y z rgb` but each ASCII row actually has 7
columns — `x y z r g b a` (rainfall colour baked into r/g/b, 0–255). So it is parsed manually (three's
`PCDLoader` would misread it), mapped y-up (height), recentred, and rendered as `THREE.Points` with
vertex colours.

Because the GLB camera/map space doesn't align with the geographic point cloud, the GLB camera is not
used; instead the point cloud is the hero, viewed with an **orbit camera that reframes per beat**
(authored `theta/phi/radius` in `beats.json`: wide establishing → into the red eyewall → out to the
drizzle edge → landfall), tweened slowly (~2.6 s).

## Files

```
super-typhoon-mangkhut-ompong-storm/
  captures/active/data/storm.pcd            the NASA radar point cloud (the storm)
  captures/active/models/...cam3.glb        basemap + camera (not used in the build)
  webxr-adaptation/  index.html  src/main.js  src/styles.css  data/beats.json (7 beats)  vendor/
  tools/collector.js
```

## Possible follow-ups

- Add the Philippines basemap under the storm (needs fitting the GLB map to the pcd's geographic
  footprint).
- Soft round sprites instead of square points for a more volumetric look.
