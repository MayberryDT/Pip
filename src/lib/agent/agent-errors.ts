export class AgentUnavailableError extends Error {
  code: string;
  status: number;
  detail?: string;

  constructor(input: {
    code: string;
    message: string;
    status?: number;
    detail?: string;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "AgentUnavailableError";
    this.code = input.code;
    this.status = input.status ?? 503;
    this.detail = input.detail;
    this.cause = input.cause;
  }
}

export type AgentErrorPayload = {
  code: string;
  error: string;
  detail?: string;
  status: number;
};

export function toAgentErrorPayload(error: unknown): AgentErrorPayload {
  if (error instanceof AgentUnavailableError) {
    if (isAgentOutputError(error)) {
      return {
        code: "invalid-agent-output",
        error: "AI returned an invalid response.",
        detail: error.detail,
        status: 502,
      };
    }

    return {
      code: error.code,
      error: error.message,
      detail: error.detail,
      status: error.status,
    };
  }

  const detail = getErrorDetail(error);

  if (isModelOutputValidationDetail(detail)) {
    return {
      code: "invalid-agent-output",
      error: "AI returned an invalid response.",
      detail,
      status: 502,
    };
  }

  return {
    code: "agent-error",
    error: "Agent failed.",
    detail,
    status: 500,
  };
}

export function getErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeErrorDetail(error.message);
  }

  return "Unknown AI error.";
}

function isAgentOutputError(error: AgentUnavailableError): boolean {
  return error.status === 502 && (
    [
      "invalid-agent-output",
      "model-returned-invalid-final-output",
      "model-returned-invalid-guidance-card",
      "model-returned-disallowed-final-message",
      "model-promised-unsupported-card",
      "model-returned-no-prompt-chips",
      "model-returned-too-long-final-message",
      "agent-output-rejected",
    ].includes(error.code) ||
    isModelOutputValidationDetail(error.message + " " + (error.detail ?? ""))
  );
}

export function isModelOutputValidationDetail(detail: string): boolean {
  return /invalid output type|schema validation|expected schema|too[_ -]?(?:big|long)|invalid final response|model[- ]output validation|final output schema|response validation|zoderror/i.test(
    detail,
  );
}

export function sanitizeErrorDetail(detail: string): string {
  return detail.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 180);
}
