# Pip Webhook-First App Open Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace app-open refresh-on-every-open with webhook-first, stale-only sync while keeping the product dead simple: no new UI real estate and no generic freshness/update copy.

**Architecture:** Plaid webhooks continue to enqueue `pip_sync_jobs`; app-open reads active job state and only syncs when a Plaid webhook job is waiting, a first sync is needed, or data is meaningfully stale. The client runs this silently and only lets the existing Pip opening bubble mention a confirmed new same-day transaction after sync returns one.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase tables (`plaid_webhook_events`, `pip_sync_jobs`, `connected_institutions`, `sync_runs`), Plaid `/transactions/sync`, Vitest.

---

## Optimization Result

Rubric used:

- Product simplicity and UX fit: 25 points. High score means no new real estate, no freshness chatter, and only confirmed new transactions are spoken by Pip.
- Correct sync semantics and Plaid cost control: 25 points. High score means no `/transactions/refresh`, recent data skips, webhook jobs run first, and retry timing is respected.
- Implementation safety: 20 points. High score means race conditions, pending jobs, failed jobs, repair states, and webhook bookkeeping have explicit handling.
- Testability: 20 points. High score means each changed behavior has a focused failing test and deterministic expected output.
- Rollout and observability: 10 points. High score means production flags, smoke checks, rollback points, and telemetry are clear.

Score trajectory: `82 -> 91 -> 94 -> 94`.

Substantive optimizer changes:

1. Added `available_at` enforcement so app-open cannot prematurely process retry-delayed webhook jobs.
2. Added webhook `processed_at` bookkeeping so queued webhook events do not stay operationally ambiguous after job completion.
3. Tightened the UI plan so app-open failure, repair, recent, and update-available states remain silent in the opening experience unless a new same-day transaction cue exists.

## Product Rules

1. Do not add banners, receipts, badges, timestamps, cards, or any other app real estate.
2. Do not tell the user that bank updates are available before sync confirms user-visible transactions.
3. Do not tell the user that data was checked recently or last updated at a specific time in the opening experience.
4. Do not show a "checking transactions" opening bubble while silent app-open sync is in flight.
5. Only the existing Pip opening bubble may mention app-open sync, and only when sync returns a new same-day transaction through `sameDayNewTransactions`.
6. If Plaid returns zero new same-day transactions, app-open stays silent and Pip uses normal opening guidance.
7. This plan does not add Plaid `/transactions/refresh`.
8. App-open sync failures and repair states do not create new opening-bubble copy. Existing account-management flows can still handle repair when the user asks or opens settings.

## File Structure

- Modify: `src/lib/data/sync-jobs.ts`
  - Add active job metadata loading.
  - Add a safe claim-by-id helper for available pending webhook jobs.
  - Mark source webhook events as processed when a webhook sync job reaches a terminal state.
- Modify: `src/lib/data/sync-jobs.test.ts`
  - Cover active job loading, `available_at` claim gating, claim-by-id behavior, and webhook `processed_at` bookkeeping.
- Modify: `src/lib/data/app-open-sync.ts`
  - Change the decision policy from "run unless last 60 seconds" to webhook-first, stale-only.
- Modify: `src/app/api/sync/app-open/route.ts`
  - Use active job metadata.
  - Process a pending Plaid webhook job immediately when app-open is the foreground opportunity.
  - Run direct provider sync only for first sync or stale check.
- Modify: `src/app/api/sync/app-open/route.test.ts`
  - Replace current refresh-every-open expectations.
  - Prove recent data skips silently.
  - Prove pending webhook jobs run first.
- Modify: `netlify/functions/pip-scheduled-sync.ts`
  - Allow pending webhook jobs to process even when scheduled polling enqueue is disabled.
- Create: `netlify/functions/pip-scheduled-sync.test.ts`
  - Prove pending jobs still process when scheduled polling enqueue is disabled.
- Modify: `src/lib/pip/opening-bubble-planner.ts`
  - Remove generic refresh status priority from opening bubble planning.
  - Keep same-day transaction copy, but feed it only from a new transaction cue.
- Modify: `src/lib/pip/opening-bubble-planner.test.ts`
  - Prove refresh status no longer outranks transaction copy or normal copy.
- Modify: `src/components/PipHome.tsx`
  - Stop setting app-open "checking" or generic refresh messages.
  - Store a transient `appOpenNewTransactionCue` only when the app-open API returns new same-day transactions.
  - Remove extra app-open message paragraph inside `PipIntroScene`.
- Modify: `src/components/PipHome.test.tsx`
  - Replace warm refresh copy tests with silent-sync and transaction-cue tests.

## Task 1: Add Active Sync Job Metadata And Claim Helper

**Files:**
- Modify: `src/lib/data/sync-jobs.ts`
- Modify: `src/lib/data/sync-jobs.test.ts`

- [ ] **Step 1: Write failing tests for active job loading**

Add this import in `src/lib/data/sync-jobs.test.ts`:

```ts
import {
  claimPipSyncJobById,
  claimPendingPipSyncJobs,
  enqueuePipSyncJob,
  enqueueScheduledPipSyncJobs,
  loadActivePipSyncJobsForUser,
  processPipSyncJob,
} from "@/lib/data/sync-jobs";
```

Add this test inside the existing `describe("Pip sync jobs", () => { })` block:

```ts
it("loads active sync jobs with enough metadata for app-open decisions", async () => {
  const supabase = createSyncJobsClient({
    activeJobs: [
      {
        id: "job-webhook",
        user_id: "user-1",
        provider: "plaid",
        institution_id: "institution-1",
        reason: "plaid_webhook",
        status: "pending",
        source_webhook_event_id: "webhook-1",
        available_at: "2026-06-23T14:00:00.000Z",
        created_at: "2026-06-23T13:59:00.000Z",
      },
    ],
  });

  await expect(loadActivePipSyncJobsForUser(supabase.client, "user-1")).resolves.toEqual([
    {
      id: "job-webhook",
      provider: "plaid",
      institutionId: "institution-1",
      reason: "plaid_webhook",
      status: "pending",
      sourceWebhookEventId: "webhook-1",
      availableAt: "2026-06-23T14:00:00.000Z",
      createdAt: "2026-06-23T13:59:00.000Z",
    },
  ]);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
npm run test -- src/lib/data/sync-jobs.test.ts
```

