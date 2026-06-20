import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAccountConnectionsCard,
  createLocalDevConnectedAccounts,
  resolveAccountTarget,
  resolveInstitutionTarget,
} from "@/lib/agent/account-connections";
import { fakeSnapshot } from "@/lib/fake-data";
import type { ConnectedAccountsResult } from "@/lib/data/financial-repository";

const repositoryMocks = vi.hoisted(() => ({
  loadConnectedAccountsForUser: vi.fn(),
}));

vi.mock("@/lib/data/financial-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/financial-repository")>();

  return {
    ...actual,
    loadConnectedAccountsForUser: repositoryMocks.loadConnectedAccountsForUser,
  };
});

describe("agent account connections", () => {
  beforeEach(() => {
    repositoryMocks.loadConnectedAccountsForUser.mockReset();
  });

  it("builds account connection cards with stable account actions", () => {
    const card = buildAccountConnectionsCard(createConnectedAccounts());

    expect(card).toMatchObject({
      type: "account_connections",
      title: "Account connections",
      institutions: [
        {
          institutionId: "institution-1",
          actions: [
            { id: "add-account", label: "Add account", style: "primary" },
            { id: "change-institution-1", label: "Change accounts", style: "secondary" },
            { id: "remove-institution-1", label: "Remove", style: "danger" },
          ],
        },
        {
          institutionId: "institution-2",
          actions: [
            { id: "repair-institution-2", label: "Reconnect", style: "primary" },
            { id: "remove-institution-2", label: "Remove", style: "danger" },
          ],
        },
      ],
    });
  });

  it("groups local development snapshot accounts into account connections", () => {
    const connections = createLocalDevConnectedAccounts(fakeSnapshot);

    expect(connections.institutions.length).toBeGreaterThan(0);
    expect(connections.institutions[0]).toMatchObject({
      institutionId: "local-dev-1",
      provider: "mock",
      status: "mocked",
      needsRepair: false,
    });
    expect(connections.institutions.flatMap((institution) => institution.accounts)).toContainEqual(
      expect.objectContaining({
        accountId: expect.any(String),
        roleLabel: expect.stringMatching(/Spendable Cash|Monthly Savings|Credit card/),
      }),
    );
  });

  it("resolves institutions by normalized name and provider", async () => {
    repositoryMocks.loadConnectedAccountsForUser.mockResolvedValue(createConnectedAccounts());

    await expect(resolveInstitutionTarget({} as never, {
      userId: "user-1",
      institutionName: "Northstar - Bank",
      provider: "plaid",
    })).resolves.toEqual({
      institutionId: "institution-1",
    });
  });

  it("returns an account selection payload for ambiguous institution names", async () => {
    const accounts = createConnectedAccounts({ includeSecondNorthstar: true });
    repositoryMocks.loadConnectedAccountsForUser.mockResolvedValue(accounts);

    await expect(resolveInstitutionTarget({} as never, {
      userId: "user-1",
      institutionName: "Northstar",
    })).resolves.toEqual({
      needsSelection: true,
      status: "ambiguous_institution",
      message: "More than one institution matched that name.",
      accounts,
    });
  });

  it("resolves accounts by institution-qualified normalized name", async () => {
    repositoryMocks.loadConnectedAccountsForUser.mockResolvedValue(createConnectedAccounts());

    await expect(resolveAccountTarget({} as never, {
      userId: "user-1",
      accountName: "Northstar Bank - Everyday   Checking",
    })).resolves.toEqual({
      accountId: "account-checking",
    });
  });

  it("returns account selection when no account target is supplied", async () => {
    const accounts = createConnectedAccounts();
    repositoryMocks.loadConnectedAccountsForUser.mockResolvedValue(accounts);

    await expect(resolveAccountTarget({} as never, {
      userId: "user-1",
    })).resolves.toEqual({
      needsSelection: true,
      status: "account_choice_required",
      message: "Choose which account to use.",
      accounts,
    });
  });
});

function createConnectedAccounts(options: { includeSecondNorthstar?: boolean } = {}): ConnectedAccountsResult {
  return {
    institutions: [
      {
        institutionId: "institution-1",
        institutionName: "Northstar Bank",
        provider: "plaid",
        status: "connected",
        lastSuccessfulSyncAt: "2026-06-20T00:00:00.000Z",
        needsRepair: false,
        accounts: [
          {
            accountId: "account-checking",
            name: "Everyday Checking",
            kind: "checking",
            lastFour: "1042",
            includedInPipCash: true,
            isProtectedSavings: false,
            active: true,
            roleLabel: "Spendable Cash",
          },
        ],
      },
      {
        institutionId: "institution-2",
        institutionName: "Mesa Credit Union",
        provider: "teller",
        status: "failed",
        lastSuccessfulSyncAt: null,
        needsRepair: true,
        accounts: [
          {
            accountId: "account-savings",
            name: "Protected Savings",
            kind: "savings",
            includedInPipCash: false,
            isProtectedSavings: true,
            active: true,
            roleLabel: "Monthly Savings",
          },
        ],
      },
      ...(options.includeSecondNorthstar
        ? [
            {
              institutionId: "institution-3",
              institutionName: "Northstar Credit",
              provider: "plaid" as const,
              status: "connected" as const,
              lastSuccessfulSyncAt: null,
              needsRepair: false,
              accounts: [],
            },
          ]
        : []),
    ],
  };
}
