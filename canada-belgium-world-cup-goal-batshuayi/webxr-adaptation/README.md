# Belgium's Long-Ball Goal Sinks a Determined Canada

- Source: https://www.nytimes.com/interactive/2022/11/23/sports/world-cup/canada-belgium-world-cup-goal-batshuayi.html
- Slug: `canada-belgium-world-cup-goal-batshuayi` · Template: world-cup goal · Status: ⬜ needs capture

Same NYT 3-D goal template as `spain-germany-world-cup-goal`, so the WebXR engine is reused once assets are captured.

## Capture this story's assets

1. Open the URL above in Chrome (logged in). Scroll to the bottom and back to the top.
2. F12 → Console (if paste is blocked, type `allow pasting` first), paste all of `tools/collector.js`, allow multiple downloads.
3. Copy the downloaded `nyt_belgium__*` files into `../captures/active/`:
   - `*model*.glb` / `.bin` → `captures/active/models/`
   - `*texture*` → `captures/active/textures/`
   - `*data*.json` (the Theatre.js `data_state` etc.) → `captures/active/data/`
   - `asset_manifest.json` / `story_text.json` / `story_structure_candidates.json` / `page.html` → `captures/active/metadata/`
4. Tell Claude when done — the WebXR app (`src/main.js`, `data/`, `tools/build-story-instance.mjs`) is then built from the real assets.

## Run (after assets are in place)

```bash
npm run serve:https
# https://127.0.0.1:8443/canada-belgium-world-cup-goal-batshuayi/webxr-adaptation/
```
