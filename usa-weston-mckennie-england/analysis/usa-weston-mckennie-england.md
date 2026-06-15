# WebXR Adaptation Package — Weston McKennie Is Going to Want This One Back

- **Story URL:** https://www.nytimes.com/interactive/2022/11/25/sports/world-cup/usa-weston-mckennie-england.html
- **Story folder:** `usa-weston-mckennie-england`
- **Creator:** Expert A
- **Template family:** world-cup goal (NYT 3-D reconstruction)
- **Status:** ✅ implemented & verified (desktop, all 10 beats)

> Follows the Formative Study Protocol §6 "Final Adaptation Package Checklist".

## A. Story summary

In the U.S.–England 0-0 group draw (Nov 25 2022), the Americans created several chances led
by Weston McKennie on the right wing. The piece traces one 25th-minute move: McKennie pauses
on the right, dribbles past two defenders, plays Musah, then makes a run into the box; Weah
crosses, Pulisic drags a defender away, and McKennie — free with half the goal gaping —
skies a half-volley over the bar. The message is the missed opportunity: a great team move
McKennie "is going to want back."

## B. Story beat transformation table

Unlike spain/belgium (3-D middle), this story is mostly a **photo scrub of the whole play**
(frames 0→111) with a single **3-D climax** for the miss, then a photo outro.

| # | Beat (verbatim, abridged) | Phase | Frame | WebXR state |
|---|---|---|---|---|
| 0 | "AL KHOR, Qatar — The Americans held their own against England…" | photo | 0 | broadcast still |
| 1 | "In the 25th minute, McKennie stood on the far right side…" | photo | 9 | scrub |
| 2 | "He dribbled past two England defenders and then passed to Musah…" | photo | 27 | scrub |
| 3 | "As Musah dribbled toward the end line, McKennie started his run…" | photo | 45 | scrub |
| 4 | "McKennie lifted his arm to signal that he'd been left unmarked." | photo | 54 | scrub |
| 5 | "Tim Weah, wide open, took a big touch forward… cross into the middle." | photo | 72 | scrub |
| 6 | "Pulisic darted toward the near post… leaving a pocket of open space…" | photo | 90 | scrub |
| 7 | "As Weah's cross floated in, McKennie was free in the box…" | photo | 108 | scrub |
| 8 | "McKennie struck the ball on the half-volley, skyrocketing it over the goal." | **3-D** | — | re-staged miss: USA blue + England white players, field lines, goal |
| 9 | "With two ties in the group phase, the Americans must beat Iran…" | photo | 117 | outro still |

All beats preserve original text verbatim (`webxr-adaptation/data/beats.json`).

## C. GLB asset-role table

| Filename | Interpreted role | Uncertainty |
|---|---|---|
| `world-cup-2022-usa-england-6.glb` | 11 player meshes (USA: shooter/hugged/hugger/guardian/us_6/usInpainted; England: 3,4,6,12,17), ball, projection plane, projection camera | Low |
| `Field_Annots3D.glb` | Field lines (FiledAnnotations3D), low-poly goal, corner flags | Low |
| `playoneNNNN_*.webp` (41 frames ×3 sizes) | Broadcast photo sequence across an 11940×6657 pano; 2-D layer uses the 2000px variant | Medium — frame↔beat timing inferred |

`player_mesh_shooter` = Weston McKennie (labeled). Markers in the source: `mckennie-3d`, `pulisic-3d`.

## D. Spatial layout plan

Exocentric mini-pitch. During the 3-D climax the camera sits over the penalty area looking
at the goal; USA players blue, England white, white field lines and goal frame the open
space McKennie shoots from. Ground is a flat green plane; background a light page tone.

## E. User viewpoint and navigation plan

Guided / fixed-per-beat. Photo beats present the original broadcast frames full-screen; the
single 3-D beat uses the captured camera + target tracks to frame the miss. No free-fly.

## F. Interaction plan

Next / Prev (buttons, ←/→/space); VR controller trigger advances. No locomotion or grabbing.

## G. Transition and pacing plan

Desktop photo→photo and photo→3-D transitions **jump** (instant) — scrubbing 41 large frames
per second stalls the main thread, so we step rather than scrub. The single 3-D beat has no
3-D↔3-D neighbour, so no camera ease is needed. **VR comfort:** fade-to-black teleport
between beats; low camera raised to standing height.

## H. Narration / text preservation plan

All ten beats verbatim in a synced caption panel (DOM on desktop, world-locked panel in VR).
Headline, kicker, byline on the title card.

## I. WebXR implementation notes

- Reuses the generalized world-cup engine (shared with canada-belgium): material assignment
  by mesh name (flatten-safe), generic opacity tracks keyed by node-name segment, team-kit
  colors, hidden stadium/shadow geometry, 2-D photo layer on desktop.
- Camera **and** Camera Target are keyframed here (belgium's target was static), so `camTgtAt`
  reads the track when present.
- No inpainted backdrop was captured, so the VR photo phase falls back to the 3-D scene only.
- Frame textures use the 2000px variant (not 3000px) to avoid GPU/main-thread stalls.

## J. Creator process log appendix

- **Story understanding:** the whole move is the story; only the miss is staged in 3-D.
- **GLB interpretation:** player node names are role-based (shooter, guardian, hugged/hugger)
  rather than numbered, so only McKennie (`shooter`) is confidently labeled.
- **Useful LLM output:** the generalized engine ported with only filename + team-color + camera-
  target changes.
- **LLM failure / correction:** same class of issues handled upstream (projection-plane occluder,
  oversized frames). Here the main adjustment was supporting a keyframed camera target.
- **Open ambiguity:** mapping Weah/Musah/Pulisic to specific generic node names; exact beat times
  along the photo scrub (approximated from the linear frameNo ramp).
- **Final rationale:** keep the long photo scrub at full fidelity (2-D layer) and stage only the
  decisive miss in 3-D, matching the original's emphasis.