Expected: FAIL because `loadActivePipSyncJobsForUser` is not exported.

- [ ] **Step 3: Implement active job metadata loading**

In `src/lib/data/sync-jobs.ts`, add this type near the existing job types:

```ts
export type ActivePipSyncJobSummary = {
  id: string;
  provider: Database["public"]["Enums"]["financial_provider"];
  institutionId: string | null;
  reason: PipSyncJobReason;
  status: "pending" | "running";
  sourceWebhookEventId: string | null;
  availableAt: string;
  createdAt: string;
};
```

Add this function after `loadPendingPipSyncJobsForUser`:

```ts
export async function loadActivePipSyncJobsForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ActivePipSyncJobSummary[]> {
  const { data, error } = await supabase
    .from("pip_sync_jobs")
    .select("id, provider, institution_id, reason, status, source_webhook_event_id, available_at, created_at")
    .eq("user_id", userId)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((job) => ({
    id: job.id,
    provider: job.provider,
    institutionId: job.institution_id,
    reason: job.reason,
    status: job.status as "pending" | "running",
    sourceWebhookEventId: job.source_webhook_event_id,
    availableAt: job.available_at,
    createdAt: job.created_at,
  }));
}
```

- [ ] **Step 4: Write failing tests for claim-by-id**

Add this test in `src/lib/data/sync-jobs.test.ts`:

```ts
it("claims a pending sync job by id before foreground processing", async () => {
  const supabase = createSyncJobsClient({
    jobById: {
      ...baseJob(),
      id: "job-webhook",
      status: "pending",
      attempts: 0,
      available_at: "2026-06-23T13:59:00.000Z",
    },
  });

  await expect(
    claimPipSyncJobById(supabase.client, "job-webhook", {
      now: new Date("2026-06-23T14:00:00.000Z"),
    }),
  ).resolves.toMatchObject({
    id: "job-webhook",
    status: "running",
    attempts: 1,
    started_at: "2026-06-23T14:00:00.000Z",
  });

  expect(supabase.updates[0]).toMatchObject({
    status: "running",
    attempts: 1,
    started_at: "2026-06-23T14:00:00.000Z",
    updated_at: "2026-06-23T14:00:00.000Z",
    last_error: null,
  });
});
```

- [ ] **Step 5: Write failing test for retry-delay safety**

Add this test in `src/lib/data/sync-jobs.test.ts`:

```ts
it("does not claim a pending sync job before available_at", async () => {
  const supabase = createSyncJobsClient({
    jobById: {
      ...baseJob(),
      id: "job-webhook",
      status: "pending",
      attempts: 1,
      available_at: "2026-06-23T14:05:00.000Z",
    },
  });

  await expect(
    claimPipSyncJobById(supabase.client, "job-webhook", {
      now: new Date("2026-06-23T14:00:00.000Z"),
    }),
  ).resolves.toBeNull();

  expect(supabase.updates).toEqual([]);
});
```

- [ ] **Step 6: Implement claim-by-id**

In `src/lib/data/sync-jobs.ts`, add this function after `claimPendingPipSyncJobs`:

```ts
export async function claimPipSyncJobById(
  supabase: SupabaseClient<Database>,
  jobId: string,
  input: {
    now?: Date;
  } = {},
): Promise<PipSyncJob | null> {
  const now = input.now ?? new Date();
  const { data: current, error: currentError } = await supabase
    .from("pip_sync_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("status", "pending")
    .lte("available_at", now.toISOString())
    .maybeSingle();

  if (currentError) {
    throw currentError;
  }

  if (!current) {
    return null;
  }

  const attempts = current.attempts + 1;
  const { data: updated, error: updateError } = await supabase
    .from("pip_sync_jobs")
    .update({
      status: "running",
      attempts,
      started_at: now.toISOString(),
      updated_at: now.toISOString(),
      last_error: null,
    })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  return updated;
}
```

- [ ] **Step 7: Mark webhook events processed when webhook jobs finish**

In `src/lib/data/sync-jobs.ts`, add this helper near the private helpers:

```ts
async function markSourceWebhookEventProcessed(
  supabase: SupabaseClient<Database>,
  job: Pick<PipSyncJob, "source_webhook_event_id">,
  now: Date,
): Promise<void> {
  if (!job.source_webhook_event_id) {
    return;
  }

  const { error } = await supabase
    .from("plaid_webhook_events")
    .update({
      processed_at: now.toISOString(),
    })
    .eq("id", job.source_webhook_event_id);

  if (error) {
    throw error;
  }
}
```

In `processPipSyncJob`, call it after a job succeeds and after a job reaches terminal failure:

```ts
await markSourceWebhookEventProcessed(supabase, job, now);
```

Do not call it for retrying jobs because those jobs are not done.

- [ ] **Step 8: Add webhook processed_at tests**

Add this assertion to the existing "marks a job succeeded" test:

```ts
expect(supabase.webhookUpdates[0]).toMatchObject({
  processed_at: "2026-06-05T12:00:00.000Z",
});
```

Add this assertion to the existing "does not retry provider failures that require user repair" test:

```ts
expect(supabase.webhookUpdates[0]).toMatchObject({
  processed_at: "2026-06-05T12:00:00.000Z",
});
```

Add this assertion to the retry test:

```ts
expect(supabase.webhookUpdates).toEqual([]);
```

- [ ] **Step 9: Update the sync-job test fake**

Extend `createSyncJobsClient` input in `src/lib/data/sync-jobs.test.ts`:

```ts
input: {
  activeJobs?: Record<string, unknown>[];
  insertError?: Record<string, unknown>;
  existingJob?: Record<string, unknown>;
  jobById?: Record<string, unknown>;
  pendingJobs?: Record<string, unknown>[];
} = {},
```

