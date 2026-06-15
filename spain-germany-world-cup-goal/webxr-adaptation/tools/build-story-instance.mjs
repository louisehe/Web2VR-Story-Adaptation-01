/**
 * build-story-instance.mjs — Germany's Late Equalizer (spain-germany-world-cup-goal)
 *
 * This story's runtime is data-driven by two committed files in ../data/:
 *   - story-animation.json : Theatre.js timeline extracted from the captured
 *                            data_state.json (camera path, annotation opacities,
 *                            frame numbers, crop rects, pano canvas size).
 *   - beats.json           : the 9 ordered narrative beats + verbatim text,
 *                            player-label node mapping, byline, methodology.
 *
 * Unlike the abstract-marker stories, this adaptation reuses the original
 * projection-camera + photo-frame pipeline, so the "instance" is just a
 * validated bundle of those two files. This script verifies they exist and
 * are internally consistent, and emits a small story-instance.json summary
 * so the folder matches the repo's build contract.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "../data");

const anim = JSON.parse(readFileSync(resolve(dataDir, "story-animation.json"), "utf8"));
const beats = JSON.parse(readFileSync(resolve(dataDir, "beats.json"), "utf8"));

const frameNos = Object.keys(anim.frames).map(Number).sort((a, b) => a - b);
const problems = [];
if (!anim.panoCanvas || anim.panoCanvas.length !== 2) problems.push("missing panoCanvas");
if (!anim.inpainted || !anim.inpainted.file) problems.push("missing inpainted backdrop");
if (!beats.beats || beats.beats.length === 0) problems.push("no beats");
for (const b of beats.beats) {
  if (!b.text || !b.text.trim()) problems.push(`beat ${b.id} has empty text`);
  if (typeof b.time !== "number") problems.push(`beat ${b.id} has no time`);
}
if (problems.length) {
  console.error("[spain-germany] instance validation FAILED:\n - " + problems.join("\n - "));
  process.exit(1);
}

const instance = {
  id: "spain-germany-world-cup-goal-webxr",
  title: beats.headline,
  byline: beats.byline,
  sourceUrl: beats.sourceUrl,
  assetRoot: "/spain-germany-world-cup-goal/captures/active",
  pipeline: "projection-camera + photo-frame scrub (original NYT system reused)",
  models: [
    "models/nyt_spain_germany__model__assets_world-cup-2022-spain-germany.glb",
    "models/nyt_spain_germany__model__assets_FieldAnnotations_spain_germany2.glb",
  ],
  beatCount: beats.beats.length,
  frameCount: frameNos.length,
  frameRange: [frameNos[0], frameNos[frameNos.length - 1]],
  timelineLength: anim.length,
  playerLabels: beats.playerLabels,
  generatedAt: new Date().toISOString(),
};

writeFileSync(resolve(dataDir, "story-instance.json"), JSON.stringify(instance, null, 2));
console.log(`[spain-germany] instance OK — ${instance.beatCount} beats, ${instance.frameCount} frames, timeline ${instance.timelineLength}u`);
