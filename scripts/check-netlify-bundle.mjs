import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

const root = process.cwd();
const forbiddenEntries = [];

for (const directory of [".netlify/functions-internal", ".netlify/functions"]) {
  const absoluteDirectory = join(root, directory);

  if (!existsSync(absoluteDirectory)) {
    continue;
  }

  for (const filePath of findFiles(absoluteDirectory)) {
    const relativePath = relative(root, filePath);

    if (isForbiddenEnvPath(relativePath)) {
      forbiddenEntries.push(relativePath);
      continue;
    }

    if (filePath.endsWith(".zip")) {
      forbiddenEntries.push(
        ...listZipEntries(filePath)
          .filter(isForbiddenEnvPath)
          .map((entry) => `${relativePath}:${entry}`),
      );
    }
  }
}

if (forbiddenEntries.length > 0) {
  console.error("Netlify function artifacts include forbidden env files:");
  for (const entry of forbiddenEntries) {
    console.error(`- ${entry}`);
  }
  process.exit(1);
}

console.log("No env files found in Netlify function artifacts.");

function findFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return findFiles(path);
    }

    return [path];
  });
}

function listZipEntries(filePath) {
  try {
    return execFileSync("unzip", ["-Z1", filePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown unzip failure.";
    throw new Error(`Could not inspect ${relative(root, filePath)}: ${message}`);
  }
}

function isForbiddenEnvPath(filePath) {
  const name = basename(filePath);

  return name !== ".env.example" && /^\.env(?:\.|$)/.test(name);
}
