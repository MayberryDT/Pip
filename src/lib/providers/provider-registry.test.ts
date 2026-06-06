import { describe, expect, it } from "vitest";
import { MockProvider } from "@/lib/providers/MockProvider";
import { PlaidProvider } from "@/lib/providers/plaid/PlaidProvider";
import { TellerProvider } from "@/lib/providers/teller/TellerProvider";
import { getFinancialDataProvider } from "@/lib/providers/provider-registry";

describe("provider registry", () => {
  it("returns the mock provider for fake-data sync", () => {
    expect(getFinancialDataProvider("mock")).toBeInstanceOf(MockProvider);
  });

  it("returns Teller now that the private-beta provider boundary exists", () => {
    expect(getFinancialDataProvider("teller")).toBeInstanceOf(TellerProvider);
  });

  it("returns Plaid now that the app has moved to Plaid-first provider sync", () => {
    expect(getFinancialDataProvider("plaid")).toBeInstanceOf(PlaidProvider);
  });
});
