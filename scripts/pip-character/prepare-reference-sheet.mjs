import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { repoRoot } from "./find-blender.mjs";

const REFERENCE_PATH = path.join(
  repoRoot,
  "design/pip-character/references/pip-reference-sheet-v001.png",
);

const OUTPUT_DIR = path.join(repoRoot, "design/pip-character/references/crops/v001");

export const CROP_BOXES = {
  front: { left: 80, top: 160, width: 310, height: 390 },
  three_quarter: { left: 410, top: 165, width: 330, height: 390 },
  side: { left: 760, top: 165, width: 280, height: 390 },
  back: { left: 1080, top: 165, width: 300, height: 390 },
  expression_normal: { left: 75, top: 635, width: 245, height: 290 },
  expression_happy: { left: 325, top: 635, width: 245, height: 290 },
  expression_careful: { left: 575, top: 635, width: 245, height: 290 },
  expression_concerned: { left: 825, top: 635, width: 245, height: 290 },
  expression_shortfall: { left: 1075, top: 635, width: 260, height: 290 },
};

function assertCropWithinImage(name, crop, metadata) {
  const right = crop.left + crop.width;
  const bottom = crop.top + crop.height;

  if (
    crop.left < 0 ||
    crop.top < 0 ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    right > metadata.width ||
    bottom > metadata.height
  ) {
    throw new Error(
      `Crop "${name}" is outside the reference image bounds. ` +
        `Image: ${metadata.width}x${metadata.height}, crop: ${JSON.stringify(crop)}`,
    );
  }
}

async function main() {
  let reference;
  let metadata;

  try {
    reference = sharp(REFERENCE_PATH);
    metadata = await reference.metadata();
  } catch (error) {
    throw new Error(
      `Could not read ${REFERENCE_PATH}. Ensure the canonical reference sheet exists and is a valid PNG.\n${error}`,
    );
  }

  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not determine image dimensions for ${REFERENCE_PATH}.`);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const crops = {};
  for (const [name, crop] of Object.entries(CROP_BOXES)) {
    assertCropWithinImage(name, crop, metadata);
    const outputPath = path.join(OUTPUT_DIR, `${name}.png`);

    await sharp(REFERENCE_PATH)
      .extract(crop)
      .png()
      .toFile(outputPath);

    crops[name] = {
      file: path.relative(repoRoot, outputPath),
      box: crop,
    };
  }

  const cropMetadata = {
    source: path.relative(repoRoot, REFERENCE_PATH),
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    crops,
  };

  const metadataPath = path.join(OUTPUT_DIR, "crops.json");
  await writeFile(metadataPath, `${JSON.stringify(cropMetadata, null, 2)}\n`);

  console.log(`Prepared Pip reference crops in ${path.relative(repoRoot, OUTPUT_DIR)}`);
  console.log(`Crop metadata: ${path.relative(repoRoot, metadataPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
