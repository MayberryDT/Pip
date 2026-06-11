import { describe, expect, it } from "vitest";
import { GET as canonicalGet } from "@/app/api/pip-cash/route";
import { GET as compatibilityGet } from "@/app/api/free-cash/route";

describe("GET /api/free-cash compatibility route", () => {
  it("delegates to the canonical PIP cash route during the transition", () => {
    expect(compatibilityGet).toBe(canonicalGet);
  });
});
