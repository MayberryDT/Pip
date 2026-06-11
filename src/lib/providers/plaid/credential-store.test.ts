import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPlaidCredentialsForUser,
  storePlaidCredential,
  storePlaidTransactionCursor,
} from "@/lib/providers/plaid/credential-store";
import { encryptProviderToken } from "@/lib/providers/teller/token-crypto";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Plaid credential store", () => {
  it("stores Plaid access tokens encrypted with minimal private metadata", async () => {
    vi.stubEnv("PIP_PROVIDER_TOKEN_KEY_BASE64", Buffer.alloc(32, 7).toString("base64"));
    const supabase = createPrivateCredentialClient();

    await storePlaidCredential({
      supabase: supabase.client,
      institutionId: "institution-1",
      userId: "user-1",
      itemId: "item-1",
      accessToken: "access-token-secret",
      institutionName: "Northstar Bank",
      environment: "sandbox",
    });

    expect(supabase.upserts).toEqual([
      expect.objectContaining({
        institution_id: "institution-1",
        user_id: "user-1",
        provider: "plaid",
        teller_enrollment_id: null,
        plaid_item_id: "item-1",
        refresh_token_ciphertext: null,
        certificate_ref: null,
        metadata: {
          institutionName: "Northstar Bank",
          environment: "sandbox",
        },
      }),
    ]);
    expect(supabase.upsertOptions).toEqual([{ onConflict: "institution_id" }]);
    expect(supabase.upserts[0]?.access_token_ciphertext).not.toContain("access-token-secret");
    expect(JSON.stringify(supabase.upserts[0])).not.toContain("access-token-secret");
  });

  it("stores only Plaid transaction cursor metadata after sync", async () => {
    const supabase = createPrivateCredentialClient({
      existingMetadata: {
        institutionName: "Northstar Bank",
        environment: "sandbox",
      },
    });

    await storePlaidTransactionCursor(
      {
        userId: "user-1",
        institutionId: "institution-1",
        transactionCursor: "cursor-123",
      },
      supabase.client,
    );

    expect(supabase.updates).toEqual([
      expect.objectContaining({
        metadata: {
          institutionName: "Northstar Bank",
          environment: "sandbox",
          transactionCursor: "cursor-123",
        },
      }),
    ]);
    expect(JSON.stringify(supabase.updates[0])).not.toContain("access-token");
  });

  it("preserves institution context when a stored Plaid token cannot decrypt", async () => {
    const oldKey = Buffer.alloc(32, 3).toString("base64");
    const newKey = Buffer.alloc(32, 4).toString("base64");
    const ciphertext = encryptProviderToken("access-token-secret", oldKey);
    vi.stubEnv("PIP_PROVIDER_TOKEN_KEY_BASE64", newKey);

    const credentials = await loadPlaidCredentialsForUser(
      "user-1",
      createPrivateCredentialReadClient([
        {
          institution_id: "institution-1",
          user_id: "user-1",
          provider: "plaid",
          teller_enrollment_id: null,
          plaid_item_id: "item-1",
          access_token_ciphertext: ciphertext,
          refresh_token_ciphertext: null,
          certificate_ref: null,
          metadata: {
            institutionName: "Wise (US)",
            environment: "sandbox",
          },
          created_at: "2026-06-05T00:00:00.000Z",
          updated_at: "2026-06-05T00:00:00.000Z",
        },
      ]),
    );

    expect(credentials).toEqual([
      expect.objectContaining({
        institutionId: "institution-1",
        institutionName: "Wise (US)",
        accessToken: "",
        loadError: expect.objectContaining({
          name: "ProviderSyncError",
          provider: "plaid",
          code: "provider-token-decrypt-failed",
          status: "failed",
          institutionId: "institution-1",
          institutionName: "Wise (US)",
          repairRequired: true,
        }),
      }),
    ]);
    expect(JSON.stringify(credentials)).not.toContain("access-token-secret");
  });
});

function createPrivateCredentialClient(
  input: { existingMetadata?: Record<string, unknown> } = {},
) {
  const upserts: Record<string, unknown>[] = [];
  const upsertOptions: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];

  const query = {
    upsert(row: Record<string, unknown>, options?: Record<string, unknown>) {
      upserts.push(row);
      if (options) {
        upsertOptions.push(options);
      }
      return Promise.resolve({ error: null });
    },
    select() {
      return query;
    },
    eq() {
      return query;
    },
    maybeSingle() {
      return Promise.resolve({
        data: {
          metadata: input.existingMetadata ?? {},
        },
        error: null,
      });
    },
    update(row: Record<string, unknown>) {
      updates.push(row);
      return query;
    },
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(resolve({ error: null })).catch(reject);
    },
  };

  return {
    upserts,
    upsertOptions,
    updates,
    client: {
      schema(schemaName: string) {
        expect(schemaName).toBe("private");

        return {
          from(tableName: string) {
            expect(tableName).toBe("provider_credentials");
            return query;
          },
        };
      },
    } as unknown as Parameters<typeof storePlaidCredential>[0]["supabase"],
  };
}

function createPrivateCredentialReadClient(
  rows: Array<{
    institution_id: string;
    user_id: string;
    provider: "plaid";
    teller_enrollment_id: string | null;
    plaid_item_id: string | null;
    access_token_ciphertext: string | null;
    refresh_token_ciphertext: string | null;
    certificate_ref: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>,
) {
  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    order() {
      return Promise.resolve({
        data: rows,
        error: null,
      });
    },
  };

  return {
    schema(schemaName: string) {
      expect(schemaName).toBe("private");

      return {
        from(tableName: string) {
          expect(tableName).toBe("provider_credentials");
          return query;
        },
      };
    },
  } as unknown as Parameters<typeof loadPlaidCredentialsForUser>[1];
}
