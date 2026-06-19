import OpenAI from "openai";

export type EmbeddingProvider = {
  name: string;
  model: string;
  dimensions?: number;
  embed: (texts: string[]) => Promise<number[][]>;
};

export function createOpenAICompatibleEmbeddingProvider(
  env: Record<string, string | undefined> = process.env,
): EmbeddingProvider | null {
  const apiKey = env.PIP_INTENT_EMBEDDING_API_KEY ?? env.OPENAI_API_KEY ?? env.NETLIFY_AI_GATEWAY_KEY;
  const baseURL = env.PIP_INTENT_EMBEDDING_BASE_URL ?? env.OPENAI_BASE_URL ?? env.NETLIFY_AI_GATEWAY_BASE_URL;
  const model = env.PIP_INTENT_EMBEDDING_MODEL ?? "text-embedding-3-small";

  if (!apiKey) {
    return null;
  }

  const client = new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });

  return {
    name: "openai-compatible",
    model,
    async embed(texts) {
      const response = await client.embeddings.create({
        model,
        input: texts,
      });

      return response.data.map((item) => item.embedding);
    },
  };
}
