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
    expect(markup).toContain("Thinking");
  });
});
