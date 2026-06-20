import { describe, expect, it, vi } from "vitest";
import {
  getAgentProductEventNames,
  recordProductEvent,
  recordProductEventSafely,
} from "@/lib/data/product-events";
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
          todayRemainingCents: -700,
          todayOverageCents: 700,
          afterTodayCents: 4300,
          monthlyAverageAfterCents: -700,
        }),
        -700,
        { isFollowUp: true },
      ),
    ).toEqual([
      "agent_question_asked",
      "agent_follow_up_asked",
      "purchase_simulation_requested",
      "negative_pip_cash_follow_up",
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

  it("tracks guidance context, cards, and follow-ups", () => {
    expect(
      getAgentProductEventNames(
        {
          ...createAgentResponse({
            type: "guidance_card",
            title: "My read",
            stance: "watch",
            summary: "Recent spending is running hot.",
            rows: [
              {
                label: "Main pressure",
                detail: "Recent spending is ahead of pace.",
                tone: "warning",
                evidenceIds: ["recent-spending-hot"],
              },
            ],
          }),
          usedTools: ["get_financial_guidance_context"],
          responseMode: "guidance",
          audit: {
            toolNames: ["get_financial_guidance_context"],
            usedModel: true,
            guidance: {
              validationOutcome: "shown",
              guidanceSource: "model_draft",
              metricVersion: "v2",
              state: "overspending",
              confidence: "high",
              stance: "watch",
              evidenceIds: ["recent-spending-hot"],
            },
          },
        },
        4300,
        { isFollowUp: true },
      ),
    ).toEqual([
      "agent_question_asked",
      "agent_follow_up_asked",
      "financial_guidance_requested",
      "financial_guidance_context_built",
      "financial_guidance_followup",
      "financial_guidance_card_drafted",
      "financial_guidance_card_shown",
    ]);
  });

  it("tracks rejected guidance cards separately", () => {
    expect(
      getAgentProductEventNames(
        {
          ...createAgentResponse({
            type: "connect_account",
            title: "Connect or repair data",
            detail: "Connect data first.",
          }),
          cards: [],
          usedTools: ["get_financial_guidance_context"],
          responseMode: "guidance",
          audit: {
            toolNames: ["get_financial_guidance_context"],
            usedModel: true,
            guidance: {
              validationOutcome: "rejected",
              guidanceSource: "none",
              metricVersion: "v2",
              rejectionReason: "unknown evidence id",
            },
          },
        },
        4300,
      ),
    ).toEqual([
      "agent_question_asked",
      "financial_guidance_requested",
      "financial_guidance_context_built",
      "financial_guidance_card_rejected",
    ]);
  });

  it("does not count deterministic fallback guidance cards as model-authored drafts", () => {
    expect(
      getAgentProductEventNames(
        {
          ...createAgentResponse({
            type: "guidance_card",
            title: "My read",
            stance: "watch",
            summary: "Fallback guidance based on deterministic evidence.",
            rows: [
              {
                label: "Today",
                detail: "The read is based on today's Spendable Cash evidence.",
                tone: "neutral",
                evidenceIds: ["spendable-today"],
              },
            ],
          }),
          usedTools: ["get_financial_guidance_context"],
          responseMode: "guidance",
          audit: {
            toolNames: ["get_financial_guidance_context"],
            usedModel: true,
            guidance: {
              validationOutcome: "shown",
              guidanceSource: "deterministic_fallback",
              metricVersion: "v2",
            },
          },
        },
        4300,
      ),
    ).toEqual([
      "agent_question_asked",
      "financial_guidance_requested",
      "financial_guidance_context_built",
      "financial_guidance_card_shown",
    ]);
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
      await recordProductEventSafely(supabase, "user-1", "pip_cash_viewed", {});

      expect(warn).toHaveBeenCalledWith(
        "Product event logging failed.",
        "Insert failed with [redacted] access_token=[redacted] private_key=[redacted]",
      );
      expect(warn.mock.calls[0]?.[1]).not.toBe(error);
    } finally {
      warn.mockRestore();
    }
  });

  it("logs sanitized product-event failures from message-shaped data errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = {
      message: "Insert failed with public_token=public-secret Authorization: Bearer abc123",
    };
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
      await recordProductEventSafely(supabase, "user-1", "pip_cash_viewed", {});

      expect(warn).toHaveBeenCalledWith(
        "Product event logging failed.",
        "Insert failed with public_token=[redacted] Authorization=[redacted]",
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("redacts secret-shaped strings before storing event properties", async () => {
    const inserts: unknown[] = [];
    const supabase = {
      from(tableName: string) {
        expect(tableName).toBe("product_events");

        return {
          insert(row: unknown) {
            inserts.push(row);

            return Promise.resolve({
              error: null,
            });
          },
        };
      },
    } as unknown as Parameters<typeof recordProductEvent>[0];

    await recordProductEvent(supabase, "user-1", "plaid_link_failed", {
      errorMessage: "Plaid failed access_token=provider-secret sk-test-secret",
      nested: {
        authorization: "Bearer abc123",
      },
      events: [
        {
          public_token: "public-token",
        },
      ],
    });

    expect(inserts[0]).toEqual({
      user_id: "user-1",
      event_name: "plaid_link_failed",
      properties: {
        errorMessage: "Plaid failed access_token=[redacted] [redacted]",
        nested: {
          authorization: "[redacted]",
        },
        events: [
          {
            public_token: "[redacted]",
          },
        ],
      },
    });
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
