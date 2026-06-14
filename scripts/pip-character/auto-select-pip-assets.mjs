import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const rawDir = path.join(repoRoot, "design/pip-character/incoming/raw");
const normalizedDir = path.join(repoRoot, "design/pip-character/incoming/normalized");
const rawManifestPath = path.join(rawDir, "raw-assets.json");
const normalizedManifestPath = path.join(normalizedDir, "assets.json");
const autoMappingPath = path.join(repoRoot, "design/pip-character/incoming/auto-mapping.json");
const publicBaseDir = path.join(repoRoot, "public/brand/pip-character/v001");

const targetPaths = {
  "avatar/normal": "avatar/normal.png",
  "avatar/happy": "avatar/happy.png",
  "avatar/thinking": "avatar/thinking.png",
  "avatar/concerned": "avatar/concerned.png",
  "medium/onboarding-wave": "medium/onboarding-wave.png"
};

const visuallySelectedCandidates = {
  "avatar/normal": ["pip-upload-005", "pip-upload-014", "pip-upload-037", "pip-upload-001"],
  "avatar/happy": ["pip-upload-014", "pip-upload-022", "pip-upload-036", "pip-upload-005"],
  "avatar/thinking": ["pip-upload-039", "pip-upload-006", "pip-upload-011", "pip-upload-033"],
  "avatar/concerned": ["pip-upload-025", "pip-upload-020", "pip-upload-031", "pip-upload-008"],
  "medium/onboarding-wave": ["pip-upload-030", "pip-upload-023", "pip-upload-009", "pip-upload-021"]
};

const blockedFilenameParts = [
  "branchless",
  "no-branch",
  "without-branch"
];

const sofMarkers = new Set([
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf
]);

function stableIdForIndex(index) {
  return `pip-upload-${String(index + 1).padStart(3, "0")}`;
}

function listJpgFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory)
    .filter((filename) => /\.(jpe?g)$/i.test(filename))
    .sort((a, b) => a.localeCompare(b));
}

function isBlockedFilename(...filenames) {
  return filenames
    .filter(Boolean)
    .some((filename) => blockedFilenameParts.some((part) => filename.toLowerCase().includes(part)));
}

function sha256ForFile(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function readJpegDimensions(filePath) {
  try {
    const buffer = readFileSync(filePath);

    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      return null;
    }

    let offset = 2;

    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = buffer[offset + 1];
      offset += 2;

      if (marker === 0xd9 || marker === 0xda) {
        break;
      }

      if (offset + 2 > buffer.length) {
        break;
      }

      const segmentLength = buffer.readUInt16BE(offset);

      if (sofMarkers.has(marker) && offset + 7 <= buffer.length) {
        return {
          width: buffer.readUInt16BE(offset + 5),
          height: buffer.readUInt16BE(offset + 3)
        };
      }

      offset += segmentLength;
    }
  } catch {
    return null;
  }

  return null;
}

function ensureRawAssets() {
  mkdirSync(rawDir, { recursive: true });

  const existingRawFiles = listJpgFiles(rawDir);

  if (existingRawFiles.length > 0 && existsSync(rawManifestPath)) {
    return JSON.parse(readFileSync(rawManifestPath, "utf8"));
  }

  if (existingRawFiles.length > 0) {
    const rawAssets = existingRawFiles.map((filename, index) => ({
      stableId: path.basename(filename, path.extname(filename)) || stableIdForIndex(index),
      originalPath: path.join(rawDir, filename),
      rawFilename: filename,
      originalFilename: filename
    }));

    writeFileSync(rawManifestPath, `${JSON.stringify(rawAssets, null, 2)}\n`);
    return rawAssets;
  }

  const localSourceFiles = listJpgFiles(repoRoot).filter((filename) => /^img_.*\.jpe?g$/i.test(filename));
  const rawAssets = [];

  for (const [index, filename] of localSourceFiles.entries()) {
    const stableId = stableIdForIndex(index);
    const sourcePath = path.join(repoRoot, filename);
    const extension = path.extname(filename).toLowerCase() || ".jpg";
    const rawFilename = `${stableId}${extension}`;

    copyFileSync(sourcePath, path.join(rawDir, rawFilename));
    rawAssets.push({
      stableId,
      originalPath: sourcePath,
      rawFilename,
      originalFilename: filename
    });
  }

  writeFileSync(rawManifestPath, `${JSON.stringify(rawAssets, null, 2)}\n`);
  return rawAssets;
}