Add webhook event update capture near the top of `createSyncJobsClient`:

```ts
const webhookUpdates: Record<string, unknown>[] = [];
```

Add a `plaid_webhook_events` branch before the existing `pip_sync_jobs` assertion:

```ts
if (tableName === "plaid_webhook_events") {
  return {
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
}
```

Update the fake query object so the new select paths work:

```ts
const query = {
  eq() {
    return query;
  },
  in() {
    return query;
  },
  lte() {
    if (input.jobById) {
      const availableAt = new Date(String(input.jobById.available_at)).getTime();
      const now = new Date("2026-06-23T14:00:00.000Z").getTime();

      if (Number.isFinite(availableAt) && availableAt > now) {
        return {
          maybeSingle() {
            return Promise.resolve({
              data: null,
              error: null,
            });
          },
        };
      }
    }

    return query;
  },
  order() {
    if (input.activeJobs) {
      return Promise.resolve({
        data: input.activeJobs,
        error: null,
      });
    }

    return query;
  },
  limit() {
    if (input.pendingJobs) {
      return Promise.resolve({
        data: input.pendingJobs,
        error: null,
      });
    }

    return query;
  },
  select() {
    return query;
  },
  maybeSingle() {
    const latestUpdate = updates.at(-1);

    if (input.jobById && !latestUpdate) {
      return Promise.resolve({
        data: input.jobById,
        error: null,
      });
    }

    return Promise.resolve({
      data: latestUpdate?.status === "running"
        ? {
            ...baseJob(),
            ...input.jobById,
            ...input.pendingJobs?.[0],
            ...latestUpdate,
          }
        : input.existingJob ?? null,
      error: null,
    });
  },
  then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
    return Promise.resolve(resolve({ error: null })).catch(reject);
  },
};
```

Return `webhookUpdates` from the fake:

```ts
return {
  client: client as never,
  inserts,
  updates,
  webhookUpdates,
};
```

- [ ] **Step 10: Run tests**

Run:

```bash
npm run test -- src/lib/data/sync-jobs.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/data/sync-jobs.ts src/lib/data/sync-jobs.test.ts
git commit -m "feat: expose active sync jobs for app-open decisions"
```

## Task 2: Change App-Open Decision To Webhook-First And Stale-Only

**Files:**
- Modify: `src/lib/data/app-open-sync.ts`
- Modify: `src/app/api/sync/app-open/route.ts`
- Modify: `src/app/api/sync/app-open/route.test.ts`

- [ ] **Step 1: Write decision tests for recent-data silence and webhook priority**

In `src/app/api/sync/app-open/route.test.ts`, replace the two `getAppOpenSyncDecision` tests that expect fresh data to run with:

```ts
it("skips recent data when no webhook job is waiting", () => {
  expect(
    getAppOpenSyncDecision({
      syncStatus: createSyncStatus({
        institutions: [
          createInstitution({
            lastSuccessfulSyncAt: "2026-06-23T12:00:00.000Z",
            staleAfter: "2026-06-24T12:00:00.000Z",
            isStale: false,
          }),
        ],
        latestSyncRun: {
          provider: "plaid",
          status: "succeeded",
          startedAt: "2026-06-23T12:00:00.000Z",
          completedAt: "2026-06-23T12:00:02.000Z",
          accountCount: 2,
          transactionCount: 10,
          balanceCount: 2,
          errorMessage: null,
        },
      }),
      activeSyncJobs: [],
      now: new Date("2026-06-23T13:00:00.000Z"),
    }),
  ).toEqual({
    status: "skipped_recent",
    reason: "recent_enough",
    message: "Recent connected data is already available.",
    lastSuccessfulSyncAt: "2026-06-23T12:00:00.000Z",
  });
});

it("runs a pending Plaid webhook job before any stale-data decision", () => {
  expect(
    getAppOpenSyncDecision({
      syncStatus: createSyncStatus(),
      activeSyncJobs: [
        {
          id: "job-webhook",
          provider: "plaid",
          institutionId: "institution-1",
          reason: "plaid_webhook",
          status: "pending",
          sourceWebhookEventId: "webhook-1",
          availableAt: "2026-06-23T13:59:00.000Z",
          createdAt: "2026-06-23T13:58:00.000Z",
        },
      ],
      now: new Date("2026-06-23T14:00:00.000Z"),
    }),
  ).toEqual({
    status: "run_webhook_job",
    provider: "plaid",
    jobId: "job-webhook",
    reason: "plaid_webhook_pending",
  });
});

it("does not run a pending Plaid webhook job before its retry time", () => {
  expect(
    getAppOpenSyncDecision({
      syncStatus: createSyncStatus(),
      activeSyncJobs: [
        {
          id: "job-webhook",
          provider: "plaid",
          institutionId: "institution-1",
          reason: "plaid_webhook",
          status: "pending",
          sourceWebhookEventId: "webhook-1",
          availableAt: "2026-06-23T14:05:00.000Z",
          createdAt: "2026-06-23T13:58:00.000Z",
        },
      ],
      now: new Date("2026-06-23T14:00:00.000Z"),
    }),
  ).toEqual({
    status: "skipped_pending",
    reason: "sync_waiting_for_retry",
    message: "A connected-data sync is waiting for its retry window.",
  });
});
```

- [ ] **Step 2: Update the app-open decision type and logic**

In `src/lib/data/app-open-sync.ts`, replace `APP_OPEN_DUPLICATE_GUARD_MS` with:

```ts
const APP_OPEN_STALE_CHECK_AFTER_MS = 4 * 60 * 60 * 1000;
```

Import the active job type:

```ts
import type { ActivePipSyncJobSummary } from "@/lib/data/sync-jobs";
```

Update `AppOpenSyncDecision` to include webhook-job runs and a quiet stale policy:

