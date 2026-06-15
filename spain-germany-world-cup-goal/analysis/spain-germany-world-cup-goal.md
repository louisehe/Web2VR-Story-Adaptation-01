# WebXR Adaptation Package — Germany's Late Equalizer Revives Its World Cup Hopes

- **Story URL:** https://www.nytimes.com/interactive/2022/11/27/sports/world-cup/spain-germany-world-cup-goal.html
- **Story folder:** `spain-germany-world-cup-goal`
- **Creator:** Expert A
- **Template family:** world-cup goal (NYT 3-D goal reconstruction)
- **Status:** ✅ implemented & visually verified (desktop)

> Follows the Formative Study Protocol §6 "Final Adaptation Package Checklist".

## A. Story summary

In Germany's 2022 World Cup group match against Spain, Germany trailed 1–0 and faced
elimination. In the 83rd minute Lukas Klostermann won the ball and Germany built a fast
attack — Sané to Musiala to Füllkrug — that ended in a Füllkrug equalizer, keeping
Germany's tournament hopes alive. The original NYT piece reconstructs that single goal in
3-D, scrolling the reader from a broadcast photo into a re-staged 3-D field where player
runs, the through ball and the open space are annotated, then back to the photo of the
finish. The core message is *how* the goal was built, beat by beat.

## B. Story beat transformation table

| # | Original beat (verbatim) | Phase | WebXR visual state | User viewpoint | Interaction | Transition |
|---|---|---|---|---|---|---|
| 0 | "AL KHOR, Qatar — Germany didn't beat Spain… Klostermann picked off an errant pass… took off running down the right wing." | photo | Full-frame broadcast still (frame 4→58 scrub) | Fixed, original camera | Next/Prev | photo cross-fade |
| 1 | "He blew past Pedri… slid a short pass inside to Leroy Sané." | photo | Photo scrub continues | Fixed | Next/Prev | photo→3-D fade |
| 2 | "Sané received the ball on the turn… attracting three Spanish players." | 3-D | Side view of pitch, players + lines + flags, Sané highlighted | Guided low angle | Next/Prev | eased camera move |
| 3 | "Just ahead of Sané, Jamal Musiala started to make a diagonal run…" | 3-D | Musiala's run, arrow annotation, open-space patch | Guided | Next/Prev | eased camera move |
| 4 | "Sané played a through ball to Musiala, splitting the Spanish defense." | 3-D | Through-ball arrow, defenders highlighted | Rising to overhead | Next/Prev | eased camera move |
| 5 | "Sané's pass was a bit behind Musiala… flicking it past Spain's last defender." | 3-D | Overhead, ball path arrow | Overhead ("Above The Action") | Next/Prev | eased camera move |
| 6 | "Musiala continued his run but… Füllkrug got to the ball first… lined up to strike." | 3-D | Overhead, Füllkrug highlighted near the box | Overhead | Next/Prev | 3-D→photo fade |
| 7 | "Füllkrug thundered a shot into the top of the net, evening the score at 1-1." | photo | Photo scrub of the finish (frame 58→148) | Fixed | Next/Prev | photo scrub |
| 8 | "Germany is last in its group, but this draw has increased its likelihood of advancing…" | photo | Final still + outcome text | Fixed | — | — |

All nine beats preserve the original text verbatim (`webxr-adaptation/data/beats.json`).

## C. GLB asset-role table

| Filename | Interpreted role | Placement | Scale | Use | Uncertainty |
|---|---|---|---|---|---|
| `world-cup-2022-spain-germany.glb` | Main scene: 12 player meshes, ball, projection plane, shadow plate, projection camera | World origin, pitch at y≈0 | as authored | Players re-colored to team kits; projection camera reused to drive photo phases | Low — node names explicit |
| `FieldAnnotations_spain_germany2.glb` | Field lines, low-poly goal, corner flags, open-space patch, two arrows | Aligned to pitch | as authored | Opacity driven by original Theatre.js tracks | Low |
| `gergoalNNNN_*.webp` (28 frames) | Broadcast photo sequence (crop-windowed across a 19543×9070 pano) | 2-D layer (desktop) / projection plane (VR) | — | Photo scrub for intro & finish | Medium — frame↔beat timing inferred |
| `inpainted2048_*.webp` | Players-removed stadium backdrop | projection plane (VR only) | — | VR photo backdrop | Medium |

