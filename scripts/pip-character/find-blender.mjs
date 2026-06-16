import { access, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const repoRoot = path.resolve(__dirname, "../..");

async function isExecutable(filePath) {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function verifyBlender(binaryPath) {
  const result = spawnSync(binaryPath, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    return {
      ok: false,
      output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
    };
  }

  return {
    ok: true,
    output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
  };
}

async function findRepoLocalBlender() {
  const blenderRoot = path.join(repoRoot, ".tools", "blender");
  const candidates = [
    path.join(blenderRoot, "blender"),
    path.join(blenderRoot, "Blender.app", "Contents", "MacOS", "Blender"),
  ];

  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  try {
    const entries = await readdir(blenderRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const nestedRoot = path.join(blenderRoot, entry.name);
      const nestedCandidates = [
        path.join(nestedRoot, "blender"),
        path.join(nestedRoot, "Blender.app", "Contents", "MacOS", "Blender"),
      ];

      for (const candidate of nestedCandidates) {
        if (await isExecutable(candidate)) {
          return candidate;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

function findPathBlender() {
  const lookupCommand = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(lookupCommand, ["blender"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0) {
    return null;
  }

  const found = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return found || null;
}

export async function resolveBlender({ verify = true } = {}) {
  const candidates = [];

  if (process.env.BLENDER_BIN) {
    candidates.push({
      source: "BLENDER_BIN",
      path: path.resolve(process.env.BLENDER_BIN),
    });
  }

  const repoLocal = await findRepoLocalBlender();
  if (repoLocal) {
    candidates.push({
      source: "repo-local .tools/blender",
      path: repoLocal,
    });
  }

  const pathBlender = findPathBlender();
  if (pathBlender) {
    candidates.push({
      source: "PATH",
      path: pathBlender,
    });
  }

  for (const candidate of candidates) {
    try {
      const fileStats = await stat(candidate.path);
      if (!fileStats.isFile()) {
        continue;
      }
    } catch {
      continue;
    }

    if (!verify) {
      return candidate;
    }

    const verification = verifyBlender(candidate.path);
    if (verification.ok) {
      return {
        ...candidate,
        version: verification.output.split(/\r?\n/)[0] || "Blender",
      };
    }
  }

  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const blender = await resolveBlender();
  if (!blender) {
    console.error("Blender not found. Set BLENDER_BIN, install into .tools/blender, or install blender on PATH.");
    process.exit(1);
  }

  console.log(`${blender.path}`);
  if (blender.version) {
    console.log(blender.version);
  }
}