```ts
export type AppOpenSyncDecision =
  | {
      status: "run";
      provider: FinancialProviderName;
      reason: "initial_sync" | "stale_check";
    }
  | {
      status: "run_webhook_job";
      provider: FinancialProviderName;
      jobId: string;
      reason: "plaid_webhook_pending";
    }
  | {
      status: "no_provider" | "skipped_pending" | "skipped_recent";
      reason:
        | "no_refreshable_provider"
        | "sync_in_flight"
        | "sync_waiting_for_retry"
        | "recent_enough";
      message: string;
      lastSuccessfulSyncAt?: string;
    }
  | {
      status: "needs_repair";
      provider: FinancialProviderName;
      institutionId: string;
      institutionName: string;
      errorCode: string | null;
      reason: "provider_needs_repair";
      message: string;
    };
```

Change the function input:

```ts
export function getAppOpenSyncDecision(input: {
  syncStatus: SyncStatus;
  activeSyncJobs: ActivePipSyncJobSummary[];
  now: Date;
  staleCheckAfterMs?: number;
}): AppOpenSyncDecision {
```

Use this logic after provider/repair detection:

```ts
const activeWebhookJob = input.activeSyncJobs.find(
  (job) => job.provider === provider && job.reason === "plaid_webhook",
);
const availableWebhookJob = activeWebhookJob && isJobAvailable(activeWebhookJob, input.now)
  ? activeWebhookJob
  : null;

if (availableWebhookJob?.status === "pending") {
  return {
    status: "run_webhook_job",
    provider,
    jobId: availableWebhookJob.id,
    reason: "plaid_webhook_pending",
  };
}

if (activeWebhookJob?.status === "pending" && !isJobAvailable(activeWebhookJob, input.now)) {
  return {
    status: "skipped_pending",
    reason: "sync_waiting_for_retry",
    message: "A connected-data sync is waiting for its retry window.",
  };
}

if (activeWebhookJob?.status === "running" || input.activeSyncJobs.some((job) => job.status === "running")) {
  return {
    status: "skipped_pending",
    reason: "sync_in_flight",
    message: "A connected-data sync is already running.",
  };
}

if (input.activeSyncJobs.some((job) => job.status === "pending")) {
  return {
    status: "skipped_pending",
    reason: "sync_in_flight",
    message: "A connected-data sync is already queued.",
  };
}

const lastSuccessfulSyncAt = getLastSuccessfulSyncAt(input.syncStatus, provider);

if (!lastSuccessfulSyncAt) {
  return {
    status: "run",
    provider,
    reason: "initial_sync",
  };
}

const staleCheckAfterMs = input.staleCheckAfterMs ?? APP_OPEN_STALE_CHECK_AFTER_MS;
const lastSuccessfulSyncTime = new Date(lastSuccessfulSyncAt).getTime();
const isOldEnoughForStaleCheck = input.now.getTime() - lastSuccessfulSyncTime >= staleCheckAfterMs;

if (input.syncStatus.hasStaleInstitution || isOldEnoughForStaleCheck) {
  return {
    status: "run",
    provider,
    reason: "stale_check",
  };
}

return {
  status: "skipped_recent",
  reason: "recent_enough",
  message: "Recent connected data is already available.",
  lastSuccessfulSyncAt,
};
```

Add this helper near the existing private helpers:

```ts
function isJobAvailable(job: Pick<ActivePipSyncJobSummary, "availableAt">, now: Date): boolean {
  const availableAt = new Date(job.availableAt).getTime();

  if (!Number.isFinite(availableAt)) {
    return false;
  }

  return availableAt <= now.getTime();
}
```

Remove `getCooldownRetryAfterSeconds` if it becomes unused.

- [ ] **Step 3: Update app-open route tests for webhook jobs**

Update the route mocks at the top of `src/app/api/sync/app-open/route.test.ts`:

```ts
const routeMocks = vi.hoisted(() => ({
  claimPipSyncJobById: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getAppAccessFailureForUser: vi.fn(),
  loadActivePipSyncJobsForUser: vi.fn(),
  loadManualRefreshOnlyForUser: vi.fn(),
  loadSyncStatusForUser: vi.fn(),
  processPipSyncJob: vi.fn(),
  recordProductEventSafely: vi.fn(),
  runProviderSync: vi.fn(),
}));
```

Update the sync-job mock:

```ts
vi.mock("@/lib/data/sync-jobs", () => ({
  claimPipSyncJobById: routeMocks.claimPipSyncJobById,
  loadActivePipSyncJobsForUser: routeMocks.loadActivePipSyncJobsForUser,
  processPipSyncJob: routeMocks.processPipSyncJob,
}));
```

Add this route test:

