import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgentInput, __agentInputTestHooks } from "@/components/AgentInput";

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

  it("leaves room around the focused composer input so its outline is not clipped", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const dockCss = css.slice(css.indexOf(".pip-composer-dock {"), css.indexOf(".pip-composer-dock::before"));
    const paddingRight = dockCss.match(/padding-right:\s*([\d.]+)rem;/);
    const paddingBottom = dockCss.match(/padding-bottom:\s*([\d.]+)rem;/);
    const paddingLeft = dockCss.match(/padding-left:\s*([\d.]+)rem;/);
    const paddingTop = dockCss.match(/padding-top:\s*([\d.]+)rem;/);

    expect(dockCss).toContain("overflow: visible;");
    expect(Number(paddingTop?.[1])).toBeGreaterThanOrEqual(0.75);
    expect(Number(paddingRight?.[1])).toBeGreaterThanOrEqual(0.5);
    expect(Number(paddingBottom?.[1])).toBeGreaterThanOrEqual(0.375);
    expect(Number(paddingLeft?.[1])).toBeGreaterThanOrEqual(0.5);
  });

  it("keeps the composer submit button at a tappable 44px target", () => {
    const markup = renderToStaticMarkup(<AgentInput onSubmit={() => undefined} />);
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const inputCss = css.slice(css.indexOf(".pip-composer-input {"), css.indexOf(".pip-composer-input:focus"));
    const submitCss = css.slice(css.indexOf(".pip-composer-submit {"), css.indexOf(".pip-composer-submit:hover"));
    const inputPadding = inputCss.match(/padding:\s*[\d.]+rem\s+([\d.]+)rem\s+[\d.]+rem\s+[\d.]+rem;/);
    const rightOffset = submitCss.match(/right:\s*([\d.]+)rem;/);
    const width = submitCss.match(/width:\s*([\d.]+)rem;/);
    const height = submitCss.match(/height:\s*([\d.]+)rem;/);

    expect(markup).toContain("h-11 w-11");
    expect(markup).not.toContain("max-[380px]:h-10");
    expect(Number(width?.[1])).toBeGreaterThanOrEqual(2.75);
    expect(Number(height?.[1])).toBeGreaterThanOrEqual(2.75);
    expect(Number(inputPadding?.[1])).toBeGreaterThanOrEqual(Number(width?.[1]) + Number(rightOffset?.[1]) + 0.5);
  });
});

function matchMediaFor(matches: string[]) {
  return (query: string) => ({
    matches: matches.includes(query),
  });
}
