import { describe, expect, it, vi } from "vitest";
import { __agentInputTestHooks } from "@/components/AgentInput";

describe("AgentInput", () => {
  it("resizes and blurs after mobile submit without forcing focus", () => {
    const blur = vi.fn();
    const focus = vi.fn();
    const input = {
      blur,
      disabled: false,
      focus,
      scrollHeight: 320,
      style: {
        height: "",
        overflowY: "",
      },
    };

    __agentInputTestHooks.settleComposerAfterSubmit(input, {
      matchMedia: matchMediaFor(["(pointer: coarse)"]),
      schedule: (callback) => callback(),
    });

    expect(input.style.height).toBe("216px");
    expect(input.style.overflowY).toBe("auto");
    expect(blur).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  });

  it("does not blur fine-pointer submits while resizing the composer", () => {
    const blur = vi.fn();
    const input = {
      blur,
      disabled: false,
      scrollHeight: 72,
      style: {
        height: "",
        overflowY: "",
      },
    };

    __agentInputTestHooks.settleComposerAfterSubmit(input, {
      matchMedia: matchMediaFor([]),
      schedule: (callback) => callback(),
    });

    expect(input.style.height).toBe("72px");
    expect(input.style.overflowY).toBe("hidden");
    expect(blur).not.toHaveBeenCalled();
  });

  it("turns visual viewport changes into keyboard-safe shell variables", () => {
    expect(
      __agentInputTestHooks.getComposerViewportVars({
        innerHeight: 844,
        viewport: {
          height: 544,
          offsetTop: 0,
        },
      }),
    ).toEqual({
      "--pip-chat-shell-height": "844px",
      "--pip-chat-shell-top": "0px",
      "--pip-keyboard-inset": "300px",
    });

    expect(
      __agentInputTestHooks.getComposerViewportVars({
        innerHeight: 844,
        viewport: {
          height: 780,
          offsetTop: 0,
        },
      }),
    ).toEqual({
      "--pip-chat-shell-height": "780px",
      "--pip-chat-shell-top": "0px",
      "--pip-keyboard-inset": "0px",
    });
  });

  it("respects reduced motion when focusing the composer back into view", () => {
    expect(
      __agentInputTestHooks.getComposerScrollBehavior(
        matchMediaFor(["(prefers-reduced-motion: reduce)"]),
      ),
    ).toBe("auto");
    expect(__agentInputTestHooks.getComposerScrollBehavior(matchMediaFor([]))).toBe("smooth");
  });
});

function matchMediaFor(matches: string[]) {
  return (query: string) => ({
    matches: matches.includes(query),
  });
}
