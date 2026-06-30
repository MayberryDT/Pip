import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PipIntroScene } from "@/components/onboarding/PipIntroScene";

describe("PipIntroScene", () => {
  it("uses the generated-image PipCharacter onboarding asset", () => {
    const markup = renderToStaticMarkup(
      <PipIntroScene title="Hi, I am Pip." priority />,
    );

    expect(markup).toContain("/brand/pip-character/v001/medium/onboarding-wave.png");
    expect(markup).toContain('data-expression="onboarding-wave"');
    expect(markup).toContain('data-action="wave"');
    expect(markup).not.toContain("/brand/pip-waving.png");
  });
});
