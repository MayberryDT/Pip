import type { FinancialProviderName } from "@/lib/providers/FinancialDataProvider";

export class ProviderUnavailableError extends Error {
  provider: FinancialProviderName;
  code = "provider-unavailable";

  constructor(provider: FinancialProviderName, message = `${provider} provider is not implemented yet.`) {
    super(message);
    this.name = "ProviderUnavailableError";
    this.provider = provider;
  }
}

export type ProviderConnectionStatus = "stale" | "failed" | "revoked";

export class ProviderSyncError extends Error {
  provider: FinancialProviderName;
  code: string;
  status: ProviderConnectionStatus;
  institutionId?: string;
  institutionName?: string;
  repairRequired: boolean;

  constructor(input: {
    provider: FinancialProviderName;
    code: string;
    message: string;
    status?: ProviderConnectionStatus;
    institutionId?: string;
    institutionName?: string;
    repairRequired?: boolean;
  }) {
    super(input.message);
    this.name = "ProviderSyncError";
    this.provider = input.provider;
    this.code = input.code;
    this.status = input.status ?? "failed";
    this.institutionId = input.institutionId;
    this.institutionName = input.institutionName;
    this.repairRequired = input.repairRequired ?? false;
  }
}