function ensureNormalizedAssets(rawAssets) {
  mkdirSync(normalizedDir, { recursive: true });

  const existingNormalizedFiles = listJpgFiles(normalizedDir);

  if (existingNormalizedFiles.length > 0 && existsSync(normalizedManifestPath)) {
    return JSON.parse(readFileSync(normalizedManifestPath, "utf8"));
  }

  const normalizedAssets = [];

  for (const [index, rawAsset] of rawAssets.entries()) {
    const rawPath = path.join(rawDir, rawAsset.rawFilename);

    if (!existsSync(rawPath)) {
      continue;
    }

    const stableId = rawAsset.stableId || stableIdForIndex(index);
    const extension = (path.extname(rawAsset.rawFilename) || ".jpg").toLowerCase();
    const normalizedFilename = `${stableId}${extension}`;
    const normalizedPath = path.join(normalizedDir, normalizedFilename);

    copyFileSync(rawPath, normalizedPath);

    normalizedAssets.push({
      stableId,
      originalPath: rawAsset.originalPath,
      originalFilename: rawAsset.originalFilename,
      rawFilename: rawAsset.rawFilename,
      normalizedFilename,
      extension,
      fileSize: statSync(normalizedPath).size,
      sha256: sha256ForFile(normalizedPath)
    });
  }

  writeFileSync(normalizedManifestPath, `${JSON.stringify(normalizedAssets, null, 2)}\n`);
  return normalizedAssets;
}

function choosePreferredAsset(target, assetsByStableId) {
  for (const stableId of visuallySelectedCandidates[target] || []) {
    const asset = assetsByStableId.get(stableId);

    if (asset) {
      return asset;
    }
  }

  return null;
}

function chooseLargestAsset(validAssets) {
  const withDimensions = validAssets
    .map((asset) => ({
      asset,
      dimensions: readJpegDimensions(path.join(normalizedDir, asset.normalizedFilename))
    }))
    .filter((entry) => entry.dimensions);

  if (withDimensions.length === 0) {
    return null;
  }

  return withDimensions.sort((a, b) => {
    const aArea = a.dimensions.width * a.dimensions.height;
    const bArea = b.dimensions.width * b.dimensions.height;
    return bArea - aArea;
  })[0].asset;
}

function isTransparentBackgroundCandidate(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  return r >= 210 && g >= 210 && b >= 210 && max - min <= 34;
}

async function createTransparentPng(sourcePath, destinationPath, { maxDimension } = {}) {
  const source = sharp(sourcePath).ensureAlpha();
  const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const backgroundMask = new Uint8Array(width * height);
  const queue = [];

  function enqueueIfBackground(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) {
      return;
    }

    const pixelIndex = y * width + x;

    if (backgroundMask[pixelIndex] === 1) {
      return;
    }

    const byteIndex = pixelIndex * channels;

    if (!isTransparentBackgroundCandidate(data[byteIndex], data[byteIndex + 1], data[byteIndex + 2])) {
      return;
    }

    backgroundMask[pixelIndex] = 1;
    queue.push([x, y]);
  }

  for (let x = 0; x < width; x += 1) {
    enqueueIfBackground(x, 0);
    enqueueIfBackground(x, height - 1);
  }

  for (let y = 1; y < height - 1; y += 1) {
    enqueueIfBackground(0, y);
    enqueueIfBackground(width - 1, y);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index];
    enqueueIfBackground(x + 1, y);
    enqueueIfBackground(x - 1, y);
    enqueueIfBackground(x, y + 1);
    enqueueIfBackground(x, y - 1);
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const byteIndex = pixelIndex * channels;

      if (backgroundMask[pixelIndex] === 1) {
        data[byteIndex + 3] = 0;
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const contentWidth = Math.max(1, maxX - minX + 1);
  const contentHeight = Math.max(1, maxY - minY + 1);
  const padding = Math.round(Math.max(contentWidth, contentHeight) * 0.08);
  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(width - 1, maxX + padding);
  const bottom = Math.min(height - 1, maxY + padding);

  await sharp(data, { raw: { width, height, channels } })
    .extract({
      left,
      top,
      width: right - left + 1,
      height: bottom - top + 1
    })
    .resize(maxDimension ? {
      width: maxDimension,
      height: maxDimension,
      fit: "inside",
      withoutEnlargement: true
    } : undefined)
    .png({ compressionLevel: 9 })
    .toFile(destinationPath);
}

