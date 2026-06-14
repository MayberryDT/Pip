import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const publicBaseDir = path.join(repoRoot, "public/brand/pip-character/v001");

const errors = [];

const requiredProductionAssets = [
  "public/brand/pip-character/v001/avatar/normal.png",
  "public/brand/pip-character/v001/avatar/happy.png",
  "public/brand/pip-character/v001/avatar/thinking.png",
  "public/brand/pip-character/v001/avatar/concerned.png",
  "public/brand/pip-character/v001/medium/onboarding-wave.png"
];

const blockedFilenameParts = [
  "branchless",
  "no-branch",
  "without-branch"
];

const blockedDocPhrases = [
  "branch optional",
  "branch can be omitted",
  "hide branch",
  "branchless avatar"
];

function listFilesRecursive(rootDir) {
  if (!existsSync(rootDir)) {
    return [];
  }

  const files = [];

  for (const entry of readdirSync(rootDir)) {
    const entryPath = path.join(rootDir, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      files.push(...listFilesRecursive(entryPath));
    } else {
      files.push(entryPath);
    }
  }

  return files;
}

for (const assetPath of requiredProductionAssets) {
  if (!existsSync(path.join(repoRoot, assetPath))) {
    errors.push(`Missing required production asset: ${assetPath}`);
    continue;
  }

  try {
    const metadata = await sharp(path.join(repoRoot, assetPath)).metadata();

    if (metadata.format !== "png") {
      errors.push(`Required production asset must be PNG: ${assetPath}`);
    }

    if (!metadata.hasAlpha) {
      errors.push(`Required production asset must have transparency alpha: ${assetPath}`);
    }
  } catch (error) {
    errors.push(`Could not inspect required production asset: ${assetPath} (${error instanceof Error ? error.message : error})`);
  }
}

for (const filePath of listFilesRecursive(publicBaseDir)) {
  const filename = path.basename(filePath).toLowerCase();

  if (blockedFilenameParts.some((part) => filename.includes(part))) {
    errors.push(`Production asset filename violates branch rule: ${path.relative(repoRoot, filePath)}`);
  }
}

const docsToScan = [
  "design/pip-character/README.md",
  "design/pip-character/pip-character-bible.md",
  "design/pip-character/asset-manifest.json"
];

for (const docPath of docsToScan) {
  const absoluteDocPath = path.join(repoRoot, docPath);

  if (!existsSync(absoluteDocPath)) {
    errors.push(`Missing required doc: ${docPath}`);
    continue;
  }

  const contents = readFileSync(absoluteDocPath, "utf8").toLowerCase();

  for (const phrase of blockedDocPhrases) {
    if (contents.includes(phrase)) {
      errors.push(`Doc violates branch rule by saying "${phrase}": ${docPath}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`Error: ${error}`);
  }

  console.error(`Pip character asset check failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log("Pip character asset check passed.");
