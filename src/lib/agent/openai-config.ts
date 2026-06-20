import OpenAI from "openai";
import type { AgentResponse } from "@/lib/agent/card-types";

export const PIP_AI_MODEL = "gpt-5-nano";
export const NETLIFY_AI_GATEWAY_MODEL = "gpt-5-nano";

export type AiTransport = NonNullable<AgentResponse["audit"]["transport"]>;

export type OpenAIClientConfig = {
  apiKey?: string;
  baseURL?: string;
  transport: AiTransport;
};

export function createOpenAIClient(config: OpenAIClientConfig = getOpenAIClientConfig()): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
}

export function shouldUseModel(): boolean {
  return (
    Boolean(process.env.NETLIFY_AI_GATEWAY_BASE_URL && process.env.NETLIFY_AI_GATEWAY_KEY) ||
    Boolean(process.env.OPENAI_API_KEY) ||
    Boolean(process.env.OPENAI_BASE_URL)
  );
}

export function getPipAiModel(env: Record<string, string | undefined> = process.env): string {
  if (env.PIP_AI_MODEL) {
    return env.PIP_AI_MODEL;
  }

  if (isNetlifyAiGatewayConfigured(env) || env.OPENAI_BASE_URL) {
    return NETLIFY_AI_GATEWAY_MODEL;
  }

  return PIP_AI_MODEL;
}

export function getOpenAIApiKeyForSdk(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return getOpenAIClientConfig(env).apiKey;
}

export function getOpenAIClientConfig(
  env: Record<string, string | undefined> = process.env,
): OpenAIClientConfig {
  if (isNetlifyAiGatewayConfigured(env)) {
    return {
      apiKey: env.NETLIFY_AI_GATEWAY_KEY,
      baseURL: env.NETLIFY_AI_GATEWAY_BASE_URL,
      transport: "netlify-ai-gateway",
    };
  }

  if (env.OPENAI_BASE_URL) {
    return {
      apiKey: env.OPENAI_API_KEY || "netlify-ai-gateway",
      baseURL: env.OPENAI_BASE_URL,
      transport:
        env.PIP_AI_TRANSPORT === "custom-openai-compatible"
          ? "custom-openai-compatible"
          : "netlify-ai-gateway",
    };
  }

  return {
    apiKey: env.OPENAI_API_KEY,
    transport: "openai-direct",
  };
}

function isNetlifyAiGatewayConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.NETLIFY_AI_GATEWAY_BASE_URL && env.NETLIFY_AI_GATEWAY_KEY);
}

export function getPipAiTransport(
  env: Record<string, string | undefined> = process.env,
): AiTransport {
  return getOpenAIClientConfig(env).transport;
}
