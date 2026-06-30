export type PipAgentQualityVariantId =
  | "champion"
  | "direct-answer"
  | "grounded-read"
  | "action-next"
  | "calm-plainspoken"
  | "skeptical-clarifier";

const variantInstructions: Record<PipAgentQualityVariantId, string> = {
  champion: "",
  "direct-answer": "Quality variant: put the bottom line first. Use one short sentence before any card. Avoid meta setup.",
  "grounded-read": "Quality variant: when giving a read, name the single biggest pressure and tie it to evidence. Do not add unsupported certainty.",
  "action-next": "Quality variant: make the next useful user action obvious. Prefer one concrete next question or one useful prompt chip family.",
  "calm-plainspoken": "Quality variant: sound calm, plainspoken, and direct. Avoid product jargon and dramatic language.",
  "skeptical-clarifier": "Quality variant: when the prompt is ambiguous or lacks an amount, clarify instead of guessing. Keep the clarification short.",
};

export function resolvePipAgentQualityVariant(value?: string | null): PipAgentQualityVariantId {
  if (!value) {
    return "champion";
  }

  return Object.prototype.hasOwnProperty.call(variantInstructions, value)
    ? (value as PipAgentQualityVariantId)
    : "champion";
}

export function getPipAgentQualityVariantInstructions(value?: string | null): string {
  return variantInstructions[resolvePipAgentQualityVariant(value)];
}
