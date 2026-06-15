# Web2VR — Expert A Adaptations

WebXR adaptations of NYT interactive 3-D stories, packaged for local HTTPS and headset testing. Built one story at a time; each completed story lives in its own top-level folder and is added to this repo as it is finished.

## Story set (Expert A / creator)

| # | Story folder | Title | Status |
|---|---|---|---|
| 1 | `spain-germany-world-cup-goal` | Germany's Late Equalizer Revives Its World Cup Hopes | ✅ done |
| 2 | `canada-belgium-world-cup-goal-batshuayi` | Belgium's Long-Ball Goal Sinks a Determined Canada | ✅ done |
| 3 | `usa-weston-mckennie-england` | Weston McKennie Is Going to Want This One Back | ✅ done |
| 4 | `chinatown-virtual-walk-tour` | Chinatown: Time Travel Through a New York Gem (Doyers St. photogrammetry walk) | ✅ done |
| 5 | `wear-mask-covid-particles-ul-fr` | Les masques, ça marche. (mask & particle filtration explainer) | ✅ done |
| 6 | `coronavirus-transmission-cough-6-feet-ar-ul` | This 3-D Simulation Shows Why Social Distancing Is So Important | ✅ done |
| 7 | `apollo-11-moon-landing-photos-ul` | Apollo 11: As They Shot It (Moon Landing in AR) | ✅ done |
| 8 | `super-typhoon-mangkhut-ompong-storm` | See Inside Typhoon Mangkhut in 3-D | ✅ done |
| 9 | `guatemala-volcano-augmented-reality-ar-ul` | A Volcano Turns a Town Into a Cemetery | ✅ done |
| 10 | `mars-nasa-insight-ar-3d-ul` | Explore NASA's InSight Mission on Mars (AR) | ✅ done |

Only completed stories are committed. As each story is finished, its folder and a `build:<short>-webxr` script are added.

## Setup

```bash
npm install
npm run check        # syntax-check committed stories + server
```

## Run a story locally (HTTPS, required for WebXR)

```bash
npm run serve:https
```

Open the desktop URL the server prints, e.g.:

```
https://127.0.0.1:8443/spain-germany-world-cup-goal/webxr-adaptation/
```

Accept the self-signed certificate warning.

## Headset / LAN testing

```bash
npm run serve:https:lan
```

Binds `0.0.0.0`, detects this computer's LAN IP, adds it to the certificate, and prints `https://<LAN-IP>:8443/<slug>/webxr-adaptation/`. Headset and computer must share Wi-Fi/LAN. If the LAN IP changes, delete `.certs/` and rerun.

## Per-story folder layout

```
<story-slug>/
  captures/active/{models,textures,data,metadata}/   captured public source assets
  webxr-adaptation/
    index.html
    src/main.js   src/styles.css
    vendor/                            bundled three.js + draco (runs without a build step)
    data/                             generated story instance + timeline/beats
    tools/build-story-instance.mjs    instance generator / validator
    tools/collector.js                browser asset collector for this story
    README.md                         how this story was built + how to run it
  analysis/<slug>.md                  adaptation package (Formative Study Protocol §6)
  discovery/                          asset discovery notes
  dist-webxr-adaptation/              static build output (after npm run build:<short>-webxr)
```

## Build static output

```bash
npm run build:spain-webxr     # one story
npm run build:all             # every committed story
```
