import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeSnapshot } from "@/lib/fake-data";

const routeMocks = vi.hoisted(() => ({
  getCurrentFinancialSnapshot: vi.fn(),
}));

vi.mock("@/lib/data/current-snapshot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/current-snapshot")>();

  return {
    ...actual,
    getCurrentFinancialSnapshot: routeMocks.getCurrentFinancialSnapshot,
  };
});

import { POST } from "@/app/api/agent/route";
import { NoFinancialDataError } from "@/lib/data/current-snapshot";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/agent", () => {
  it("rejects invalid request bodies with a structured 400 response", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");

    const response = await POST(jsonRequest({ message: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Message is required.",
    });
  });

  it("returns a structured AI error when model configuration is missing", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");
    vi.stubEnv("FREE_CASH_AI_MODE", "");

    const response = await POST(jsonRequest({ message: "Can I spend $50?" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "missing-openai-config",
      error: "AI is not configured.",
    });
  });

  it("supports the dev-only mock-model header while preserving the agent response schema", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");
    routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);

    const response = await POST(
      jsonRequest(
        {
          message: "Can I spend $12?",
          history: [
            {
              role: "user",
              content: "Why this number?",
            },
            {
              role: "assistant",
              content: "Rent is included.",
            },
          ],
        },
        {
          "x-free-cash-ai-mode": "mock-model",
        },
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      cards: [
        {
          type: "purchase_simulation",
          amountCents: 1200,
        },
      ],
      audit: {
        usedModel: true,
        toolNames: ["simulate_purchase"],
      },
    });
    expect(payload.promptChips).toHaveLength(3);
  });

  it("returns a connect-data error instead of answering from fake rows for authenticated no-data state", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");
    routeMocks.getCurrentFinancialSnapshot.mockRejectedValue(new NoFinancialDataError());

    const response = await POST(jsonRequest({ message: "Why this number?" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "no-financial-data",
      error: "Connect financial data before using live Free Cash.",
    });
  });

  it("rejects oversized history before calling the model", async () => {
    vi.stubEnv("FREE_CASH_SUPABASE_MODE", "off");

    const response = await POST(
      jsonRequest({
        message: "Can I spend $12?",
        history: Array.from({ length: 9 }, (_, index) => ({
          role: index % 2 === 0 ? "user" : "assistant",
          content: `message ${index}`,
        })),
      }),
    );

    expect(response.status).toBe(400);
  });
});

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/agent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
