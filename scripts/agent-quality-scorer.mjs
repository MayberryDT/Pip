import { QUALITY_DIMENSIONS } from "../tests/fixtures/agent-quality/champion-challenger-cases.mjs";

export function scoreCaseQuality({ caseDef, result }) {
  const quality = caseDef?.quality || result?.quality || {};
  const failures = asArray(result?.failures).map(String);
  const responseText = String(result?.responseSearchText || result?.responseMessage || result?.message || "");
  const dimensions = asArray(quality.dimensions);
  const dimensionScores = {};
  const guardFailed = Boolean(quality.guard && (failures.length > 0 || hasGuardTextFailure({ quality, responseText })));

  if (guardFailed) {
    return {
      total: 0,
      guardFailed: true,
      failures,
      dimensionScores,
    };
  }

  for (const dimension of dimensions) {
    dimensionScores[dimension] = scoreDimension({
      dimension,
      quality,
      result,
      responseText,
      failures,
    });
  }

  const totalWeight = dimensions.reduce((sum, dimension) => sum + (QUALITY_DIMENSIONS[dimension] || 0), 0);
  const weighted = totalWeight === 0
    ? (result?.ok ? 100 : 0)
    : dimensions.reduce((sum, dimension) => {
        const weight = QUALITY_DIMENSIONS[dimension] || 0;

        return sum + (dimensionScores[dimension] || 0) * weight;
      }, 0) / totalWeight;

  return {
    total: round(Math.max(0, Math.min(100, weighted))),
    guardFailed: false,
    failures,
    dimensionScores,
  };
}

export function scoreEvalReportQuality({ cases }) {
  const scoredCases = cases.map((entry) => ({
    id: entry.caseDef?.id || entry.result?.id,
    group: entry.caseDef?.group || entry.caseDef?.quality?.group || entry.result?.group,
    score: scoreCaseQuality(entry),
  }));
  const averageScore = scoredCases.length === 0
    ? 0
    : round(scoredCases.reduce((sum, entry) => sum + entry.score.total, 0) / scoredCases.length);
  const weakDimensions = findWeakDimensions(scoredCases);

  return {
    averageScore,
    guardFailureCount: scoredCases.filter((entry) => entry.score.guardFailed).length,
    weakDimensions,
    cases: scoredCases,
  };
}

export function attachQualityScores({ report, casePool }) {
  const caseById = new Map(casePool.map((caseDef) => [caseDef.id, caseDef]));
  const cases = asArray(report?.cases).map((result) => {
    const caseDef = caseById.get(result.id) || {
      id: result.id,
      group: result.group,
      quality: result.quality,
    };
    const qualityScore = scoreCaseQuality({ caseDef, result });

    return {
      ...result,
      group: caseDef.group || result.group,
      quality: caseDef.quality || result.quality,
      qualityScore,
    };
  });
  const quality = scoreEvalReportQuality({
    cases: cases.map((result) => ({
      caseDef: caseById.get(result.id) || result,
      result,
    })),
  });

  return {
    ...report,
    cases,
    quality,
  };
}

function scoreDimension(input) {
  let score = input.result?.ok ? 100 : 50;

  for (const pattern of asArray(input.quality.expectedTextPatterns)) {
    if (!new RegExp(pattern, "i").test(input.responseText)) {
      score -= 18;
    }
  }

  for (const pattern of asArray(input.quality.forbiddenTextPatterns)) {
    if (new RegExp(pattern, "i").test(input.responseText)) {
      score -= 30;
    }
  }

  if (input.quality.maxWords && wordCount(input.responseText) > input.quality.maxWords) {
    score -= Math.min(35, (wordCount(input.responseText) - input.quality.maxWords) * 4);
  }

  if (input.dimension === "continuation" && asArray(input.result?.promptChips).length === 0) {
    score -= 20;
  }

  if (input.dimension === "trustBoundary" && input.failures.some((failure) => /forbidden|banned|safe to spend|you can afford|financial advice/i.test(failure))) {
    score -= 35;
  }

  return Math.max(0, Math.min(100, score));
}

function findWeakDimensions(scoredCases) {
  const totals = new Map();
  const counts = new Map();

  for (const entry of scoredCases) {
    for (const [dimension, score] of Object.entries(entry.score.dimensionScores)) {
      totals.set(dimension, (totals.get(dimension) || 0) + score);
      counts.set(dimension, (counts.get(dimension) || 0) + 1);
    }
  }

  return [...totals.entries()]
    .filter(([dimension, total]) => total / counts.get(dimension) < 85)
    .map(([dimension]) => dimension)
    .sort();
}

function hasGuardTextFailure({ quality, responseText }) {
  return asArray(quality.forbiddenTextPatterns).some((pattern) => new RegExp(pattern, "i").test(responseText));
}

function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function round(value) {
  return Math.round(value * 100) / 100;
}
