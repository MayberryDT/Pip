import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const mappingPath = path.join(repoRoot, "design/pip-character/incoming/mapping.json");
const normalizedAssetsPath = path.join(repoRoot, "design/pip-character/incoming/normalized/assets.json");
const normalizedDir = path.join(repoRoot, "design/pip-character/incoming/normalized");
const publicBaseDir = path.join(repoRoot, "public/brand/pip-character/v001");

const minimumRequiredTargets = [
  "avatar/normal",
  "avatar/thinking",
  "avatar/concerned",
  "medium/onboarding-wave"
];

function isSafeTarget(target) {
  return /^[a-z]+\/[a-z0-9-]+$/.test(target);
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) {
    console.error(`Missing ${label}: ${path.relative(repoRoot, filePath)}`);
    process.exit(1);
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

const mapping = readJson(mappingPath, "mapping file");
const normalizedAssets = readJson(normalizedAssetsPath, "normalized asset metadata");
const assetsByStableId = new Map(normalizedAssets.map((asset) => [asset.stableId, asset]));
const mappedEntries = Object.entries(mapping.assets || {}).filter(([, stableId]) => stableId !== null);
const allowDuplicateSource = mapping.allowDuplicateSource === true;

const errors = [];
const warnings = [];

for (const requiredTarget of minimumRequiredTargets) {
  if (!mapping.assets || !mapping.assets[requiredTarget]) {
    errors.push(`Missing minimum required mapping: ${requiredTarget}`);
  }
}

const targetsByStableId = new Map();

for (const [target, stableId] of mappedEntries) {
  if (!isSafeTarget(target)) {
    errors.push(`Unsafe target path in mapping: ${target}`);
    continue;
  }

  if (typeof stableId !== "string" || stableId.length === 0) {
    errors.push(`Invalid stable ID for ${target}: ${stableId}`);
    continue;
  }

  if (!assetsByStableId.has(stableId)) {
    errors.push(`Mapped stable ID does not exist for ${target}: ${stableId}`);
    continue;
  }

  if (!allowDuplicateSource) {
    const existingTargets = targetsByStableId.get(stableId) || [];
    existingTargets.push(target);
    targetsByStableId.set(stableId, existingTargets);
  }
}

if (!allowDuplicateSource) {
  for (const [stableId, targets] of targetsByStableId.entries()) {
    if (targets.length > 1) {
      errors.push(
        `Stable ID ${stableId} is mapped to multiple targets (${targets.join(", ")}). Add "allowDuplicateSource": true to mapping.json to allow this.`
      );
    }
  }
}

for (const [target, stableId] of Object.entries(mapping.assets || {})) {
  if (stableId === null && !minimumRequiredTargets.includes(target)) {
    warnings.push(`Missing optional mapping: ${target}`);
  }
}

if (errors.length > 0) {
  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }

  for (const error of errors) {
    console.error(`Error: ${error}`);
  }

  process.exit(1);
}

let copiedCount = 0;

for (const [target, stableId] of mappedEntries) {
  const asset = assetsByStableId.get(stableId);
  const sourcePath = path.join(normalizedDir, asset.normalizedFilename);
  const [category, name] = target.split("/");
  const extension = asset.extension || path.extname(asset.normalizedFilename) || ".jpg";
  const destinationDir = path.join(publicBaseDir, category);
  const destinationPath = path.join(destinationDir, `${name}${extension}`);

  mkdirSync(destinationDir, { recursive: true });
  copyFileSync(sourcePath, destinationPath);
  copiedCount += 1;
}

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}

console.log(`Applied ${copiedCount} Pip character asset mapping(s) to public/brand/pip-character/v001/.`);
