import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const rawDir = path.join(repoRoot, "design/pip-character/incoming/raw");
const rawManifestPath = path.join(rawDir, "raw-assets.json");

const sourceFiles = [
  "/home/tyler/Documents/FreeCash/img_02c54b414f5e.jpg",
  "/home/tyler/Documents/FreeCash/img_08cff081fa8f.jpg",
  "/home/tyler/Documents/FreeCash/img_140d1e7fcd56.jpg",
  "/home/tyler/Documents/FreeCash/img_14524a89a672.jpg",
  "/home/tyler/Documents/FreeCash/img_2556a04b19ac.jpg",
  "/home/tyler/Documents/FreeCash/img_26c2dbaa66e5.jpg",
  "/home/tyler/Documents/FreeCash/img_288b1e4d7cc0.jpg",
  "/home/tyler/Documents/FreeCash/img_3bf74cc54c91.jpg",
  "/home/tyler/Documents/FreeCash/img_4569b63034dd.jpg",
  "/home/tyler/Documents/FreeCash/img_4708514b00e8.jpg",
  "/home/tyler/Documents/FreeCash/img_4814ff38743f.jpg",
  "/home/tyler/Documents/FreeCash/img_48304d8fa142.jpg",
  "/home/tyler/Documents/FreeCash/img_4badf0b46162.jpg",
  "/home/tyler/Documents/FreeCash/img_5312e55c9756.jpg",
  "/home/tyler/Documents/FreeCash/img_550fd993e086.jpg",
  "/home/tyler/Documents/FreeCash/img_5e0910aac9b8.jpg",
  "/home/tyler/Documents/FreeCash/img_76a5f6c2176c.jpg",
  "/home/tyler/Documents/FreeCash/img_7bf4406d4b85.jpg",
  "/home/tyler/Documents/FreeCash/img_7c6fa8356766.jpg",
  "/home/tyler/Documents/FreeCash/img_7ed84a519c69.jpg",
  "/home/tyler/Documents/FreeCash/img_7edd8280fc0d.jpg",
  "/home/tyler/Documents/FreeCash/img_8e106f914825.jpg",
  "/home/tyler/Documents/FreeCash/img_8e3843d56e93.jpg",
  "/home/tyler/Documents/FreeCash/img_a26b7322b3dc.jpg",
  "/home/tyler/Documents/FreeCash/img_b2ec2dd04a37.jpg",
  "/home/tyler/Documents/FreeCash/img_c2aaaa5b7a62.jpg",
  "/home/tyler/Documents/FreeCash/img_c84a0ee132ce.jpg",
  "/home/tyler/Documents/FreeCash/img_ca212f6ac74c.jpg",
  "/home/tyler/Documents/FreeCash/img_d489112e7445.jpg",
  "/home/tyler/Documents/FreeCash/img_d643e9306dbf.jpg",
  "/home/tyler/Documents/FreeCash/img_d7f4bcf6c99a.jpg",
  "/home/tyler/Documents/FreeCash/img_ded4cc1fae31.jpg",
  "/home/tyler/Documents/FreeCash/img_ec88df34718b.jpg",
  "/home/tyler/Documents/FreeCash/img_edf8667c1792.jpg",
  "/home/tyler/Documents/FreeCash/img_ee635f7a0dd5.jpg",
  "/home/tyler/Documents/FreeCash/img_eec1baa12326.jpg",
  "/home/tyler/Documents/FreeCash/img_f64a1ca51eb3.jpg",
  "/home/tyler/Documents/FreeCash/img_f74ef889dd2a.jpg",
  "/home/tyler/Documents/FreeCash/img_fa6246206c38.jpg"
];

function stableIdForIndex(index) {
  return `pip-upload-${String(index + 1).padStart(3, "0")}`;
}

mkdirSync(rawDir, { recursive: true });

const missing = [];
const rawAssets = [];

sourceFiles.forEach((sourcePath, index) => {
  if (!existsSync(sourcePath)) {
    missing.push(sourcePath);
    return;
  }

  const stableId = stableIdForIndex(index);
  const originalFilename = path.basename(sourcePath);
  const extension = path.extname(originalFilename).toLowerCase() || ".jpg";
  const rawFilename = `${stableId}${extension}`;
  const destinationPath = path.join(rawDir, rawFilename);

  copyFileSync(sourcePath, destinationPath);

  rawAssets.push({
    stableId,
    originalPath: sourcePath,
    rawFilename,
    originalFilename
  });
});

writeFileSync(rawManifestPath, `${JSON.stringify(rawAssets, null, 2)}\n`);

if (missing.length > 0) {
  console.warn("Warning: missing Pip source image paths:");
  for (const sourcePath of missing) {
    console.warn(`- ${sourcePath}`);
  }
}

console.log(`Imported ${rawAssets.length} Pip image asset(s) into design/pip-character/incoming/raw/.`);
console.log("Wrote design/pip-character/incoming/raw/raw-assets.json.");