```ts
it("processes a pending Plaid webhook sync job on app open", async () => {
  enableSupabaseEnv();
  const supabase = createSupabaseClient({ id: "user-1" });
  const admin = createSupabaseAdminClient();
  routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
  routeMocks.createSupabaseAdminClient.mockReturnValue(admin);
  routeMocks.loadSyncStatusForUser.mockResolvedValue(createSyncStatus());
  routeMocks.loadActivePipSyncJobsForUser.mockResolvedValue([
    {
      id: "job-webhook",
      provider: "plaid",
      institutionId: "institution-1",
      reason: "plaid_webhook",
      status: "pending",
      sourceWebhookEventId: "webhook-1",
      availableAt: "2026-06-23T13:59:00.000Z",
      createdAt: "2026-06-23T13:58:00.000Z",
    },
  ]);
  routeMocks.claimPipSyncJobById.mockResolvedValue({
    id: "job-webhook",
    user_id: "user-1",
    provider: "plaid",
    institution_id: "institution-1",
    reason: "plaid_webhook",
    status: "running",
    source_webhook_event_id: "webhook-1",
    attempts: 1,
    max_attempts: 3,
    priority: 50,
    dedupe_key: "plaid-webhook:item-1:TRANSACTIONS:SYNC_UPDATES_AVAILABLE",
    available_at: "2026-06-23T13:59:00.000Z",
    started_at: "2026-06-23T14:00:00.000Z",
    completed_at: null,
    account_count: 0,
    transaction_count: 0,
    balance_count: 0,
    created_reaction_type: null,
    last_error: null,
    created_at: "2026-06-23T13:58:00.000Z",
    updated_at: "2026-06-23T14:00:00.000Z",
  });
  routeMocks.processPipSyncJob.mockResolvedValue({
    jobId: "job-webhook",
    status: "succeeded",
    result: {
      syncRunId: "sync-1",
      provider: "plaid",
      institutionId: "institution-1",
      institutionIds: ["institution-1"],
      status: "succeeded",
      accountCount: 2,
      transactionCount: 1,
      balanceCount: 2,
      pipCashTodayCents: 3100,
      previousSpendableCashTodayCents: 4200,
      currentSpendableCashTodayCents: 3100,
      spendableDeltaCents: -1100,
      sameDayNewSpendCents: 1100,
      sameDayNewTransactions: [
        {
          date: "2026-06-23",
          label: "Breakfast Spot",
          amountCents: -1100,
          pending: true,
          treatment: "daily_spend",
        },
      ],
      failedInstitutionCount: 0,
      failures: [],
    },
  });

  const response = await POST();

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    status: "ran",
    provider: "plaid",
    reason: "plaid_webhook",
    result: {
      sameDayNewSpendCents: 1100,
      sameDayNewTransactions: [
        {
          label: "Breakfast Spot",
          amountCents: -1100,
          pending: true,
        },
      ],
    },
  });
  expect(routeMocks.claimPipSyncJobById).toHaveBeenCalledWith(admin, "job-webhook", {
    now: expect.any(Date),
  });
  expect(routeMocks.processPipSyncJob).toHaveBeenCalledWith(admin, expect.objectContaining({
    id: "job-webhook",
    status: "running",
  }), {
    now: expect.any(Date),
  });
  expect(routeMocks.runProviderSync).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Update app-open route implementation**

In `src/app/api/sync/app-open/route.ts`, replace `loadPendingPipSyncJobsForUser` import with:

```ts
import {
  claimPipSyncJobById,
  loadActivePipSyncJobsForUser,
  processPipSyncJob,
} from "@/lib/data/sync-jobs";
```

Update the parallel load:

```ts
const [syncStatus, activeSyncJobs] = await Promise.all([
  loadSyncStatusForUser(supabase, user.id, now),
  loadActivePipSyncJobsForUser(supabase, user.id),
]);
```

Pass active jobs to the decision:

```ts
const decision = getAppOpenSyncDecision({
  syncStatus,
  activeSyncJobs,
  now,
});
```

Before the direct `runProviderSync` branch, add webhook-job processing:

```ts
if (decision.status === "run_webhook_job") {
  const writeSupabase = createSupabaseAdminClient();
  const claimedJob = await claimPipSyncJobById(writeSupabase, decision.jobId, {
    now,
  });

  if (!claimedJob) {
    return sensitiveJson({
      status: "skipped_pending",
      reason: "sync_in_flight",
    });
  }

  const processed = await processPipSyncJob(writeSupabase, claimedJob, {
    now,
  });

  if (processed.status === "succeeded") {
    return sensitiveJson({
      status: "ran",
      provider: decision.provider,
      reason: "plaid_webhook",
      result: processed.result,
    });
  }

  return sensitiveJson({
    status: processed.status,
    provider: decision.provider,
    reason: "plaid_webhook",
    error: processed.error,
  });
}
```

Keep the direct sync branch for `decision.status === "run"`, but preserve `reason: "app_open"` for first/stale app-open checks:

```ts
const result = await runProviderSync(supabase, {
  userId: user.id,
  provider: decision.provider,
  reason: "app_open",
  now,
  writeSupabase,
});
```

Update `toAppOpenDecisionEventProperties` to remove `retryAfterSeconds` and include only properties still present.

- [ ] **Step 5: Run app-open tests**

Run:

```bash
npm run test -- src/app/api/sync/app-open/route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/app-open-sync.ts src/app/api/sync/app-open/route.ts src/app/api/sync/app-open/route.test.ts
git commit -m "feat: make app-open sync webhook-first"
```

## Task 3: Ensure Webhook Jobs Process Without Scheduled Polling

**Files:**
- Modify: `netlify/functions/pip-scheduled-sync.ts`
- Create: `netlify/functions/pip-scheduled-sync.test.ts`

- [ ] **Step 1: Write the behavior expectation**

Create `netlify/functions/pip-scheduled-sync.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const functionMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  enqueueScheduledPipSyncJobs: vi.fn(),
  getPipSyncFeatureFlags: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  processPendingPipSyncJobs: vi.fn(),
}));

vi.mock("../../src/lib/data/feature-flags", () => ({
  getPipSyncFeatureFlags: functionMocks.getPipSyncFeatureFlags,
}));

vi.mock("../../src/lib/data/sync-jobs", () => ({
  enqueueScheduledPipSyncJobs: functionMocks.enqueueScheduledPipSyncJobs,
  processPendingPipSyncJobs: functionMocks.processPendingPipSyncJobs,
}));

vi.mock("../../src/lib/supabase/admin", () => ({
  createSupabaseAdminClient: functionMocks.createSupabaseAdminClient,
}));

vi.mock("../../src/lib/supabase/env", () => ({
  isSupabaseConfigured: functionMocks.isSupabaseConfigured,
}));

import pipScheduledSync from "./pip-scheduled-sync";

afterEach(() => {
  vi.clearAllMocks();
});

