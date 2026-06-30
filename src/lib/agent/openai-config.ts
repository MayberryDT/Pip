import OpenAI from "openai";
import type { AgentResponse } from "@/lib/agent/card-types";

export const PIP_AI_MODEL = "gpt-5-nano";

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
  return Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL);
}

export function getPipAiModel(env: Record<string, string | undefined> = process.env): string {
  if (env.PIP_AI_MODEL) {
    return env.PIP_AI_MODEL;
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
  if (env.OPENAI_BASE_URL) {
    return {
      apiKey: env.OPENAI_API_KEY || "openai-compatible",
      baseURL: env.OPENAI_BASE_URL,
      transport: "custom-openai-compatible",
    };
  }

  return {
    apiKey: env.OPENAI_API_KEY,
    transport: "openai-direct",
  };
}

export function getPipAiTransport(
  env: Record<string, string | undefined> = process.env,
): AiTransport {
  return getOpenAIClientConfig(env).transport;
}
