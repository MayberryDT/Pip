import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PipAvatar } from "@/components/brand/PipAvatar";

describe("PipAvatar", () => {
  it("uses PipCharacter so expression affects the selected image", () => {
    const markup = renderToStaticMarkup(<PipAvatar expression="happy" />);

    expect(markup).toContain("/brand/pip-character/v001/avatar/happy.png");
    expect(markup).toContain('data-expression="happy"');
  });

  it("maps unsupported expressions to the normal avatar", () => {
    const markup = renderToStaticMarkup(<PipAvatar expression="reassuring" />);

    expect(markup).toContain("/brand/pip-character/v001/avatar/normal.png");
    expect(markup).toContain('data-expression="normal"');
  });
});
