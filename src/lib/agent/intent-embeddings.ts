import type { IntentCatalogEntry } from "@/lib/agent/intent-catalog";
import { normalizeIntentText } from "@/lib/agent/intent-slots";

const DEFAULT_DIMENSIONS = 96;

export type IntentEmbeddingScore = {
  positiveScore: number;
  negativePenalty: number;
  score: number;
};

export function scoreIntentEmbedding(
  message: string,
  entry: IntentCatalogEntry,
  options: {
    dimensions?: number;
    negativeWeight?: number;
  } = {},
): IntentEmbeddingScore {
  const dimensions = options.dimensions ?? DEFAULT_DIMENSIONS;
  const negativeWeight = options.negativeWeight ?? 0.55;
  const queryEmbedding = createStaticTextEmbedding(message, dimensions);
  const positiveScore = maxCosineSimilarity(
    queryEmbedding,
    [...entry.positiveExamples, entry.description],
    dimensions,
  );
  const negativePenalty = maxCosineSimilarity(
    queryEmbedding,
    [...entry.negativeExamples, ...entry.lexicalHardNegatives],
    dimensions,
  );

  return {
    positiveScore,
    negativePenalty,
    score: Math.max(0, positiveScore - negativePenalty * negativeWeight),
  };
}

export function createStaticTextEmbedding(text: string, dimensions = DEFAULT_DIMENSIONS): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const normalized = normalizeIntentText(text).replace(/\$?\d+(?:\.\d+)?/g, "$amount");
  const tokens = normalized
    .split(/\s+/)
    .filter((token) => token.length > 1);
  const shingles = [
    ...tokens,
    ...createNgrams(tokens, 2),
    ...createNgrams(tokens, 3),
  ];

  for (const shingle of shingles) {
    const hash = stableHash(shingle);
    const index = Math.abs(hash) % dimensions;
    const sign = hash % 2 === 0 ? 1 : -1;
    vector[index] += sign * (shingle.includes(" ") ? 1.35 : 1);
  }

  return normalizeVector(vector);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / Math.sqrt(leftNorm * rightNorm);
}

function maxCosineSimilarity(queryEmbedding: number[], examples: string[], dimensions: number): number {
  if (!examples.length) {
    return 0;
  }

  return Math.max(
    ...examples.map((example) => cosineSimilarity(queryEmbedding, createStaticTextEmbedding(example, dimensions))),
  );
}

function createNgrams(tokens: string[], size: number): string[] {
  const ngrams: string[] = [];

  for (let index = 0; index <= tokens.length - size; index += 1) {
    ngrams.push(tokens.slice(index, index + size).join(" "));
  }

  return ngrams;
}

function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));

  if (norm === 0) {
    return vector;
  }

  return vector.map((value) => value / norm);
}

function stableHash(value: string): number {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }

  return hash | 0;
}
