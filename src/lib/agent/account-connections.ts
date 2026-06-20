import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentCard } from "@/lib/agent/card-types";
import {
  loadConnectedAccountsForUser,
  type ConnectedAccountsResult,
} from "@/lib/data/financial-repository";
import type { Database } from "@/lib/supabase/database.types";
import type { FinancialSnapshot } from "@/lib/types";

export type InstitutionResolution =
  | {
      needsSelection?: false;
      institutionId: string;
    }
  | {
      needsSelection: true;
      status: string;
      message: string;
      accounts: ConnectedAccountsResult;
    };

export type AccountResolution =
  | {
      needsSelection?: false;
      accountId: string;
    }
  | {
      needsSelection: true;
      status: string;
      message: string;
      accounts: ConnectedAccountsResult;
    };

export function createLocalDevConnectedAccounts(snapshot: FinancialSnapshot): ConnectedAccountsResult {
  const accountsByInstitutionName = new Map<string, FinancialSnapshot["accounts"]>();

  for (const account of snapshot.accounts) {
    const accounts = accountsByInstitutionName.get(account.institutionName) ?? [];
    accounts.push(account);
    accountsByInstitutionName.set(account.institutionName, accounts);
  }

  return {
    institutions: [...accountsByInstitutionName.entries()].map(([institutionName, accounts], index) => ({
      institutionId: `local-dev-${index + 1}`,
      institutionName,
      provider: "mock",
      status: "mocked",
      lastSuccessfulSyncAt: null,
      needsRepair: false,
      accounts: accounts.map((account) => ({
        accountId: account.id,
        name: account.name,
        kind: account.kind,
        ...(account.lastFour ? { lastFour: account.lastFour } : {}),
        includedInPipCash: account.includedInPipCash ?? !account.isProtectedSavings,
        isProtectedSavings: Boolean(account.isProtectedSavings),
        active: account.active ?? true,
        roleLabel: getLocalDevAccountRoleLabel(account),
      })),
    })),
  };
}

export function buildAccountConnectionsCard(result: ConnectedAccountsResult): AgentCard {
  return {
    type: "account_connections",
    title: "Account connections",
    institutions: result.institutions.map((institution, index) => ({
      institutionId: institution.institutionId,
      institutionName: institution.institutionName,
      provider: institution.provider,
      status: institution.status,
      lastSuccessfulSyncAt: institution.lastSuccessfulSyncAt,
      accounts: institution.accounts,
      actions: buildAccountConnectionActions(institution, index),
    })),
  };
}

export async function resolveInstitutionTarget(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    institutionId?: string;
    institutionName?: string;
    provider?: ConnectedAccountsResult["institutions"][number]["provider"];
    allowSingleDefault?: boolean;
  },
): Promise<InstitutionResolution> {
  const accounts = await loadConnectedAccountsForUser(supabase, input.userId);
  const institutions = accounts.institutions.filter((institution) =>
    input.provider ? institution.provider === input.provider : true,
  );

  if (input.institutionId) {
    const institution = institutions.find((candidate) => candidate.institutionId === input.institutionId);

    if (institution) {
      return {
        institutionId: institution.institutionId,
      };
    }
  }

  const target = normalizeTarget(input.institutionName);

  if (target) {
    const matches = institutions.filter((institution) =>
      normalizeTarget(institution.institutionName).includes(target),
    );

    if (matches.length === 1) {
      return {
        institutionId: matches[0].institutionId,
      };
    }

    return {
      needsSelection: true,
      status: matches.length > 1 ? "ambiguous_institution" : "institution_not_found",
      message: matches.length > 1
        ? "More than one institution matched that name."
        : "I could not find that institution.",
      accounts,
    };
  }

  if (input.allowSingleDefault && institutions.length === 1) {
    return {
      institutionId: institutions[0].institutionId,
    };
  }

  return {
    needsSelection: true,
    status: "institution_choice_required",
    message: "Choose which institution to use.",
    accounts,
  };
}

export async function resolveAccountTarget(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    accountId?: string;
    accountName?: string;
  },
): Promise<AccountResolution> {
  const accounts = await loadConnectedAccountsForUser(supabase, input.userId);
  const accountList = accounts.institutions.flatMap((institution) =>
    institution.accounts.map((account) => ({
      ...account,
      institutionName: institution.institutionName,
    })),
  );

  if (input.accountId) {
    const account = accountList.find((candidate) => candidate.accountId === input.accountId);

    if (account) {
      return {
        accountId: account.accountId,
      };
    }
  }

  const target = normalizeTarget(input.accountName);

  if (target) {
    const matches = accountList.filter((account) => {
      const accountName = normalizeTarget(account.name);
      const institutionName = normalizeTarget(account.institutionName);

      return accountName.includes(target) || `${institutionName} ${accountName}`.includes(target);
    });

    if (matches.length === 1) {
      return {
        accountId: matches[0].accountId,
      };
    }

    return {
      needsSelection: true,
      status: matches.length > 1 ? "ambiguous_account" : "account_not_found",
      message: matches.length > 1
        ? "More than one account matched that name."
        : "I could not find that account.",
      accounts,
    };
  }

  return {
    needsSelection: true,
    status: "account_choice_required",
    message: "Choose which account to use.",
    accounts,
  };
}

function buildAccountConnectionActions(
  institution: ConnectedAccountsResult["institutions"][number],
  index: number,
): Extract<AgentCard, { type: "account_connections" }>["institutions"][number]["actions"] {
  const actions: Extract<AgentCard, { type: "account_connections" }>["institutions"][number]["actions"] = [];

  if (index === 0) {
    actions.push({
      id: "add-account",
      label: "Add account",
      prompt: "Add account",
      style: "primary",
    });
  }

  if (institution.needsRepair) {
    actions.push({
      id: `repair-${institution.institutionId}`,
      label: "Reconnect",
      prompt: `Reconnect ${institution.institutionName}`,
      style: "primary",
    });
  }

  if (institution.provider === "plaid") {
    actions.push({
      id: `change-${institution.institutionId}`,
      label: "Change accounts",
      prompt: `Change ${institution.institutionName} accounts`,
      style: "secondary",
    });
  }

  actions.push({
    id: `remove-${institution.institutionId}`,
    label: "Remove",
    prompt: `Remove ${institution.institutionName}`,
    style: "danger",
  });

  return actions;
}

function getLocalDevAccountRoleLabel(account: FinancialSnapshot["accounts"][number]): string {
  if (account.isProtectedSavings) {
    return "Monthly Savings";
  }

  if (account.kind === "credit_card") {
    return "Credit card";
  }

  return "Spendable Cash";
}

function normalizeTarget(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
