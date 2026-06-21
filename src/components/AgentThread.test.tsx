import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  __agentThreadTestHooks,
  AgentThread,
  ReportResponseControl,
} from "@/components/AgentThread";

describe("AgentThread", () => {
  it("keeps the live region mounted before the first response arrives", () => {
    const markup = renderToStaticMarkup(<AgentThread thread={[]} />);

    expect(markup).toContain('data-testid="agent-thread"');
    expect(markup).toContain("role=\"log\"");
    expect(markup).toContain("aria-live=\"polite\"");
    expect(markup).toContain("aria-relevant=\"additions text\"");
  });

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

  it("shows a subtle AI response report control when reporting is enabled", () => {
    const markup = renderToStaticMarkup(
      <AgentThread
        onReportResponse={async () => undefined}
        thread={[
          {
            id: "reported",
            userText: "Can I spend this?",
            response: {
              message: "You can spend it.",
              cards: [],
              promptChips: [],
              usedTools: [],
              responseMode: "chat_only",
              audit: {
                toolNames: [],
                usedModel: true,
              },
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("Report");
    expect(markup).not.toContain("Report response");
    expect(markup).toContain("aria-hidden=\"true\"");
    expect(markup).toContain("role=\"log\"");
    expect(markup).toContain("aria-live=\"polite\"");
    expect(markup).toContain("aria-relevant=\"additions text\"");
  });

  it("uses chips rather than a select menu for report reasons", () => {
    const markup = renderToStaticMarkup(
      <ReportResponseControl
        initialOpen
        messageId="reported"
        responseExcerpt="You can spend it."
        onReportResponse={async () => undefined}
      />,
    );

    expect(markup).not.toMatch(/<select\b|<option\b/);
    expect(markup).toContain("Inaccurate");
    expect(markup).toContain("Unsafe");
    expect(markup).toContain("Privacy");
    expect(markup).toContain("Confusing");
    expect(markup).toContain("Other");
    expect(markup).toContain("Send");
    expect(markup).toContain("Cancel");
    expect(markup).toContain("min-h-11");
  });

  it("uses non-smooth thread scrolling when reduced motion is requested", () => {
    expect(
      __agentThreadTestHooks.getThreadScrollBehavior(
        matchMediaFor(["(prefers-reduced-motion: reduce)"]),
      ),
    ).toBe("auto");
    expect(__agentThreadTestHooks.getThreadScrollBehavior(matchMediaFor([]))).toBe("smooth");
  });

  it("keeps report error text specific when the API returns a safe message", () => {
    expect(__agentThreadTestHooks.getReportErrorText(new Error("Reporting is unavailable in this build."))).toBe(
      "Reporting is unavailable in this build.",
    );
    expect(__agentThreadTestHooks.getReportErrorText(undefined)).toBe("I couldn’t send that report.");
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
              responseMode: "chat_only",
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

function matchMediaFor(matches: string[]) {
  return (query: string) => ({
    matches: matches.includes(query),
  });
}
