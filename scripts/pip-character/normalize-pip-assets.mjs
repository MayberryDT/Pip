import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const rawDir = path.join(repoRoot, "design/pip-character/incoming/raw");
const normalizedDir = path.join(repoRoot, "design/pip-character/incoming/normalized");
const rawManifestPath = path.join(rawDir, "raw-assets.json");
const normalizedManifestPath = path.join(normalizedDir, "assets.json");

function stableIdForIndex(index) {
  return `pip-upload-${String(index + 1).padStart(3, "0")}`;
}

function sha256ForFile(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function readRawAssets() {
  if (existsSync(rawManifestPath)) {
    return JSON.parse(readFileSync(rawManifestPath, "utf8"));
  }

  if (!existsSync(rawDir)) {
    return [];
  }

  return readdirSync(rawDir)
    .filter((filename) => /\.(jpe?g)$/i.test(filename))
    .sort((a, b) => a.localeCompare(b))
    .map((filename, index) => ({
      stableId: stableIdForIndex(index),
      originalPath: path.join(rawDir, filename),
      rawFilename: filename,
      originalFilename: filename
    }));
}

mkdirSync(normalizedDir, { recursive: true });

const rawAssets = readRawAssets();
const normalizedAssets = [];

for (const asset of rawAssets) {
  const rawPath = path.join(rawDir, asset.rawFilename);

  if (!existsSync(rawPath)) {
    console.warn(`Warning: raw asset missing, skipping ${asset.stableId}: ${asset.rawFilename}`);
    continue;
  }

  const extension = (path.extname(asset.rawFilename) || ".jpg").toLowerCase();
  const normalizedFilename = `${asset.stableId}${extension}`;
  const normalizedPath = path.join(normalizedDir, normalizedFilename);

  copyFileSync(rawPath, normalizedPath);

  normalizedAssets.push({
    stableId: asset.stableId,
    originalPath: asset.originalPath,
    originalFilename: asset.originalFilename,
    rawFilename: asset.rawFilename,
    normalizedFilename,
    extension,
    fileSize: statSync(normalizedPath).size,
    sha256: sha256ForFile(normalizedPath)
  });
}

writeFileSync(normalizedManifestPath, `${JSON.stringify(normalizedAssets, null, 2)}\n`);

console.log(`Normalized ${normalizedAssets.length} Pip image asset(s) into design/pip-character/incoming/normalized/.`);
console.log("Wrote design/pip-character/incoming/normalized/assets.json.");