async function copySelectedAssets(selection, assetsByStableId) {
  for (const [target, stableId] of Object.entries(selection)) {
    const asset = assetsByStableId.get(stableId);
    const relativeTargetPath = targetPaths[target];

    if (!asset || !relativeTargetPath) {
      continue;
    }

    const destinationPath = path.join(publicBaseDir, relativeTargetPath);
    mkdirSync(path.dirname(destinationPath), { recursive: true });
    const sourcePath = path.join(normalizedDir, asset.normalizedFilename);

    if (relativeTargetPath.endsWith(".png")) {
      await createTransparentPng(sourcePath, destinationPath, {
        maxDimension: target.startsWith("avatar/") ? 512 : 800
      });
    } else {
      copyFileSync(sourcePath, destinationPath);
    }
  }
}

const rawAssets = ensureRawAssets();
const normalizedAssets = ensureNormalizedAssets(rawAssets);
const validAssets = normalizedAssets.filter((asset) => {
  if (isBlockedFilename(asset.normalizedFilename, asset.originalFilename, asset.rawFilename)) {
    return false;
  }

  return existsSync(path.join(normalizedDir, asset.normalizedFilename));
});

if (validAssets.length === 0) {
  console.error("No valid Pip image assets found. Expected staged images or local img_*.jpg files.");
  process.exit(1);
}

const assetsByStableId = new Map(validAssets.map((asset) => [asset.stableId, asset]));
const firstValidAsset = validAssets[0];
const defaultAsset =
  choosePreferredAsset("avatar/normal", assetsByStableId) ||
  firstValidAsset;

const selection = {
  "avatar/normal": defaultAsset.stableId,
  "avatar/happy": (choosePreferredAsset("avatar/happy", assetsByStableId) || defaultAsset).stableId,
  "avatar/thinking": (choosePreferredAsset("avatar/thinking", assetsByStableId) || defaultAsset).stableId,
  "avatar/concerned": (choosePreferredAsset("avatar/concerned", assetsByStableId) || defaultAsset).stableId,
  "medium/onboarding-wave": (
    choosePreferredAsset("medium/onboarding-wave", assetsByStableId) ||
    chooseLargestAsset(validAssets) ||
    defaultAsset
  ).stableId
};

const reusedSources = new Set();
const seenStableIds = new Map();

for (const [target, stableId] of Object.entries(selection)) {
  const targets = seenStableIds.get(stableId) || [];
  targets.push(target);
  seenStableIds.set(stableId, targets);
}

for (const [stableId, targets] of seenStableIds.entries()) {
  if (targets.length > 1) {
    reusedSources.add(stableId);
  }
}

const usedStableIds = new Set(Object.values(selection));
const mapping = {
  version: "v001",
  status: "auto_selected_best_effort",
  notes: [
    "Best-effort generated-image mapping created automatically.",
    "All selected assets must keep Pip's leafy branch visible.",
    "Refine this mapping later by editing the preferred candidates in scripts/pip-character/auto-select-pip-assets.mjs or replacing approved public assets."
  ],
  assets: selection,
  unassigned: validAssets.map((asset) => asset.stableId).filter((stableId) => !usedStableIds.has(stableId))
};

mkdirSync(path.dirname(autoMappingPath), { recursive: true });
writeFileSync(autoMappingPath, `${JSON.stringify(mapping, null, 2)}\n`);
await copySelectedAssets(selection, assetsByStableId);

if (reusedSources.size > 0 || new Set(Object.values(selection)).size < Object.values(selection).length) {
  console.warn("Using default Pip image for multiple states. Replace later if needed.");
}

console.log("Auto-selected Pip character assets:");
for (const [target, stableId] of Object.entries(selection)) {
  console.log(`- ${target}: ${stableId}`);
}
console.log("Wrote design/pip-character/incoming/auto-mapping.json.");
console.log("Copied required Pip assets into public/brand/pip-character/v001/.");
