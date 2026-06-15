/**
 * build-story-instance.mjs — Belgium's Long-Ball Goal (usa-weston-mckennie-england)
 * Validates the captured timeline + beats and emits a story-instance.json summary.
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
if (!anim.panoCanvas) problems.push("missing panoCanvas");
if (!beats.beats || !beats.beats.length) problems.push("no beats");
for (const b of beats.beats) { if (!b.text || !b.text.trim()) problems.push(`beat ${b.id} empty text`); if (typeof b.time !== "number") problems.push(`beat ${b.id} no time`); }
if (problems.length) { console.error("[mckennie] FAILED:\n - " + problems.join("\n - ")); process.exit(1); }

const instance = {
  id: "usa-weston-mckennie-england-webxr",
  title: beats.headline,
  byline: beats.byline,
  sourceUrl: beats.sourceUrl,
  assetRoot: "/usa-weston-mckennie-england/captures/active",
  pipeline: "projection-camera + photo-frame scrub (original NYT system reused)",
  models: [`models/${"nyt_mckennie__model__assets_world-cup-2022-usa-england-6.glb"}`, `models/${"nyt_mckennie__model__assets_Field_Annots3D.glb"}`],
  beatCount: beats.beats.length,
  frameCount: frameNos.length,
  frameRange: [frameNos[0], frameNos[frameNos.length - 1]],
  timelineLength: anim.length,
  playerLabels: beats.playerLabels,
  generatedAt: new Date().toISOString(),
};
writeFileSync(resolve(dataDir, "story-instance.json"), JSON.stringify(instance, null, 2));
console.log(`[mckennie] instance OK — ${instance.beatCount} beats, ${instance.frameCount} frames, timeline ${instance.timelineLength}u`);
