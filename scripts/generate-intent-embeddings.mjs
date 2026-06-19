#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const catalogPath = resolve("src/lib/agent/intent-catalog.ts");
const artifactPath = resolve("src/lib/agent/generated/intent-embeddings.json");
const dimensions = Number(process.env.PIP_INTENT_STATIC_EMBEDDING_DIMENSIONS || 96);

const catalogSource = readFileSync(catalogPath, "utf8");
const catalogHash = createHash("sha256").update(catalogSource).digest("hex");
const artifact = {
  version: 1,
  generatedAt: new Date().toISOString(),
  provider: "static-local",
  model: "pip-static-token-hash-v1",
  catalogHash,
  dimensions,
  examples: [],
};

mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Wrote ${artifactPath}`);
