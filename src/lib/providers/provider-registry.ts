import type {
  FinancialDataProvider,
  FinancialProviderName,
} from "@/lib/providers/FinancialDataProvider";
import { MockProvider } from "@/lib/providers/MockProvider";
import { PlaidProvider } from "@/lib/providers/plaid/PlaidProvider";
import { TellerProvider } from "@/lib/providers/teller/TellerProvider";
import { ProviderUnavailableError } from "@/lib/providers/provider-errors";

export { ProviderUnavailableError };

export function getFinancialDataProvider(provider: FinancialProviderName): FinancialDataProvider {
  if (provider === "mock") {
    return new MockProvider();
  }

  if (provider === "teller") {
    return new TellerProvider();
  }

  if (provider === "plaid") {
    return new PlaidProvider();
  }

  throw new ProviderUnavailableError(provider);
}