describe("pip-scheduled-sync", () => {
  it("processes pending webhook jobs when scheduled enqueue is disabled", async () => {
    const supabase = { kind: "admin" };
    functionMocks.getPipSyncFeatureFlags.mockReturnValue({
      syncJobsEnabled: true,
      scheduledSyncEnabled: false,
      scheduledSyncBatchSize: 10,
      scheduledSyncMaxJobs: 10,
      scheduledSyncMinIntervalMinutes: 240,
      plaidWebhookVerify: true,
    });
    functionMocks.isSupabaseConfigured.mockReturnValue(true);
    functionMocks.createSupabaseAdminClient.mockReturnValue(supabase);
    functionMocks.processPendingPipSyncJobs.mockResolvedValue({
      claimed: 1,
      succeeded: 1,
      retrying: 0,
      failed: 0,
      results: [],
    });

    const response = await pipScheduledSync();

    await expect(response.json()).resolves.toMatchObject({
      status: "processed",
      enqueue: {
        scanned: 0,
        enqueued: 0,
        deduped: 0,
      },
      processed: {
        claimed: 1,
        succeeded: 1,
        retrying: 0,
        failed: 0,
      },
    });
    expect(functionMocks.enqueueScheduledPipSyncJobs).not.toHaveBeenCalled();
    expect(functionMocks.processPendingPipSyncJobs).toHaveBeenCalledWith(supabase, {
      limit: 10,
      now: expect.any(Date),
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
npm run test -- netlify/functions/pip-scheduled-sync.test.ts
```

Expected: FAIL because the function currently returns `scheduled-sync-disabled` before processing jobs.

- [ ] **Step 3: Split scheduled enqueue from pending job processing**

In `netlify/functions/pip-scheduled-sync.ts`, replace the early flag guard:

```ts
if (!flags.syncJobsEnabled || !flags.scheduledSyncEnabled) {
  return jsonResponse({
    status: "skipped",
    reason: "scheduled-sync-disabled",
  });
}
```

with:

```ts
if (!flags.syncJobsEnabled) {
  return jsonResponse({
    status: "skipped",
    reason: "sync-jobs-disabled",
  });
}
```

Replace the enqueue block with:

```ts
const enqueue = flags.scheduledSyncEnabled
  ? await enqueueScheduledPipSyncJobs(supabase, {
      limit: flags.scheduledSyncBatchSize,
      minIntervalMinutes: flags.scheduledSyncMinIntervalMinutes,
      now,
    })
  : {
      scanned: 0,
      enqueued: 0,
      deduped: 0,
      jobs: [],
    };
```

Keep `processPendingPipSyncJobs` running whenever `syncJobsEnabled` is true.

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test -- netlify/functions/pip-scheduled-sync.test.ts src/lib/data/sync-jobs.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/pip-scheduled-sync.ts netlify/functions/pip-scheduled-sync.test.ts
git commit -m "fix: process webhook sync jobs without scheduled polling"
```

## Task 4: Make App-Open Sync Silent Unless New Same-Day Transactions Arrive

**Files:**
- Modify: `src/lib/pip/opening-bubble-planner.ts`
- Modify: `src/lib/pip/opening-bubble-planner.test.ts`
- Modify: `src/components/PipHome.tsx`
- Modify: `src/components/PipHome.test.tsx`

- [ ] **Step 1: Write opening bubble planner tests**

Replace the refresh-priority test in `src/lib/pip/opening-bubble-planner.test.ts` with:

```ts
it("does not let generic refresh status outrank confirmed same-day transaction copy", () => {
  const plan = planOpeningBubble({
    refresh: { status: "ran", message: "I checked your transactions." },
    sameDaySpend: { amountCents: 1800, merchantName: "Target", pending: true },
    spendableCashTodayCents: 5600,
  });

  expect(plan).toMatchObject({
    priority: "same_day_spend",
    message: "I found pending $18 at Target and took it off today for now.",
  });
});

it("does not show generic refresh copy when there is no transaction cue", () => {
  const plan = planOpeningBubble({
    refresh: { status: "ran", message: "I checked your transactions." },
    spendableCashTodayCents: 7400,
  });

  expect(plan).toMatchObject({
    priority: "normal",
    message: "You have $74 for today. Nothing unusual is pulling on it.",
  });
});
```

- [ ] **Step 2: Update the opening bubble planner**

In `src/lib/pip/opening-bubble-planner.ts`, remove the `checking`, `failed`, and `ran/skipped` refresh priority branches from `planOpeningBubble`.

Keep the `refresh` input type temporarily if it avoids touching unrelated callers, but make it inert for app-open planning:

```ts
export function planOpeningBubble(input: OpeningBubbleInput): OpeningBubblePlan {
  if (input.sameDaySpend && input.sameDaySpend.amountCents > 0) {
    const merchant = input.sameDaySpend.merchantName
      ? ` at ${input.sameDaySpend.merchantName}`
      : "";
    const pending = input.sameDaySpend.pending ? " pending" : "";
    const suffix = input.sameDaySpend.pending ? " for now" : "";

    return {
      priority: "same_day_spend",
      message: `I found${pending} ${formatMoney(input.sameDaySpend.amountCents)}${merchant} and took it off today${suffix}.`,
      chips: [whyTodayChip()],
      shouldMarkReactionSeen: true,
    };
  }

  if (input.missingData) {
    return {
      priority: "missing_data",
      message: input.missingData.message,
      chips: [chip("manage-accounts", "Accounts", "Manage connected accounts")],
    };
  }

  if (input.clarification) {
    return planClarification(input.clarification);
  }

  if (input.tight) {
    return {
      priority: "tight",
      message: input.tight.message ?? "Today is tight. I would keep spending light.",
      chips: [whyTodayChip()],
    };
  }

  if (input.savingsOpportunity) {
    return {
      priority: "savings_opportunity",
      message: "You have not set a savings goal yet. I can help with one.",
      chips: [chip("set-savings-goal", "Set a goal", "Help me set a savings goal")],
    };
  }

  if (input.productTip) {
    return {
      priority: "product_tip",
      message: input.productTip.message,
      chips: [chip("settings", "Settings", "Open settings")],
    };
  }

  return {
    priority: "normal",
    message: `You have ${formatMoney(input.spendableCashTodayCents ?? 0)} for today. Nothing unusual is pulling on it.`,
    chips: [whyTodayChip()],
  };
}
```

- [ ] **Step 3: Write PipHome tests for silent app-open copy**

In `src/components/PipHome.test.tsx`, replace `shows warm app-open checking, success, and skip copy` and `maps app-open refresh failures to short Pip status copy` with:

```ts
it("keeps app-open sync silent unless the payload contains new same-day transactions", () => {
  expect(__pipHomeTestHooks.getAppOpenNewTransactionCue({
    status: "ran",
    result: {
      sameDayNewTransactions: [],
    },
  })).toBeUndefined();

  expect(__pipHomeTestHooks.getAppOpenNewTransactionCue({
    status: "ran",
    result: {
      sameDayNewTransactions: [
        {
          date: "2026-06-23",
          label: "Breakfast Spot",
          amountCents: -1100,
          pending: true,
          treatment: "daily_spend",
        },
      ],
    },
  })).toEqual({
    amountCents: 1100,
    merchantName: "Breakfast Spot",
    pending: true,
  });

  expect(__pipHomeTestHooks.getAppOpenNewTransactionCue({
    status: "skipped_recent",
  })).toBeUndefined();
  expect(__pipHomeTestHooks.getAppOpenNewTransactionCue({
    status: "failed",
  })).toBeUndefined();
  expect(__pipHomeTestHooks.getAppOpenNewTransactionCue({
    status: "retrying",
    result: {
      sameDayNewTransactions: [
        {
          date: "2026-06-23",
          label: "Breakfast Spot",
          amountCents: -1100,
          pending: true,
          treatment: "daily_spend",
        },
      ],
    },
  })).toBeUndefined();
  expect(__pipHomeTestHooks.getAppOpenNewTransactionCue({
    status: "ran",
    result: {
      sameDayNewTransactions: [
        {
          date: "2026-06-23",
          label: "Power Company",
          amountCents: -7400,
          pending: false,
          treatment: "known_bill",
        },
      ],
    },
  })).toBeUndefined();
});
```

Update the existing opening bubble test so it passes `appOpenNewTransactionCue` instead of a generic sync message:

```ts
const plan = __pipHomeTestHooks.getReadyOpeningBubblePlan({
  result,
  appOpenNewTransactionCue: {
    amountCents: 1800,
    merchantName: "Target",
    pending: true,
  },
});
```

Add a test proving cached same-day ledger alone does not trigger app-open transaction copy:

```ts
it("does not mention cached same-day ledger spend without a new app-open transaction cue", () => {
  const result = __pipHomeTestHooks.getDemoPipCashResult();
  const metric = result.spendableCashToday;

  expect(metric).toBeDefined();

  const plan = __pipHomeTestHooks.getReadyOpeningBubblePlan({
    result: {
      ...result,
      spendableCashToday: {
        ...metric!,
        sameDayDiscretionarySpendCents: 1800,
        sameDayPendingSpendCents: 1800,
        sameDayLedger: {
          ...metric!.sameDayLedger,
          discretionarySpendCents: 1800,
          pendingSpendCents: 1800,
          items: [
            {
              transactionId: "target-pending",
              accountId: "checking",
              date: metric!.sameDayLedger.asOfDate,
              label: "Target",
              amountCents: -1800,
              treatment: "daily_spend",
              pending: true,
              reason: "same-day card purchase",
            },
          ],
        },
      },
    },
  });

  expect(plan.priority).not.toBe("same_day_spend");
});
```

- [ ] **Step 4: Update PipHome state and helpers**

In `src/components/PipHome.tsx`, add this type near the other local helper types:

```ts
type AppOpenNewTransactionCue = NonNullable<OpeningBubbleInput["sameDaySpend"]>;
```

Add state where the current app-open sync message state lives, then remove the old `appOpenSyncMessage` state once the plan is fully applied:

```ts
const [appOpenNewTransactionCue, setAppOpenNewTransactionCue] = useState<AppOpenNewTransactionCue | null>(null);
```

Change all calls to `getReadyOpeningBubblePlan`:

```ts
const openingBubblePlan = getReadyOpeningBubblePlan({
  result,
  appOpenNewTransactionCue: appOpenNewTransactionCue ?? undefined,
});
```

Update the helper signature:

```ts
function getReadyOpeningBubblePlan(input: {
  appOpenNewTransactionCue?: AppOpenNewTransactionCue;
  result: PipCashResult;
}): OpeningBubblePlan {
  return planOpeningBubble({
    sameDaySpend: input.appOpenNewTransactionCue,
    missingData: getOpeningBubbleMissingData(input.result),
    tight: getOpeningBubbleTightNotice(input.result),
    savingsOpportunity: getOpeningBubbleSavingsOpportunity(input.result),
    spendableCashTodayCents: getDisplayedSpendableCashTodayCents(input.result),
  });
}
```

Add a payload parser near the old `getAppOpenSyncMessage` helper:

```ts
function getAppOpenNewTransactionCue(payload: unknown): AppOpenNewTransactionCue | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  if (!("status" in payload) || payload.status !== "ran") {
    return undefined;
  }

  const result = "result" in payload ? payload.result : undefined;

  if (!result || typeof result !== "object") {
    return undefined;
  }

  const transactions = "sameDayNewTransactions" in result
    ? result.sameDayNewTransactions
    : undefined;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return undefined;
  }

  const dailySpendTransactions = transactions.filter((transaction): transaction is {
    amountCents: number;
    label?: string;
    pending?: boolean;
    treatment?: string;
  } => (
    transaction &&
    typeof transaction === "object" &&
    typeof transaction.amountCents === "number" &&
    transaction.amountCents < 0 &&
    (!("treatment" in transaction) || transaction.treatment === "daily_spend")
  ));

  const largest = dailySpendTransactions.reduce<typeof dailySpendTransactions[number] | undefined>(
    (current, transaction) =>
      !current || Math.abs(transaction.amountCents) > Math.abs(current.amountCents)
        ? transaction
        : current,
    undefined,
  );

  if (!largest) {
    return undefined;
  }

  return {
    amountCents: Math.abs(largest.amountCents),
    ...(typeof largest.label === "string" && largest.label.trim()
      ? { merchantName: largest.label.trim() }
      : {}),
    pending: Boolean(largest.pending),
  };
}
```

Delete `getOpeningBubbleSameDaySpend` if no other caller remains. Delete `getAppOpenSyncMessage` after tests no longer reference it.

- [ ] **Step 5: Make `requestAppOpenRefresh` silent**

In `requestAppOpenRefresh`, remove this line:

```ts
setAppOpenSyncMessage(getAppOpenSyncMessage({ ok: true, status: "checking" }) ?? "");
```

After parsing `payload`, set only the transaction cue:

```ts
const newTransactionCue = getAppOpenNewTransactionCue(payload);

setAppOpenNewTransactionCue(newTransactionCue ?? null);
```

Keep the backend reload when sync work ran or changed repair status:

```ts
if (
  response.ok &&
  (status === "ran" ||
    status === "needs_repair" ||
    status === "failed" ||
    status === "retrying")
) {
  setBackendReloadKey((current) => current + 1);
}
```

In the `catch` block, do not set opening-bubble copy:

```ts
setAppOpenNewTransactionCue(null);
```

- [ ] **Step 6: Remove extra app-open message real estate**

In `DefaultAssistantIntro`, remove `appOpenSyncMessage` from props and delete `showAppOpenSyncMessage`.

Change:

```tsx
<PipIntroScene
  priority
  title={modelOpeningBubbleMessage ?? openingBubblePlan.message}
>
  {showAppOpenSyncMessage ? <p>{appOpenSyncMessage}</p> : null}
</PipIntroScene>
```

to:

```tsx
<PipIntroScene
  priority
  title={modelOpeningBubbleMessage ?? openingBubblePlan.message}
/>
```

- [ ] **Step 7: Run UI tests**

Run:

```bash
npm run test -- src/lib/pip/opening-bubble-planner.test.ts src/components/PipHome.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pip/opening-bubble-planner.ts src/lib/pip/opening-bubble-planner.test.ts src/components/PipHome.tsx src/components/PipHome.test.tsx
git commit -m "fix: keep app-open sync silent without new transactions"
```

## Task 5: End-To-End Verification And Production Flag Checklist

**Files:**
- Modify only if tests reveal a narrow issue:
  - `src/app/api/webhooks/plaid/route.ts`
  - `src/app/api/webhooks/plaid/route.test.ts`
  - `src/lib/data/feature-flags.ts`

- [ ] **Step 1: Run focused sync tests**

Run:

```bash
npm run test -- src/lib/data/sync-jobs.test.ts src/app/api/sync/app-open/route.test.ts src/app/api/webhooks/plaid/route.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused UI tests**

Run:

```bash
npm run test -- src/lib/pip/opening-bubble-planner.test.ts src/components/PipHome.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run deployment checks**

Run:

```bash
npm run check:deployment
```

Expected: PASS. If it fails because production env is not present locally, record the exact missing variable names in the implementation closeout.

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Production configuration after deploy**

Set these production environment values:

```text
PIP_SYNC_JOBS_ENABLED=true
PIP_SCHEDULED_SYNC_ENABLED=false
PLAID_WEBHOOK_VERIFY=true
```

This enables webhook queueing and job processing without turning on scheduled polling. Scheduled polling can stay disabled until production usage proves the webhook-first path still leaves stale data too often.

- [ ] **Step 6: Rollback plan**

If production shows app-open sync instability after deploy, roll back behavior in this order:

1. Set `PIP_SYNC_JOBS_ENABLED=false` to stop new webhook job enqueueing and background processing.
2. Redeploy the previous app version if app-open route behavior itself is broken.
3. Do not delete `plaid_webhook_events`, `pip_sync_jobs`, transactions, institutions, or credentials during rollback.
4. Leave Plaid webhooks configured. Ignored webhook events are safer than losing the trail while debugging.
5. Use product events and `pip_sync_jobs.last_error` to identify whether the failure was route logic, provider sync, credentials, or job processing.

- [ ] **Step 7: Production smoke behavior**

Use production-safe evidence only:

1. Confirm a Plaid `SYNC_UPDATES_AVAILABLE` webhook writes a `plaid_webhook_events` row with `processing_status = 'enqueued'`.
2. Confirm a `pip_sync_jobs` row exists with `reason = 'plaid_webhook'`.
3. Open the app as that user.
4. Confirm the app-open API processes that job.
5. Confirm a `sync_completed` or `pip_sync_job_created` product event shows webhook-origin sync with `reason = 'plaid_webhook'`.
6. Confirm the source `plaid_webhook_events.processed_at` is set after the job succeeds or reaches terminal failure.
7. Confirm the existing opening bubble only mentions a transaction if `sameDayNewTransactions` existed in the app-open response.
8. Confirm no generic "checking", "checked recently", "bank update available", "sync failed", "connection needs attention", or "last updated" copy appears in app-open UI.

- [ ] **Step 8: Final full test pass**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add netlify/functions/pip-scheduled-sync.ts netlify/functions/pip-scheduled-sync.test.ts src/lib/data/sync-jobs.ts src/lib/data/sync-jobs.test.ts src/lib/data/app-open-sync.ts src/app/api/sync/app-open/route.ts src/app/api/sync/app-open/route.test.ts src/lib/pip/opening-bubble-planner.ts src/lib/pip/opening-bubble-planner.test.ts src/components/PipHome.tsx src/components/PipHome.test.tsx
git commit -m "feat: use webhook-first silent app-open sync"
```

## Self-Review Checklist

- The plan does not add Plaid `/transactions/refresh`.
- The plan does not add new UI real estate.
- The plan removes app-open checking, refreshed, last-updated, and update-available copy from the opening experience.
- The only app-open user-facing copy added by this plan is existing bubble copy for confirmed new same-day transactions.
- App-open no longer calls Plaid for recent data unless a webhook job is waiting.
- Webhook jobs can process even when scheduled polling enqueue is disabled.
- Existing manual refresh and repair paths remain outside this app-open simplification unless tests show a direct regression.
