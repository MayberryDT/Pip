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
