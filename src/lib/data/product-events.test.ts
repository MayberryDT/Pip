import { describe, expect, it, vi } from "vitest";
import { getAgentProductEventNames, recordProductEventSafely } from "@/lib/data/product-events";
import type { AgentResponse } from "@/lib/agent/card-types";

describe("agent product event derivation", () => {
  it("tracks purchase simulations and negative follow-up behavior", () => {
    expect(
      getAgentProductEventNames(
        createAgentResponse({
          type: "purchase_simulation",
          title: "Spend test",
          amountCents: 5000,
          beforeCents: 4300,
          afterTodayCents: -700,
          monthlyAverageAfterCents: -700,
        }),
        -700,
        { isFollowUp: true },
      ),
    ).toEqual([
      "agent_question_asked",
      "agent_follow_up_asked",
      "purchase_simulation_requested",
      "negative_free_cash_follow_up",
    ]);
  });

  it("tracks true balance reveals without treating them as purchase simulations", () => {
    expect(
      getAgentProductEventNames(
        createAgentResponse({
          type: "true_balances",
          title: "True balances",
          balances: [],
        }),
        4300,
      ),
    ).toEqual(["agent_question_asked", "true_balances_revealed"]);
  });

  it("tracks missing-card nudges for beta product proof", () => {
    expect(
      getAgentProductEventNames(
        createAgentResponse({
          type: "missing_card_nudge",
          title: "Possible missing card",
          detail: "A payment to Capital One appears in checking.",
          issuerName: "Capital One",
        }),
        4300,
      ),
    ).toEqual(["agent_question_asked", "missing_card_nudge_shown"]);
  });

  it("logs sanitized product-event failures without exposing secret-shaped values", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = new Error(
      "Insert failed with sk-proj-secret access_token=provider-secret private_key=key123",
    );
    const supabase = {
      from() {
        return {
          insert() {
            return Promise.resolve({
              error,
            });
          },
        };
      },
    } as unknown as Parameters<typeof recordProductEventSafely>[0];

    try {
      await recordProductEventSafely(supabase, "user-1", "free_cash_viewed", {});

      expect(warn).toHaveBeenCalledWith(
        "Product event logging failed.",
        "Insert failed with [redacted] access_token=[redacted] private_key=[redacted]",
      );
      expect(warn.mock.calls[0]?.[1]).not.toBe(error);
    } finally {
      warn.mockRestore();
    }
  });
});

function createAgentResponse(card: AgentResponse["cards"][number]): AgentResponse {
  return {
    message: "Here you go.",
    cards: [card],
    promptChips: [],
    usedTools: [],
    responseMode: "show_card",
    audit: {
      toolNames: [],
      usedModel: false,
    },
  };
}
