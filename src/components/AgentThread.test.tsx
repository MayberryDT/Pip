import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentThread } from "@/components/AgentThread";

describe("AgentThread", () => {
  it("shows Pip beside the thinking state before the response arrives", () => {
    const markup = renderToStaticMarkup(
      <AgentThread
        thread={[
          {
            id: "pending",
            userText: "Why this number?",
            isPending: true,
          },
        ]}
      />,
    );

    expect(markup).toContain('data-testid="agent-thinking"');
    expect(markup).toContain('aria-label="Pip"');
    expect(markup).toContain("/brand/pip-character/v001/avatar/thinking.png");
    expect(markup).toContain('data-expression="thinking"');
    expect(markup).toContain("Thinking");
  });

  it("uses a branded safe fallback for failed turns", () => {
    const markup = renderToStaticMarkup(
      <AgentThread
        thread={[
          {
            id: "failed",
            userText: "Why this number?",
          },
        ]}
      />,
    );
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(markup).toContain('aria-label="Pip"');
    expect(markup).toContain("/brand/pip-character/v001/avatar/concerned.png");
    expect(markup).toContain('data-expression="concerned"');
    expect(visibleText).toContain("I couldn’t answer that cleanly. Try again.");
    expect(visibleText).not.toContain("AI request failed");
  });

  it("keeps the assistant response visible when a client action fails", () => {
    const markup = renderToStaticMarkup(
      <AgentThread
        thread={[
          {
            id: "action-failed",
            userText: "Connect my data",
            response: {
              message: "I’ll open Plaid now.",
              cards: [],
              promptChips: [],
              usedTools: ["start_plaid_link"],
              responseMode: "update_context",
              audit: {
                toolNames: ["start_plaid_link"],
                usedModel: true,
              },
            },
            errorText: "Plaid failed to load.",
          },
        ]}
      />,
    );
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(visibleText).toContain("I’ll open Plaid now.");
    expect(visibleText).toContain("Plaid failed to load.");
    expect(markup).toContain("/brand/pip-character/v001/avatar/happy.png");
    expect(markup).toContain('data-expression="happy"');
  });

  it("applies long-token wrapping to chat bubbles and assistant text", () => {
    const longToken = "GENERAL_SERVICES_OTHER_GENERAL_SERVICES".repeat(4);
    const markup = renderToStaticMarkup(
      <AgentThread
        thread={[
          {
            id: "long-token",
            userText: longToken,
            response: {
              message: longToken,
              cards: [],
              promptChips: [],
              usedTools: [],
              responseMode: "answer",
              audit: {
                toolNames: [],
                usedModel: false,
              },
            },
            errorText: longToken,
          },
        ]}
      />,
    );

    expect(markup).toContain(longToken);
    expect(countOccurrences(markup, "pip-wrap-anywhere")).toBeGreaterThanOrEqual(3);
  });
});

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}
