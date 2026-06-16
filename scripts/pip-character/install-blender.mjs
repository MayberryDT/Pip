import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveBlender, repoRoot } from "./find-blender.mjs";

const PINNED_BLENDER_VERSION = "4.3.2";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const toolsRoot = path.join(repoRoot, ".tools");
const downloadsRoot = path.join(toolsRoot, "downloads");
const blenderRoot = path.join(toolsRoot, "blender");

function supportedArchiveForPlatform(version) {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "linux" && arch === "x64") {
    return {
      url: `https://download.blender.org/release/Blender${version.split(".").slice(0, 2).join(".")}/blender-${version}-linux-x64.tar.xz`,
      archiveName: `blender-${version}-linux-x64.tar.xz`,
      type: "tar.xz",
    };
  }

  if (platform === "darwin" && arch === "arm64") {
    return {
      url: `https://download.blender.org/release/Blender${version.split(".").slice(0, 2).join(".")}/blender-${version}-macos-arm64.dmg`,
      archiveName: `blender-${version}-macos-arm64.dmg`,
      type: "dmg",
    };
  }

  if (platform === "darwin" && arch === "x64") {
    return {
      url: `https://download.blender.org/release/Blender${version.split(".").slice(0, 2).join(".")}/blender-${version}-macos-x64.dmg`,
      archiveName: `blender-${version}-macos-x64.dmg`,
      type: "dmg",
    };
  }

  return null;
}

function printManualInstructions(reason) {
  console.error(reason);
  console.error("");
  console.error("Manual install options:");
  console.error("1. Download a portable Blender build from https://www.blender.org/download/");
  console.error("2. Extract it under .tools/blender/ so the binary is .tools/blender/blender");
  console.error("3. Or run with BLENDER_BIN=/absolute/path/to/blender");
  console.error("4. For unsupported platforms, set BLENDER_DOWNLOAD_URL to a portable archive URL.");
}

function downloadFile(url, destination, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const request = client.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        if (redirectsLeft <= 0) {
          reject(new Error(`Too many redirects while downloading ${url}`));
          return;
        }

        const redirectedUrl = new URL(response.headers.location, url).toString();
        downloadFile(redirectedUrl, destination, redirectsLeft - 1).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}: ${url}`));
        return;
      }

      const file = createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => {
        file.close(resolve);
      });
      file.on("error", reject);
    });

    request.on("error", reject);
  });
}

async function extractLinuxTar(archivePath) {
  await rm(blenderRoot, { recursive: true, force: true });
  await mkdir(blenderRoot, { recursive: true });

  const result = spawnSync("tar", ["-xJf", archivePath, "-C", blenderRoot, "--strip-components=1"], {
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    throw new Error(`tar extraction failed:\n${result.stderr || result.stdout}`);
  }
}

async function extractMacDmg(archivePath) {
  await rm(blenderRoot, { recursive: true, force: true });
  await mkdir(blenderRoot, { recursive: true });

  const mountPoint = path.join(toolsRoot, "blender-dmg-mount");
  await rm(mountPoint, { recursive: true, force: true });
  await mkdir(mountPoint, { recursive: true });

  const attach = spawnSync("hdiutil", ["attach", archivePath, "-nobrowse", "-readonly", "-mountpoint", mountPoint], {
    encoding: "utf8",
    stdio: "pipe",
  });

  if (attach.status !== 0) {
    throw new Error(`hdiutil attach failed:\n${attach.stderr || attach.stdout}`);
  }

  try {
    const copy = spawnSync("cp", ["-R", path.join(mountPoint, "Blender.app"), blenderRoot], {
      encoding: "utf8",
      stdio: "pipe",
    });

    if (copy.status !== 0) {
      throw new Error(`Copying Blender.app failed:\n${copy.stderr || copy.stdout}`);
    }
  } finally {
    spawnSync("hdiutil", ["detach", mountPoint], {
      encoding: "utf8",
      stdio: "ignore",
    });
    await rm(mountPoint, { recursive: true, force: true });
  }
}

async function main() {
  const existing = await resolveBlender();
  if (existing) {
    console.log(`Blender resolved from ${existing.source}: ${existing.path}`);
    console.log(existing.version || "Blender version verified.");
    return;
  }

  const version = process.env.BLENDER_VERSION || PINNED_BLENDER_VERSION;
  const platformArchive = supportedArchiveForPlatform(version);
  const downloadUrl = process.env.BLENDER_DOWNLOAD_URL || platformArchive?.url;

  if (!downloadUrl) {
    printManualInstructions(`Unsupported platform for automatic Blender download: ${process.platform}/${process.arch}`);
    process.exit(1);
  }

  const archiveName =
    platformArchive?.archiveName || path.basename(new URL(downloadUrl).pathname) || `blender-${version}.archive`;
  const archiveType =
    platformArchive?.type ||
    (archiveName.endsWith(".tar.xz") ? "tar.xz" : archiveName.endsWith(".dmg") ? "dmg" : null);

  if (!archiveType) {
    printManualInstructions(`Cannot infer archive type for ${archiveName}. Use a .tar.xz or .dmg Blender archive.`);
    process.exit(1);
  }

  await mkdir(downloadsRoot, { recursive: true });
  const archivePath = path.join(downloadsRoot, archiveName);

  try {
    await stat(archivePath);
    console.log(`Using existing download: ${archivePath}`);
  } catch {
    console.log(`Downloading Blender ${version} from ${downloadUrl}`);
    console.log(`Archive destination: ${archivePath}`);
    await downloadFile(downloadUrl, archivePath);
  }

  try {
    if (archiveType === "tar.xz") {
      await extractLinuxTar(archivePath);
    } else if (archiveType === "dmg") {
      await extractMacDmg(archivePath);
    }
  } catch (error) {
    printManualInstructions(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const installed = await resolveBlender();
  if (!installed) {
    printManualInstructions("Blender archive extracted, but no working Blender binary could be verified.");
    process.exit(1);
  }

  console.log(`Blender installed: ${installed.path}`);
  console.log(installed.version || "Blender version verified.");
}

main().catch((error) => {
  printManualInstructions(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
