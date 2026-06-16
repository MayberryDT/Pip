import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveBlender, repoRoot } from "./find-blender.mjs";

const blenderScript = path.join(repoRoot, "design/pip-character/blender/create_pip_v001.py");
const generatedBlend = path.join(repoRoot, "design/pip-character/generated/pip_v001_generated.blend");

const blender = await resolveBlender();

if (!blender) {
  console.error("Run npm run pip:character:install-blender first.");
  process.exit(1);
}

if (!existsSync(blenderScript)) {
  console.error(`Missing Blender script: ${path.relative(repoRoot, blenderScript)}`);
  process.exit(1);
}

const result = spawnSync(blender.path, ["--background", "--python", blenderScript], {
  cwd: repoRoot,
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log(`Generated Pip model: ${path.relative(repoRoot, generatedBlend)}`);
