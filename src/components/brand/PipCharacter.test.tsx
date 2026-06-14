import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  getPipCharacterAssetSources,
  PipCharacter,
} from "@/components/brand/PipCharacter";

describe("PipCharacter", () => {
  it("selects the requested generated-image asset", () => {
    const markup = renderToStaticMarkup(
      <PipCharacter size="avatar" expression="thinking" action="thinking" />,
    );

    expect(markup).toContain("/brand/pip-character/v001/avatar/thinking.png");
    expect(markup).toContain('data-expression="thinking"');
    expect(markup).toContain('data-action="thinking"');
  });

  it("falls back gracefully for unsupported size and expression pairs", () => {
    expect(getPipCharacterAssetSources("medium", "happy")).toEqual([
      "/brand/pip-character/v001/avatar/normal.png",
      "/brand/pip-profile-clean.png",
    ]);

    const markup = renderToStaticMarkup(
      <PipCharacter size="medium" expression="happy" />,
    );

    expect(markup).toContain("/brand/pip-character/v001/avatar/normal.png");
  });
});
