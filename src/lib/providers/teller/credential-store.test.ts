import { afterEach, describe, expect, it, vi } from "vitest";
import { storeTellerCredential } from "@/lib/providers/teller/credential-store";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Teller credential store", () => {
  it("stores Teller access tokens encrypted with a certificate reference instead of raw certificate material", async () => {
    vi.stubEnv("PIP_PROVIDER_TOKEN_KEY_BASE64", Buffer.alloc(32, 9).toString("base64"));
    const supabase = createPrivateCredentialClient();

    await storeTellerCredential({
      supabase: supabase.client,
      institutionId: "institution-1",
      userId: "user-1",
      enrollmentId: "enrollment-1",
      accessToken: "teller-token-secret",
      institutionName: "Northstar Bank",
      environment: "sandbox",
    });

    expect(supabase.upserts).toEqual([
      expect.objectContaining({
        institution_id: "institution-1",
        user_id: "user-1",
        provider: "teller",
        teller_enrollment_id: "enrollment-1",
        plaid_item_id: null,
        refresh_token_ciphertext: null,
        certificate_ref: "env:TELLER_CERTIFICATE_PEM",
        metadata: {
          institutionName: "Northstar Bank",
          environment: "sandbox",
        },
      }),
    ]);
    expect(supabase.upsertOptions).toEqual([{ onConflict: "institution_id" }]);
    expect(supabase.upserts[0]?.access_token_ciphertext).not.toContain("teller-token-secret");
    expect(JSON.stringify(supabase.upserts[0])).not.toContain("teller-token-secret");
    expect(JSON.stringify(supabase.upserts[0])).not.toContain("BEGIN CERTIFICATE");
    expect(JSON.stringify(supabase.upserts[0])).not.toContain("PRIVATE KEY");
  });
});

function createPrivateCredentialClient() {
  const upserts: Record<string, unknown>[] = [];
  const upsertOptions: Record<string, unknown>[] = [];
  const query = {
    upsert(row: Record<string, unknown>, options?: Record<string, unknown>) {
      upserts.push(row);
      if (options) {
        upsertOptions.push(options);
      }
      return Promise.resolve({ error: null });
    },
  };

  return {
    upserts,
    upsertOptions,
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
    } as unknown as Parameters<typeof storeTellerCredential>[0]["supabase"],
  };
}
