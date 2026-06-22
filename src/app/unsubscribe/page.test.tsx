import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import UnsubscribePage from "@/app/unsubscribe/page";

describe("/unsubscribe page", () => {
  it("renders a no-index email preference page", async () => {
    const page = await UnsubscribePage({
      searchParams: Promise.resolve({ token: "abc" }),
    });

    const html = renderToStaticMarkup(page);

    expect(html).toContain("Unsubscribe from Pip updates");
    expect(html).toContain("future product update emails");
    expect(html).toContain("Unsubscribe");
  });
});
