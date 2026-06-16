import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveBlender, repoRoot } from "./find-blender.mjs";

const blenderScript = path.join(repoRoot, "design/pip-character/blender/render_pip_asset_kit.py");
const generatedBlend = path.join(repoRoot, "design/pip-character/generated/pip_v001_generated.blend");
const exportRoot = path.join(repoRoot, "design/pip-character/exports/v001");

const blender = await resolveBlender();

if (!blender) {
  console.error("Run npm run pip:character:install-blender first.");
  process.exit(1);
}

if (!existsSync(generatedBlend)) {
  console.error(`Missing generated model: ${path.relative(repoRoot, generatedBlend)}`);
  console.error("Run npm run pip:character:generate first.");
  process.exit(1);
}

if (!existsSync(blenderScript)) {
  console.error(`Missing Blender render script: ${path.relative(repoRoot, blenderScript)}`);
  process.exit(1);
}

const result = spawnSync(blender.path, ["--background", generatedBlend, "--python", blenderScript], {
  cwd: repoRoot,
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log(`Rendered Pip asset kit: ${path.relative(repoRoot, exportRoot)}`);
console.log(`Contact sheet: ${path.relative(repoRoot, path.join(exportRoot, "contact-sheet.png"))}`);