Player node → identity mapping (`data/beats.json`): Klostermann `player_mesh_germany16`,
Sané `player_mesh_19`, Musiala `player_mesh_germany14`, Füllkrug `player_mesh_germany9`,
Pedri `player_mesh_spain26`.

## D. Spatial layout plan

The reader is an exocentric observer of a roughly 1:1 mini-pitch placed in front of them
(players ≈0.11 units tall, pitch tens of units wide). Models sit on a flat green ground
plane; white field lines, corner flags and the goal frame the action. Germany wears white
(`#f2f2f0`), Spain red (`#c91f37`); the ball is white. Attention is guided by (a) the
guided camera path, (b) yellow run/pass arrows, (c) a translucent open-space patch, and
(d) floating name labels scaled to ~28% of player height so they read without dominating.

## E. User viewpoint and navigation plan

Guided / fixed-per-beat. The camera follows the original keyframed path: broadcast side
angle during the early 3-D beats, rising to the overhead "Above The Action" framing for
the through-ball and finish build-up. The reader does not free-fly; they advance beats.
Camera aim is at pitch level (y≈0.15) so players are always framed.

## F. Interaction plan

Minimal and necessary: **Next / Prev** (buttons, ←/→/space) to advance beats; in VR the
controller **trigger** advances. No free locomotion, no object grabbing — the story is
linear and benefits from authored framing, so extra interaction would only add VR risk.

## G. Transition and pacing plan

Desktop keeps the original smooth scrubbed camera motion between beats (eased, 0.5–2.6 s by
distance). The photo↔3-D handoff cross-fades via the original `projection_plane` opacity
track. **VR comfort:** continuous camera sweeps are replaced by a fade-to-black teleport
between beats (no vection); low-angle beats are raised to standing eye height.

## H. Narration / text preservation plan

All nine narration beats are preserved verbatim and shown in a caption panel synced to the
beat (DOM panel on desktop, a world-locked panel in VR). Headline, kicker ("Above The
Action") and full byline are retained on the title card. Methodology text is retained in
`beats.json`.

## I. WebXR implementation notes

- **Stack:** three.js (bundled `vendor/`, import-map; no build step needed to run), WebXR
  via `VRButton`, DRACO-compressed GLB via bundled decoder.
- **Photo phases:** desktop uses a full-screen 2-D `<img>` layer scrubbing the real frames
  (matches the original page); VR uses the in-scene `projection_plane`.
- **3-D segment:** stadium-surround `defaultobject` meshes and the baked `shadow_floor` are
  hidden (they were only ever lit by the photo projection and otherwise occlude the pitch);
  players get flat team-kit `MeshLambert` materials; annotations get controlled flat
  materials with opacity driven by the captured Theatre.js tracks.
- **Timeline:** `data/story-animation.json` (extracted from the captured `data_state.json`)
  supplies camera position/target, frame numbers, crop rects, and annotation/label opacity.
- **Technical risks:** frame↔beat timings are inferred (editable in `beats.json`); VR photo
  backdrop fidelity is lower than the desktop 2-D layer.

## J. Creator process log appendix

- **Story understanding:** main message is "how the equalizer was built"; the photo→3-D→photo
  structure is the original's core device.
- **GLB interpretation:** node names were explicit enough to map players, ball, plane, shadow,
  annotations with high confidence; `data_state.json` turned out to be a Theatre.js animation
  state, which became the single source of truth for camera + timing.
- **LLM failures caught during build:** (1) hid the 3-D segment instead of showing it; (2) a
  baked shadow plate rendered as an opaque black overlay; (3) GLTF flattening broke name-based
  material selectors, leaving the white `projection_plane` as a giant occluder; (4) camera aim
  height hard-coded to 0.9 pushed players off-screen.
- **Human corrections:** match materials by mesh-own name (flatten-safe); hide shadow/stadium
  geometry; team-kit colors for robustness; camera aim at pitch level.
- **Open ambiguity:** exact scroll position → beat-time mapping (approximated from annotation/
  camera keyframes); whether to re-introduce photo-projected player texturing (currently solid
  kit colors for reliability).
- **Final rationale:** prioritize a reliably readable guided 3-D reconstruction (matching the
  reference project's proven solid-kit approach) over fragile photo projection, while keeping
  the original photo phases at full fidelity via the 2-D layer.
