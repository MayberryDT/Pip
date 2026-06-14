import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const normalizedDir = path.join(repoRoot, "design/pip-character/incoming/normalized");
const assetsPath = path.join(normalizedDir, "assets.json");
const reviewDir = path.join(repoRoot, "design/pip-character/incoming/contact-sheets");
const reviewHtmlPath = path.join(reviewDir, "review.html");
const reviewMdPath = path.join(reviewDir, "review.md");

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

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

if (!existsSync(assetsPath)) {
  console.error("Missing normalized asset metadata. Run npm run pip:character:normalize first.");
  process.exit(1);
}

mkdirSync(reviewDir, { recursive: true });

const assets = JSON.parse(readFileSync(assetsPath, "utf8"));

const enrichedAssets = assets.map((asset) => {
  const imagePath = path.join(normalizedDir, asset.normalizedFilename);
  return {
    ...asset,
    dimensions: readJpegDimensions(imagePath),
    relativeImagePath: `../normalized/${asset.normalizedFilename}`,
    normalizedRepoPath: `design/pip-character/incoming/normalized/${asset.normalizedFilename}`
  };
});

const cards = enrichedAssets
  .map((asset) => {
    const dimensions = asset.dimensions ? `${asset.dimensions.width} x ${asset.dimensions.height}` : "";
    const mappingLine = `"avatar/normal": "${asset.stableId}"`;

    return `      <article class="asset-card">
        <img src="${htmlEscape(asset.relativeImagePath)}" alt="${htmlEscape(asset.stableId)}" loading="lazy">
        <div class="asset-body">
          <h2>${htmlEscape(asset.stableId)}</h2>
          <dl>
            <div><dt>Original</dt><dd>${htmlEscape(asset.originalFilename)}</dd></div>
            ${dimensions ? `<div><dt>Dimensions</dt><dd>${htmlEscape(dimensions)}</dd></div>` : ""}
          </dl>
          <label>Mapping line template</label>
          <code>${htmlEscape(mappingLine)}</code>
        </div>
      </article>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pip Character Asset Review</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #17231f;
      --muted: #637069;
      --line: #d7ded7;
      --paper: #fbfcf9;
      --panel: #ffffff;
      --sage: #7c947f;
      --code: #eef3ec;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: var(--ink);
      background: var(--paper);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }

    header {
      padding: 32px clamp(16px, 4vw, 48px) 20px;
      border-bottom: 1px solid var(--line);
      background: #f4f7f1;
    }

    h1 {
      margin: 0 0 10px;
      font-size: clamp(28px, 5vw, 44px);
      line-height: 1.05;
      letter-spacing: 0;
    }

    header p {
      max-width: 860px;
      margin: 0;
      color: var(--muted);
      font-size: 16px;
    }

    main {
      padding: 24px clamp(16px, 4vw, 48px) 48px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 18px;
      align-items: stretch;
    }

    .asset-card {
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 1px 2px rgba(23, 35, 31, 0.04);
    }

    .asset-card img {
      display: block;
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: contain;
      background: #f7f8f4;
      border-bottom: 1px solid var(--line);
    }

    .asset-body {
      padding: 14px;
    }

    h2 {
      margin: 0 0 10px;
      color: var(--sage);
      font-size: 20px;
      line-height: 1.15;
      letter-spacing: 0;
    }

    dl {
      display: grid;
      gap: 8px;
      margin: 0 0 12px;
    }

    dt {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }

    dd {
      margin: 2px 0 0;
      overflow-wrap: anywhere;
      font-size: 13px;
    }

    label {
      display: block;
      margin-bottom: 6px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }

    code {
      display: block;
      width: 100%;
      padding: 9px;
      overflow-x: auto;
      border-radius: 6px;
      background: var(--code);
      color: #243a2f;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <header>
    <h1>Pip Character Asset Review</h1>
    <p>Review the images and fill design/pip-character/incoming/mapping.json with the stable IDs. Do not map branchless or low-quality Pip images. The minimum app mappings are avatar/normal, avatar/thinking, avatar/concerned, and medium/onboarding-wave.</p>
  </header>
  <main>
    <section class="grid" aria-label="Normalized Pip image assets">
${cards}
    </section>
  </main>
</body>
</html>
`;

const markdown = [
  "# Pip Character Asset Review",
  "",
  "Review `review.html`, then fill `design/pip-character/incoming/mapping.json` with stable IDs.",
  "",
  ...enrichedAssets.map((asset) => {
    return `- ${asset.stableId} | ${asset.originalFilename} | ${asset.normalizedRepoPath}`;
  }),
  ""
].join("\n");

writeFileSync(reviewHtmlPath, html);
writeFileSync(reviewMdPath, markdown);

console.log("Wrote design/pip-character/incoming/contact-sheets/review.html.");
console.log("Wrote design/pip-character/incoming/contact-sheets/review.md.");
