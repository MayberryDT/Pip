#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const catalogPath = resolve("src/lib/agent/intent-catalog.ts");
const artifactPath = resolve("src/lib/agent/generated/intent-embeddings.json");
const catalogSource = readFileSync(catalogPath, "utf8");
const catalogHash = createHash("sha256").update(catalogSource).digest("hex");
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

if (!artifact.provider || !artifact.model || !artifact.catalogHash) {
  throw new Error("Intent embedding artifact is missing provider, model, or catalogHash metadata.");
}

if (artifact.catalogHash !== catalogHash) {
  throw new Error(
    [
      "Intent embedding artifact is stale.",
      `expected catalogHash ${catalogHash}`,
      `found ${artifact.catalogHash}`,
      "Run: node scripts/generate-intent-embeddings.mjs",
    ].join("\n"),
  );
}

console.log("Intent embedding artifact is current.");
