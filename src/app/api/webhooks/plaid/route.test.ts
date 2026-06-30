import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createPlaidClient: vi.fn(),
  enqueuePipSyncJob: vi.fn(),
  getPipSyncFeatureFlags: vi.fn(),
  loadPlaidCredentialByItemId: vi.fn(),
  recordProductEventSafely: vi.fn(),
  verifyPlaidWebhookRequest: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/providers/plaid/config", () => ({
  createPlaidClient: routeMocks.createPlaidClient,
}));

vi.mock("@/lib/data/sync-jobs", () => ({
  enqueuePipSyncJob: routeMocks.enqueuePipSyncJob,
}));

vi.mock("@/lib/data/feature-flags", () => ({
  getPipSyncFeatureFlags: routeMocks.getPipSyncFeatureFlags,
}));

vi.mock("@/lib/providers/plaid/credential-store", () => ({
  loadPlaidCredentialByItemId: routeMocks.loadPlaidCredentialByItemId,
}));

vi.mock("@/lib/data/product-events", () => ({
  recordProductEventSafely: routeMocks.recordProductEventSafely,
}));

vi.mock("@/lib/providers/plaid/webhook-verification", async () => {
  const actual = await vi.importActual<typeof import("@/lib/providers/plaid/webhook-verification")>(
    "@/lib/providers/plaid/webhook-verification",
  );

  return {
    ...actual,
    verifyPlaidWebhookRequest: routeMocks.verifyPlaidWebhookRequest,
  };
});

