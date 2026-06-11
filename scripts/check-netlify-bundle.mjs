import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

const root = process.cwd();

export function runNetlifyBundleCheck({
  cwd = process.cwd(),
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const forbiddenEntries = [];
  const missingEntries = [];

  for (const directory of [".netlify/functions-internal", ".netlify/functions"]) {
    const absoluteDirectory = join(cwd, directory);

    if (!existsSync(absoluteDirectory)) {
      continue;
    }

    for (const filePath of findFiles(absoluteDirectory)) {
      const relativePath = relative(cwd, filePath);

      if (isForbiddenEnvPath(relativePath)) {
        forbiddenEntries.push(relativePath);
        continue;
      }

      if (filePath.endsWith(".zip")) {
        forbiddenEntries.push(
          ...listZipEntries(filePath, cwd)
            .filter(isForbiddenEnvPath)
            .map((entry) => `${relativePath}:${entry}`),
        );
      }
    }
  }

  missingEntries.push(...findMissingNextServerStaticEntries(cwd));

  if (forbiddenEntries.length > 0) {
    stderr("Netlify function artifacts include forbidden env files:");
    for (const entry of forbiddenEntries) {
      stderr(`- ${entry}`);
    }
    return 1;
  }

  if (missingEntries.length > 0) {
    stderr("Netlify Next server handler is missing required static assets:");
    for (const entry of missingEntries) {
      stderr(`- ${entry}`);
    }
    return 1;
  }

  stdout("No env files found in Netlify function artifacts.");
  stdout("Netlify Next server handler includes .next/static assets.");
  return 0;
}

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

function listZipEntries(filePath, cwd) {
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
    throw new Error(`Could not inspect ${relative(cwd, filePath)}: ${message}`);
  }
}

function isForbiddenEnvPath(filePath) {
  const name = basename(filePath);

  return name !== ".env.example" && /^\.env(?:\.|$)/.test(name);
}

function findMissingNextServerStaticEntries(cwd) {
  const handlerDirectory = join(cwd, ".netlify/functions-internal/___netlify-server-handler");
  const sourceStaticDirectory = join(cwd, ".next/static");
  const handlerStaticDirectory = join(handlerDirectory, ".next/static");
  const handlerZip = join(cwd, ".netlify/functions/___netlify-server-handler.zip");
  const missingEntries = [];

  if (!existsSync(handlerDirectory) || !existsSync(sourceStaticDirectory)) {
    return missingEntries;
  }

  if (!hasFiles(handlerStaticDirectory)) {
    missingEntries.push(".netlify/functions-internal/___netlify-server-handler/.next/static");
  }

  if (existsSync(handlerZip)) {
    const zipEntries = listZipEntries(handlerZip, cwd);
    if (!zipEntries.some((entry) => entry.startsWith(".next/static/"))) {
      missingEntries.push(".netlify/functions/___netlify-server-handler.zip:.next/static");
    }
  }

  return missingEntries;
}

function hasFiles(directory) {
  if (!existsSync(directory)) {
    return false;
  }

  return findFiles(directory).length > 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runNetlifyBundleCheck({ cwd: root });
}
