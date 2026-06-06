import { afterEach, describe, expect, it, vi } from "vitest";
import {
  storePlaidCredential,
  storePlaidTransactionCursor,
} from "@/lib/providers/plaid/credential-store";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Plaid credential store", () => {
  it("stores Plaid access tokens encrypted with minimal private metadata", async () => {
    vi.stubEnv("FREE_CASH_PROVIDER_TOKEN_KEY_BASE64", Buffer.alloc(32, 7).toString("base64"));
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
        plaid_item_id: "item-1",
        certificate_ref: null,
        metadata: {
          institutionName: "Northstar Bank",
          environment: "sandbox",
        },
      }),
    ]);
    expect(supabase.upserts[0]).not.toHaveProperty("refresh_token_ciphertext");
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
});

function createPrivateCredentialClient(
  input: { existingMetadata?: Record<string, unknown> } = {},
) {
  const upserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];

  const query = {
    upsert(row: Record<string, unknown>) {
      upserts.push(row);
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