import { POST } from "@/app/api/webhooks/plaid/route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/plaid", () => {
  it("verifies and enqueues Plaid transaction sync webhooks", async () => {
    enableSupabaseEnv();
    const supabase = createWebhookSupabaseClient();
    routeMocks.createSupabaseAdminClient.mockReturnValue(supabase.client);
    routeMocks.getPipSyncFeatureFlags.mockReturnValue({
      syncJobsEnabled: true,
      scheduledSyncEnabled: false,
      scheduledSyncBatchSize: 10,
      scheduledSyncMaxJobs: 10,
      scheduledSyncMinIntervalMinutes: 240,
      plaidWebhookVerify: true,
    });
    routeMocks.createPlaidClient.mockReturnValue({ plaid: true });
    routeMocks.verifyPlaidWebhookRequest.mockResolvedValue({
      status: "verified",
      keyId: "key-1",
      bodySha256: "hash",
      issuedAt: 1,
    });
    routeMocks.loadPlaidCredentialByItemId.mockResolvedValue({
      userId: "user-1",
      institutionId: "institution-1",
    });
    routeMocks.enqueuePipSyncJob.mockResolvedValue({
      created: true,
      job: {
        id: "job-1",
      },
    });

    const response = await POST(
      request({
        webhook_type: "TRANSACTIONS",
        webhook_code: "SYNC_UPDATES_AVAILABLE",
        item_id: "item-1",
        environment: "sandbox",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "enqueued",
      syncJobId: "job-1",
      created: true,
    });
    expect(routeMocks.verifyPlaidWebhookRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        verificationHeader: "signed-jwt",
        client: { plaid: true },
      }),
    );
    expect(routeMocks.enqueuePipSyncJob).toHaveBeenCalledWith(supabase.client, {
      userId: "user-1",
      provider: "plaid",
      reason: "plaid_webhook",
      institutionId: "institution-1",
      sourceWebhookEventId: "webhook-event-1",
      dedupeKey: "plaid-webhook:item-1:TRANSACTIONS:SYNC_UPDATES_AVAILABLE",
      priority: 50,
    });
    expect(supabase.webhookInserts[0]).toMatchObject({
      item_id: "item-1",
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      verification_status: "verified",
      processing_status: "received",
    });
    expect(supabase.webhookUpdates).toContainEqual(
      expect.objectContaining({
        processing_status: "enqueued",
        source_sync_job_id: "job-1",
      }),
    );
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase.client,
      "user-1",
      "plaid_webhook_received",
      expect.objectContaining({
        webhookType: "TRANSACTIONS",
        webhookCode: "SYNC_UPDATES_AVAILABLE",
        itemId: "item-1",
        institutionId: "institution-1",
        syncJobId: "job-1",
        created: true,
      }),
    );
  });

  it("records and ignores unsupported Plaid webhook codes", async () => {
    enableSupabaseEnv();
    const supabase = createWebhookSupabaseClient();
    routeMocks.createSupabaseAdminClient.mockReturnValue(supabase.client);
    routeMocks.getPipSyncFeatureFlags.mockReturnValue({
      syncJobsEnabled: true,
      scheduledSyncEnabled: false,
      scheduledSyncBatchSize: 10,
      scheduledSyncMaxJobs: 10,
      scheduledSyncMinIntervalMinutes: 240,
      plaidWebhookVerify: false,
    });
    routeMocks.loadPlaidCredentialByItemId.mockResolvedValue({
      userId: "user-1",
      institutionId: "institution-1",
    });

    const response = await POST(
      request({
        webhook_type: "TRANSACTIONS",
        webhook_code: "DEFAULT_UPDATE",
        item_id: "item-1",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ignored",
      reason: "unsupported",
    });
    expect(routeMocks.verifyPlaidWebhookRequest).not.toHaveBeenCalled();
    expect(routeMocks.enqueuePipSyncJob).not.toHaveBeenCalled();
    expect(supabase.webhookUpdates).toContainEqual(
      expect.objectContaining({
        processing_status: "ignored",
        error_message: "unsupported",
      }),
    );
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase.client,
      "user-1",
      "plaid_webhook_ignored",
      expect.objectContaining({
        webhookType: "TRANSACTIONS",
        webhookCode: "DEFAULT_UPDATE",
        itemId: "item-1",
        reason: "unsupported",
      }),
    );
  });

  it("records failed Plaid webhook enqueue attempts", async () => {
    enableSupabaseEnv();
    const supabase = createWebhookSupabaseClient();
    routeMocks.createSupabaseAdminClient.mockReturnValue(supabase.client);
    routeMocks.getPipSyncFeatureFlags.mockReturnValue({
      syncJobsEnabled: true,
      scheduledSyncEnabled: false,
      scheduledSyncBatchSize: 10,
      scheduledSyncMaxJobs: 10,
      scheduledSyncMinIntervalMinutes: 240,
      plaidWebhookVerify: false,
    });
    routeMocks.loadPlaidCredentialByItemId.mockResolvedValue({
      userId: "user-1",
      institutionId: "institution-1",
    });
    routeMocks.enqueuePipSyncJob.mockRejectedValue(new Error("queue insert failed: access_token=provider-secret"));

    const response = await POST(
      request({
        webhook_type: "TRANSACTIONS",
        webhook_code: "SYNC_UPDATES_AVAILABLE",
        item_id: "item-1",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Plaid webhook processing failed.",
    });
    expect(supabase.webhookUpdates).toContainEqual(
      expect.objectContaining({
        processing_status: "failed",
        user_id: "user-1",
        error_message: "queue insert failed: access_token=[redacted]",
      }),
    );
    expect(routeMocks.recordProductEventSafely).toHaveBeenCalledWith(
      supabase.client,
      "user-1",
      "plaid_webhook_failed",
      expect.objectContaining({
        webhookType: "TRANSACTIONS",
        webhookCode: "SYNC_UPDATES_AVAILABLE",
        itemId: "item-1",
        institutionId: "institution-1",
        error: "queue insert failed: access_token=[redacted]",
      }),
    );
  });

  it("persists failed verification attempts and rejects the webhook", async () => {
    enableSupabaseEnv();
    const supabase = createWebhookSupabaseClient();
    routeMocks.createSupabaseAdminClient.mockReturnValue(supabase.client);
    routeMocks.getPipSyncFeatureFlags.mockReturnValue({
      syncJobsEnabled: true,
      scheduledSyncEnabled: false,
      scheduledSyncBatchSize: 10,
      scheduledSyncMaxJobs: 10,
      scheduledSyncMinIntervalMinutes: 240,
      plaidWebhookVerify: true,
    });
    routeMocks.createPlaidClient.mockReturnValue({ plaid: true });
    routeMocks.verifyPlaidWebhookRequest.mockRejectedValue(new Error("bad signature"));

    const response = await POST(
      request({
        webhook_type: "TRANSACTIONS",
        webhook_code: "SYNC_UPDATES_AVAILABLE",
        item_id: "item-1",
      }),
    );

    expect(response.status).toBe(401);
    expect(routeMocks.enqueuePipSyncJob).not.toHaveBeenCalled();
    expect(supabase.webhookInserts[0]).toMatchObject({
      verification_status: "failed",
      processing_status: "failed",
      error_message: "bad signature",
    });
  });
});

function request(body: unknown) {
  return new Request("http://localhost:3000/api/webhooks/plaid", {
    method: "POST",
    headers: {
      "Plaid-Verification": "signed-jwt",
    },
    body: JSON.stringify(body),
  });
}

function enableSupabaseEnv() {
  vi.stubEnv("PIP_SUPABASE_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

function createWebhookSupabaseClient() {
  const webhookInserts: Record<string, unknown>[] = [];
  const webhookUpdates: Record<string, unknown>[] = [];
  const client = {
    from(tableName: string) {
      if (tableName !== "plaid_webhook_events") {
        throw new Error(`Unexpected table ${tableName}`);
      }

      return {
        insert(row: Record<string, unknown>) {
          webhookInserts.push(row);

          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    data: {
                      id: "webhook-event-1",
                      ...row,
                    },
                    error: null,
                  });
                },
              };
            },
          };
        },
        update(row: Record<string, unknown>) {
          webhookUpdates.push(row);

          return {
            eq() {
              return Promise.resolve({
                error: null,
              });
            },
          };
        },
      };
    },
  };

  return {
    client,
    webhookInserts,
    webhookUpdates,
  };
}
