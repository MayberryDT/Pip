import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const incomingDir = path.join(repoRoot, "design/pip-character/incoming");
const normalizedAssetsPath = path.join(incomingDir, "normalized/assets.json");
const proposedMappingPath = path.join(incomingDir, "proposed-mapping.json");
const mappingPath = path.join(incomingDir, "mapping.json");

const targets = [
  "avatar/normal",
  "avatar/happy",
  "avatar/thinking",
  "avatar/careful",
  "avatar/concerned",
  "avatar/shortfall",
  "avatar/uncertain",
  "avatar/wave",
  "avatar/success",
  "avatar/sleepy",
  "small/normal",
  "small/happy",
  "small/thinking",
  "small/careful",
  "small/concerned",
  "small/shortfall",
  "small/uncertain",
  "small/wave",
  "small/success",
  "small/listening",
  "medium/onboarding-wave",
  "medium/savings-cushion",
  "medium/connect-accounts",
  "medium/thinking",
  "medium/guidance-read",
  "medium/missing-data",
  "medium/repair-connection",
  "medium/shortfall",
  "medium/recovered",
  "medium/empty-state",
  "hero/welcome",
  "hero/daily-checkin",
  "hero/protective",
  "hero/thinking",
  "hero/gentle-warning",
  "hero/recovered",
  "hero/app-store",
  "hero/website",
  "hero/social-thumbnail",
  "hero/transparent-fullbody",
  "reaction/small-lift",
  "reaction/big-lift",
  "reaction/small-drop",
  "reaction/big-drop",
  "reaction/tight",
  "reaction/shortfall",
  "reaction/recovered",
  "reaction/data-issue",
  "reaction/syncing",
  "reaction/connection-repaired"
];

function buildEmptyAssets() {
  return Object.fromEntries(targets.map((target) => [target, null]));
}

function buildBaseMapping(stableIds) {
  return {
    version: "v001",
    status: "needs_review",
    notes: [
      "Review review.html, then fill each asset target with a stable ID such as pip-upload-001.",
      "Do not map branchless or low-quality Pip images."
    ],
    assets: buildEmptyAssets(),
    unassigned: stableIds
  };
}

function mergeExistingMapping(baseMapping, stableIds) {
  if (!existsSync(mappingPath)) {
    return baseMapping;
  }

  const existing = JSON.parse(readFileSync(mappingPath, "utf8"));
  const assets = buildEmptyAssets();

  for (const target of targets) {
    if (existing.assets && Object.hasOwn(existing.assets, target)) {
      assets[target] = existing.assets[target];
    }
  }

  const usedStableIds = new Set(
    Object.values(assets).filter((value) => typeof value === "string" && value.length > 0)
  );

  const merged = {
    ...baseMapping,
    ...existing,
    version: existing.version || baseMapping.version,
    status: existing.status || baseMapping.status,
    notes: Array.isArray(existing.notes) ? existing.notes : baseMapping.notes,
    assets,
    unassigned: stableIds.filter((stableId) => !usedStableIds.has(stableId))
  };

  if (existing.allowDuplicateSource === true) {
    merged.allowDuplicateSource = true;
  }

  return merged;
}

if (!existsSync(normalizedAssetsPath)) {
  console.error("Missing normalized asset metadata. Run npm run pip:character:normalize first.");
  process.exit(1);
}

mkdirSync(incomingDir, { recursive: true });

const normalizedAssets = JSON.parse(readFileSync(normalizedAssetsPath, "utf8"));
const stableIds = normalizedAssets.map((asset) => asset.stableId);
const proposedMapping = buildBaseMapping(stableIds);
const editableMapping = mergeExistingMapping(proposedMapping, stableIds);

writeFileSync(proposedMappingPath, `${JSON.stringify(proposedMapping, null, 2)}\n`);
writeFileSync(mappingPath, `${JSON.stringify(editableMapping, null, 2)}\n`);

console.log("Wrote design/pip-character/incoming/proposed-mapping.json with null mappings for review.");
console.log("Wrote design/pip-character/incoming/mapping.json for manual review.");
