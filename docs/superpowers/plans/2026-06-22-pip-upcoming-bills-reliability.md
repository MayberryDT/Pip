# Pip Upcoming Bills Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "What bills are coming up?" reliably show grounded upcoming bills from confirmed rules and safe recurring evidence, while avoiding false positives like random repeat purchases.

**Architecture:** Keep the agent route and prompt-chip plumbing intact because routing already resolves to `get_recurring_activity`. Fix reliability in the financial-read layer by merging three ordered evidence sources for the recurring card: confirmed user rules, fresh high-confidence detected patterns, and conservative low-confidence historical bill candidates. Harden the correction and provider-normalization inputs so future confirmed rules are scheduleable.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Supabase-backed financial snapshots, Plaid/Teller provider normalization, existing Pip agent tools and cards.

---

## Optimizer Result

Rubric used:

| Criterion | Weight | Initial | Final | Rationale |
| --- | ---: | ---: | ---: | --- |
| Root-cause coverage | 25 | 20 | 24 | Final plan handles confirmed rules, ignored rules, zero-rule production state, and fragile Plaid `kind` input. |
| Product reliability | 20 | 14 | 19 | Initial plan could still show nothing with zero rules; final plan adds safe historical candidates without broad production backfill. |
| Test-first specificity | 20 | 17 | 19 | Final plan names failing tests for confirmed, detected, ignored, stale, and false-positive cases. |
| Sequencing and safety | 15 | 12 | 15 | Final plan separates read-only card behavior, correction persistence, provider normalization, and live rollout. |
| Data compatibility | 10 | 7 | 9 | Final plan preserves the existing card schema and avoids mandatory production data migration. |
| Verification and rollout | 10 | 7 | 9 | Final plan adds aggregate SQL proof, in-app Browser proof, and no-backfill guardrails. |

Final score: **95/100**.

Score trajectory: `80 -> 91 -> 94 -> 95 -> 95 -> 95`.

Substantive improvements over the first plan:

- Added a conservative historical-candidate source so production can surface likely bills even before users save confirmed rules.
- Added explicit false-positive protection for non-bill repeat merchants and ignored user corrections.
- Replaced fragile broad implementation snippets with contracts that preserve existing card schema and test behavior.
- Added rollout gates and production aggregate verification instead of relying only on local unit tests.

## Source Evidence

- Investigation note: GBrain slug `sessions/2026/06/pip-upcoming-bills-readonly-investigation-2026-06-22`.
- Route is healthy: `src/lib/agent/intent-catalog.ts` maps `ai-upcoming-bills` and "what bills are coming up" to `get_recurring_activity`.
- Tool is healthy: `src/lib/agent/ai-agent.ts` calls `runAgentTool("show_recurring_activity", {}, snapshot)`.
- Data builder is too narrow: `src/lib/pip-cash/insights.ts` only detects recurring activity from recent transaction text/cadence and ignores `snapshot.recurringObligationRules`.
- Production aggregate on 2026-06-22 against Supabase project `qevvmulexfoebjmlxbts`: latest transaction date `2026-06-21`, 432 negative transactions in the 180-day detector window, 12 bill-keyword candidates, 2 two-month groups, 0 final renderable groups, 0 rows in `recurring_obligation_rules`, and all 478 transaction rows had `kind = null`.

## Definition Of Done

- `What bills are coming up?` still routes to `get_recurring_activity`.
- Confirmed active recurring-obligation rules render in the upcoming-bills card even if no fresh matching transaction appears in the last 45 days.
- Fresh detected monthly bills still render as they do today.
- Conservative historical bill candidates can render with low confidence when they have monthly-ish bill evidence but fail the current freshness gate.
- Ignored recurring-obligation rules suppress confirmed, detected, and historical-candidate card items.
- Random unrelated repeat purchases do not render as upcoming bills.
- The bill-correction flow stores enough amount and schedule data to make future confirmed rules renderable.
- New Plaid syncs persist useful `kind` values instead of leaving every Plaid transaction to runtime text heuristics.
- Focused tests, agent evals, build, deployment checks, and live in-app Browser proof pass before shipping.

## File Map

- Modify `src/lib/pip-cash/insights.ts`: merge recurring-card items from confirmed rules, detected patterns, and conservative historical bill candidates.
- Modify `src/lib/pip-cash/insights.test.ts`: add failing coverage for confirmed rules, ignored rules, historical candidates, stale candidates, and false positives.
- Modify `src/lib/agent/ai-agent.ts`: extract expected monthly day from bill-correction messages and pass it to the correction action.
- Modify `src/lib/agent/ai-agent.test.ts`: verify forced bill-correction args include `expected_day` when present.
- Modify `src/app/api/agent/route.ts`: reject unschedulable confirmed bills when neither transaction history nor user text provides an expected day.
- Modify `src/app/api/agent/route.test.ts`: verify scheduled rule persistence and missing-day behavior.
- Modify `src/lib/providers/plaid/normalize.ts`: persist `kind` for common Plaid income, transfer, rent, refund, fee, and credit-card-payment cases.
- Modify `src/lib/providers/plaid/normalize.test.ts`: cover Plaid kind persistence.
- Modify `src/components/cards/CardRenderer.tsx`: clarify the recurring empty state after backend behavior is fixed.
- Modify `src/components/cards/CardRenderer.test.tsx`: cover the empty copy.

## Preflight

- [ ] **Step 1: Confirm the implementation branch**

Run:

```bash
git status --short --branch
```

Expected: note the current branch or detached state. If detached, create an implementation branch:

```bash
git switch -c codex/pip-upcoming-bills-reliability
```

- [ ] **Step 2: Ensure dependencies are installed**

The read-only investigation worktree had no `node_modules`, so focused tests could not run.

Run:

```bash
npm install
```

Expected: dependencies install from `package-lock.json`.

- [ ] **Step 3: Capture baseline**

Run:

```bash
npm test -- src/lib/pip-cash/insights.test.ts src/lib/agent/ai-agent.test.ts src/app/api/agent/route.test.ts src/lib/providers/plaid/normalize.test.ts src/components/cards/CardRenderer.test.tsx
```

Expected: record current pass/fail state before edits. If a baseline failure is unrelated, keep it in the implementation notes and still require the new focused tests to fail before code changes.

## Task 1: Add Recurring Activity Characterization Tests

**Files:**
- Modify `src/lib/pip-cash/insights.test.ts`

- [ ] **Step 1: Extend imports**

Update the type import:

```ts
import type { FinancialSnapshot, RecurringObligationRule, Transaction } from "@/lib/types";
```

- [ ] **Step 2: Update local test helpers**

Change `snapshotWith()` and add `rule()`:

```ts
function snapshotWith(
  transactions: Transaction[],
  overrides: Partial<Pick<FinancialSnapshot, "recurringObligationRules">> = {},
): FinancialSnapshot {
  return {
    settings: {
      asOfDate: "2026-06-20",
      protectedSavingsMonthlyCents: 0,
    },
    accounts: [
      {
        id: "checking",
        name: "Everyday Checking",
        institutionName: "Northstar Bank",
        kind: "checking",
        balanceCents: 100000,
      },
      {
        id: "savings",
        name: "Protected Savings",
        institutionName: "Northstar Bank",
        kind: "savings",
        balanceCents: 500000,
        isProtectedSavings: true,
      },
      {
        id: "credit-card",
        name: "Everyday Visa",
        institutionName: "Capital One",
        kind: "credit_card",
        balanceCents: -10000,
      },
    ],
    transactions,
    ...overrides,
  };
}

function rule(overrides: Partial<RecurringObligationRule>): RecurringObligationRule {
  return {
    id: "rule-1",
    userId: "user-1",
    merchantKey: "city-power",
    label: "City Power",
    expectedAmountCents: 8400,
    cadence: "monthly",
    source: "user_confirmed",
    status: "active",
    lastConfirmedAt: "2026-06-20T00:00:00.000Z",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    ...overrides,
  };
}
```

- [ ] **Step 3: Add confirmed-rule rendering tests**

Add:

```ts
it("shows confirmed monthly obligation rules even without recent matching transactions", () => {
  const activity = buildRecurringActivity(snapshotWith([], {
    recurringObligationRules: [
      rule({
        merchantKey: "city-power",
        label: "City Power",
        expectedAmountCents: 8400,
        expectedDay: 3,
        source: "user_confirmed",
        status: "active",
      }),
    ],
  }));

  expect(activity.items).toEqual([
    expect.objectContaining({
      id: "confirmed-city-power",
      label: "City Power",
      merchantName: "City Power",
      expectedDate: "2026-07-03",
      amountCents: -8400,
      kind: "purchase",
      cadence: "monthly",
      confidence: "high",
      sourceTransactionCount: 0,
      lastSeenDate: "2026-06-20",
    }),
  ]);
});

it("schedules confirmed rules later in the current month when the expected day has not passed", () => {
  const activity = buildRecurringActivity(snapshotWith([], {
    recurringObligationRules: [
      rule({
        merchantKey: "phone-plan",
        label: "Phone Plan",
        expectedAmountCents: 8000,
        expectedDay: 28,
        source: "user_confirmed",
        status: "active",
      }),
    ],
  }));

  expect(activity.items[0]).toMatchObject({
    id: "confirmed-phone-plan",
    label: "Phone Plan",
    expectedDate: "2026-06-28",
    amountCents: -8000,
    confidence: "high",
  });
});
```

- [ ] **Step 4: Add suppression and precedence tests**

Add:

```ts
it("lets confirmed rules take precedence over detected transactions for the same merchant", () => {
  const activity = buildRecurringActivity(snapshotWith([
    tx({
      id: "power_may",
      date: "2026-05-03",
      description: "City Power utility bill",
      merchantName: "City Power",
      amountCents: -12100,
      category: "utilities",
      kind: "purchase",
    }),
    tx({
      id: "power_jun",
      date: "2026-06-03",
      description: "City Power utility bill",
      merchantName: "City Power",
      amountCents: -12200,
      category: "utilities",
      kind: "purchase",
    }),
  ], {
    recurringObligationRules: [
      rule({
        merchantKey: "city-power",
        label: "City Power",
        expectedAmountCents: 8400,
        expectedDay: 3,
        source: "user_confirmed",
        status: "active",
      }),
    ],
  }));

  expect(activity.items).toHaveLength(1);
  expect(activity.items[0]).toMatchObject({
    id: "confirmed-city-power",
    amountCents: -8400,
    confidence: "high",
  });
});

it("suppresses detected recurring activity when the user ignored that merchant", () => {
  const activity = buildRecurringActivity(snapshotWith([
    tx({
      id: "power_apr",
      date: "2026-04-03",
      description: "City Power utility bill",
      merchantName: "City Power",
      amountCents: -9800,
      category: "utilities",
      kind: "purchase",
    }),
    tx({
      id: "power_may",
      date: "2026-05-03",
      description: "City Power utility bill",
      merchantName: "City Power",
      amountCents: -12100,
      category: "utilities",
      kind: "purchase",
    }),
    tx({
      id: "power_jun",
      date: "2026-06-03",
      description: "City Power utility bill",
      merchantName: "City Power",
      amountCents: -12200,
      category: "utilities",
      kind: "purchase",
    }),
  ], {
    recurringObligationRules: [
      rule({
        merchantKey: "city-power",
        label: "City Power",
        expectedAmountCents: 0,
        source: "user_correction",
        status: "ignored",
      }),
    ],
  }));

  expect(activity.items).toEqual([]);
});
```

- [ ] **Step 5: Add historical-candidate and false-positive tests**

Add:

```ts
it("shows a low-confidence historical bill candidate when monthly bill evidence is older than the fresh detector window", () => {
  const activity = buildRecurringActivity(snapshotWith([
    tx({
      id: "internet_jan",
      date: "2026-01-15",
      description: "Fiber Internet monthly bill",
      merchantName: "Fiber Internet",
      amountCents: -7000,
      category: "internet",
      kind: "purchase",
    }),
    tx({
      id: "internet_feb",
      date: "2026-02-15",
      description: "Fiber Internet monthly bill",
      merchantName: "Fiber Internet",
      amountCents: -7000,
      category: "internet",
      kind: "purchase",
    }),
    tx({
      id: "internet_mar",
      date: "2026-03-15",
      description: "Fiber Internet monthly bill",
      merchantName: "Fiber Internet",
      amountCents: -7000,
      category: "internet",
      kind: "purchase",
    }),
  ]));

  expect(activity.items[0]).toMatchObject({
    id: "historical-fiber-internet",
    label: "Fiber Internet",
    expectedDate: "2026-07-15",
    amountCents: -7000,
    confidence: "low",
    sourceTransactionCount: 3,
    lastSeenDate: "2026-03-15",
  });
});

it("does not show repeat retail purchases as historical bill candidates", () => {
  const activity = buildRecurringActivity(snapshotWith([
    tx({
      id: "target_jan",
      date: "2026-01-15",
      description: "Target",
      merchantName: "Target",
      amountCents: -7000,
      category: "shops",
      kind: "purchase",
    }),
    tx({
      id: "target_feb",
      date: "2026-02-15",
      description: "Target",
      merchantName: "Target",
      amountCents: -7000,
      category: "shops",
      kind: "purchase",
    }),
    tx({
      id: "target_mar",
      date: "2026-03-15",
      description: "Target",
      merchantName: "Target",
      amountCents: -7000,
      category: "shops",
      kind: "purchase",
    }),
  ]));

  expect(activity.items).toEqual([]);
});
```

- [ ] **Step 6: Run failing tests**

Run:

```bash
npm test -- src/lib/pip-cash/insights.test.ts
```

Expected before implementation: FAIL. Confirm failures are for missing confirmed-rule, ignored-rule, and historical-candidate behavior.

## Task 2: Implement Source-Aware Recurring Activity

**Files:**
- Modify `src/lib/pip-cash/insights.ts`

- [ ] **Step 1: Add recurring model imports**

Add:

```ts
import {
  buildRecurringObligations,
  normalizeRecurringMerchantKey,
} from "@/lib/pip-cash/recurring-obligations";
import type { RecurringObligation, RecurringObligationRule } from "@/lib/types";
```

Merge the type import with the existing `FinancialSnapshot`, `Transaction`, and `TransactionKind` import.

- [ ] **Step 2: Refactor `buildRecurringActivity()` around ordered sources**

Replace the single detector-only flow with this source order:

1. `confirmed`: active user-confirmed rules from `buildRecurringObligations()`.
2. `detected`: current fresh detector behavior from transaction groups.
3. `historical`: conservative bill-like monthly candidates that failed the freshness gate.

Implementation contract:

```ts
const recurringModel = buildRecurringObligations({
  snapshot,
  rules: snapshot.recurringObligationRules ?? [],
});
const ignoredMerchantKeys = new Set(recurringModel.ignoredMerchantKeys);
const confirmedMerchantKeys = new Set(recurringModel.confirmed.map((item) => item.merchantKey));
```

The returned `items` must be:

- deduped by merchant key,
- ordered by source priority (`confirmed`, `detected`, `historical`) when two sources describe the same merchant,
- sorted for display by expected date, amount magnitude, and label after dedupe,
- sliced to 8.

- [ ] **Step 3: Add confirmed-rule item builder**

Add a helper with this contract:

```ts
function buildConfirmedRecurringActivityItems(input: {
  obligations: RecurringObligation[];
  rules: RecurringObligationRule[];
  transactions: Transaction[];
  asOfDate: string;
  horizonDays: number;
}): RecurringActivityItem[] {
  // Use expectedDay when present. Otherwise use the latest matching transaction date.
  // Return no item if neither source can produce a future expected date.
}
```

Required behavior:

- `id` is `confirmed-${merchantKey}`.
- `amountCents` is `-Math.abs(expectedAmountCents)`.
- `kind` comes from the latest matching transaction, else `"purchase"`.
- `confidence` is `"high"`.
- `sourceTransactionCount` is the number of matching transactions in the lookback window, not just `0` or `1`.
- `lastSeenDate` is latest matching transaction date, else `lastConfirmedAt`, else `updatedAt`, else `asOfDate`.

- [ ] **Step 4: Add date helpers**

Add:

```ts
function nextMonthlyDayAfter(expectedDay: number, asOfDate: string): string {
  const asOf = parseDateParts(asOfDate);
  const thisMonth = formatDateParts({
    year: asOf.year,
    month: asOf.month,
    day: Math.min(expectedDay, daysInMonth(asOf.year, asOf.month)),
  });

  if (thisMonth > asOfDate) {
    return thisMonth;
  }

  const nextYear = asOf.month === 12 ? asOf.year + 1 : asOf.year;
  const nextMonth = asOf.month === 12 ? 1 : asOf.month + 1;

  return formatDateParts({
    year: nextYear,
    month: nextMonth,
    day: Math.min(expectedDay, daysInMonth(nextYear, nextMonth)),
  });
}
```

Use existing `nextMonthlyDateAfter()` for transaction-derived schedules.

- [ ] **Step 5: Add historical candidate builder**

Build historical candidates from the same grouped transactions used by the fresh detector.

Eligibility:

- group has at least 3 monthly occurrences,
- intervals are monthly by the existing `isMonthlyInterval()` rule,
- merchant/category/description passes `isLikelyBillOrSubscription()` or `classifyTransaction()` is `rent` or `fee`,
- merchant is not confirmed,
- merchant is not ignored,
- computed future expected date is within `RECURRING_CARD_HORIZON_DAYS`,
- latest occurrence may be older than `ACTIVE_MONTHLY_LOOKBACK_DAYS`, but must still be within `RECURRING_LOOKBACK_DAYS`.

Returned item contract:

- `id` is `historical-${merchantKey}`.
- `confidence` is `"low"`.
- `expectedDate` rolls forward from latest occurrence until it is after `asOfDate`.
- `amountCents` uses the median or average of source amounts, matching the existing style in `buildRecurringCandidate()`.

- [ ] **Step 6: Add explicit dedupe helper**

Add:

```ts
function dedupeRecurringItemsByMerchant(
  items: Array<{ merchantKey: string; item: RecurringActivityItem; priority: number }>,
): RecurringActivityItem[] {
  const bestByMerchant = new Map<string, { item: RecurringActivityItem; priority: number }>();

  for (const entry of items) {
    const current = bestByMerchant.get(entry.merchantKey);

    if (!current || entry.priority < current.priority) {
      bestByMerchant.set(entry.merchantKey, {
        item: entry.item,
        priority: entry.priority,
      });
    }
  }

  return [...bestByMerchant.values()].map((entry) => entry.item);
}
```

Priority ordering: confirmed `0`, detected `1`, historical `2`.

- [ ] **Step 7: Verify focused recurring behavior**

Run:

```bash
npm test -- src/lib/pip-cash/insights.test.ts src/lib/agent/tool-runner.test.ts
```

Expected: PASS. Existing subscription, utility, payroll, credit-card-autopay, savings-transfer, and duplicate-purchase behavior must remain unchanged.

Commit:

```bash
git add src/lib/pip-cash/insights.ts src/lib/pip-cash/insights.test.ts src/lib/agent/tool-runner.test.ts
git commit -m "fix: make upcoming bills use durable recurring evidence"
```

## Task 3: Make Bill Corrections Scheduleable

**Files:**
- Modify `src/lib/agent/ai-agent.ts`
- Modify `src/lib/agent/ai-agent.test.ts`
- Modify `src/app/api/agent/route.ts`
- Modify `src/app/api/agent/route.test.ts`

- [ ] **Step 1: Add forced-tool parser tests**

In `src/lib/agent/ai-agent.test.ts`, extend the existing bill-correction forced-tool test with:

```ts
expect(
  __agentTestHooks.getForcedAgentTool({
    message: "My phone bill is usually $80 on the 15th",
  }),
).toMatchObject({
  toolName: "correct_recurring_obligation",
  args: {
    merchant_name: "phone",
    treatment: "bill",
    expected_amount_cents: 8000,
    expected_day: 15,
  },
  requireCard: false,
});

expect(
  __agentTestHooks.getForcedAgentTool({
    message: "Treat City Power as a monthly bill around the 3rd",
  }),
).toMatchObject({
  toolName: "correct_recurring_obligation",
  args: {
    merchant_name: "City Power",
    treatment: "bill",
    expected_day: 3,
  },
});
```

- [ ] **Step 2: Implement expected-day extraction**

In `getRecurringObligationCorrectionTool()`, add:

```ts
const expectedDay = extractExpectedMonthlyDay(message) ?? undefined;
```

and include:

```ts
...(expectedDay ? { expected_day: expectedDay } : {}),
```

Add:

```ts
function extractExpectedMonthlyDay(message: string): number | null {
  const numeric = /\b(?:on|around|near)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(message);

  if (!numeric) {
    return null;
  }

  const day = Number(numeric[1]);

  return day >= 1 && day <= 31 ? day : null;
}
```

Keep word ordinals out of the first implementation unless a test proves they are needed. Numeric day phrases cover the common app workflow and avoid ambiguous language parsing.

- [ ] **Step 3: Add route tests for schedule persistence**

In `src/app/api/agent/route.test.ts`, keep the existing successful correction test and add a second case where no matching transaction exists:

```ts
it("asks for the monthly day before saving a bill rule that cannot infer a schedule", async () => {
  enableSupabaseEnv();
  const tableCalls: unknown[][] = [];
  const supabase = createSupabaseClient({ id: "user-1" }, undefined, {
    tableCalls,
  });
  routeMocks.createSupabaseServerClient.mockResolvedValue(supabase);
  routeMocks.createSupabaseAdminClient.mockReturnValue(supabase);
  routeMocks.getCurrentFinancialSnapshot.mockResolvedValue({
    ...fakeSnapshot,
    transactions: [],
  });
  routeMocks.runAIAgent.mockImplementation(async (input) => {
    const result = await input.actions?.correctRecurringObligation?.({
      merchantName: "City Power",
      treatment: "bill",
      expectedAmountCents: 8400,
    });

    return createAgentResponse({
      message: result?.message,
      usedTools: ["correct_recurring_obligation"],
      responseMode: "chat_only",
    });
  });

  const response = await POST(jsonRequest({ message: "Treat City Power as an $84 monthly bill" }));
  const payload = await response.json();

  expect(response.status).toBe(200);
  expect(payload.message).toContain("What day of the month");
  expect(tableCalls).not.toContainEqual([
    "from",
    "recurring_obligation_rules",
  ]);
});
```

If the existing route-test helpers do not expose table calls this way, adapt the assertion to the local mock shape, but keep the acceptance rule: no `recurring_obligation_rules` upsert before amount and day are known.

- [ ] **Step 4: Enforce missing-day behavior in the route action**

In `correctRecurringObligation()` inside `src/app/api/agent/route.ts`, after `inferRecurringObligationFromSnapshot()`:

```ts
if (!inferred.expectedAmountCents) {
  return {
    ok: false,
    status: "recurring_obligation_amount_required",
    message: `Tell me the usual monthly amount for ${merchantName}.`,
  };
}

if (!inferred.expectedDay) {
  return {
    ok: false,
    status: "recurring_obligation_day_required",
    message: `What day of the month does ${merchantName} usually happen?`,
  };
}
```

Keep the successful upsert path passing:

```ts
expectedDay: inferred.expectedDay,
```

- [ ] **Step 5: Verify correction behavior**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/app/api/agent/route.test.ts src/lib/data/recurring-obligation-rules.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/lib/agent/ai-agent.ts src/lib/agent/ai-agent.test.ts src/app/api/agent/route.ts src/app/api/agent/route.test.ts
git commit -m "fix: save scheduled bill corrections"
```

## Task 4: Persist Plaid Transaction Kinds For New Syncs

**Files:**
- Modify `src/lib/providers/plaid/normalize.ts`
- Modify `src/lib/providers/plaid/normalize.test.ts`

- [ ] **Step 1: Add Plaid kind tests**

In `src/lib/providers/plaid/normalize.test.ts`, add a helper:

```ts
function plaidTx(overrides: Partial<PlaidTransaction>): PlaidTransaction {
  return {
    transaction_id: "tx",
    account_id: "acct_checking",
    amount: 10,
    date: "2026-06-05",
    authorized_date: null,
    name: "Transaction",
    original_description: null,
    merchant_name: null,
    pending: false,
    ...overrides,
  } as PlaidTransaction;
}
```

Add:

```ts
it("persists broad Plaid transaction kinds used by Pip Cash classification", () => {
  expect(normalizePlaidTransaction(plaidTx({
    transaction_id: "tx_income",
    amount: -2500,
    name: "Payroll",
    personal_finance_category: {
      primary: "INCOME",
      detailed: "INCOME_WAGES",
    },
  }))).toMatchObject({ amountCents: 250000, kind: "income" });

  expect(normalizePlaidTransaction(plaidTx({
    transaction_id: "tx_card_payment",
    amount: 400,
    name: "Capital One Credit Card Payment",
    personal_finance_category: {
      primary: "LOAN_PAYMENTS",
      detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
    },
  }))).toMatchObject({ amountCents: -40000, kind: "credit_card_payment" });

  expect(normalizePlaidTransaction(plaidTx({
    transaction_id: "tx_rent",
    amount: 1200,
    name: "Apartment Rent",
    personal_finance_category: {
      primary: "RENT_AND_UTILITIES",
      detailed: "RENT_AND_UTILITIES_RENT",
    },
  }))).toMatchObject({ amountCents: -120000, kind: "rent" });

  expect(normalizePlaidTransaction(plaidTx({
    transaction_id: "tx_purchase",
    amount: 18.75,
    name: "Coffee Shop",
    personal_finance_category: {
      primary: "FOOD_AND_DRINK",
      detailed: "FOOD_AND_DRINK_COFFEE",
    },
  }))).toMatchObject({ amountCents: -1875, kind: "purchase" });
});
```

- [ ] **Step 2: Implement Plaid kind mapping**

In `normalizePlaidTransaction()`, set and return `kind`:

```ts
const amountCents = Math.round(transaction.amount * -100);
const category = getPlaidCategory(transaction);
const kind = mapPlaidTransactionKind(transaction, category, amountCents);
```

Add:

```ts
function mapPlaidTransactionKind(
  transaction: PlaidTransaction,
  category: string | undefined,
  amountCents: number,
): Transaction["kind"] {
  const haystack = [
    transaction.name,
    transaction.original_description,
    transaction.merchant_name,
    category,
  ].filter(Boolean).join(" ").toLowerCase();

  if (haystack.includes("refund") || haystack.includes("return")) {
    return "refund";
  }

  if (haystack.includes("transfer") || haystack.includes("zelle") || haystack.includes("venmo")) {
    return "transfer";
  }

  if (
    haystack.includes("loan_payments_credit_card_payment") ||
    ((haystack.includes("payment") || haystack.includes("autopay")) &&
      /(american express|amex|capital one|discover|mastercard|visa|credit card|card payment)/.test(haystack))
  ) {
    return "credit_card_payment";
  }

  if (haystack.includes("rent_and_utilities_rent") || /\brent\b/.test(haystack)) {
    return "rent";
  }

  if (/\bfee\b/.test(haystack)) {
    return "fee";
  }

  if (amountCents > 0) {
    return "income";
  }

  if (amountCents < 0) {
    return "purchase";
  }

  return "unknown";
}
```

- [ ] **Step 3: Verify normalization**

Run:

```bash
npm test -- src/lib/providers/plaid/normalize.test.ts src/lib/pip-cash/classify.test.ts src/lib/data/manual-sync.test.ts
```

Expected: PASS. This affects newly synced rows. Do not backfill production rows in this task.

Commit:

```bash
git add src/lib/providers/plaid/normalize.ts src/lib/providers/plaid/normalize.test.ts
git commit -m "fix: persist plaid transaction kinds"
```

## Task 5: Clarify Empty Recurring Card Copy

**Files:**
- Modify `src/components/cards/CardRenderer.tsx`
- Modify `src/components/cards/CardRenderer.test.tsx`

- [ ] **Step 1: Add empty-state fixture**

In `src/components/cards/CardRenderer.test.tsx`, add or extend a recurring-card fixture:

```ts
{
  name: "recurring_activity_empty",
  card: {
    type: "recurring_activity",
    title: "Likely recurring activity",
    asOfDate: "2026-06-20",
    horizonDays: 45,
    items: [],
  },
  expectedText: [
    "Likely recurring activity",
    "I do not see a confirmed or clear repeating bill in the connected data yet.",
  ],
}
```

- [ ] **Step 2: Update empty copy**

In the `recurring_activity` branch, change the empty paragraph to:

```tsx
I do not see a confirmed or clear repeating bill in the connected data yet.
```

This copy is intentionally narrow. It says Pip lacks confirmed or clear connected evidence; it does not claim the user has no bills.

- [ ] **Step 3: Verify card rendering**

Run:

```bash
npm test -- src/components/cards/CardRenderer.test.tsx
```

Expected: PASS.

Commit:

```bash
git add src/components/cards/CardRenderer.tsx src/components/cards/CardRenderer.test.tsx
git commit -m "fix: clarify recurring activity empty state"
```

## Task 6: Recurring-Agent Verification

**Files:**
- No planned source changes.

- [ ] **Step 1: Run focused agent tests**

Run:

```bash
npm test -- src/lib/agent/intent-router.test.ts src/lib/agent/intent-router-dogfood.test.ts src/lib/agent/ai-agent.test.ts src/lib/agent/tool-runner.test.ts src/app/api/agent/route.test.ts
```

Expected: PASS. Confirm:

- "what bills are coming up" routes to `get_recurring_activity`.
- "do I have YouTube Premium coming up" returns a `recurring_activity` card.
- Confirmed rule snapshots render card items.
- Ignored rules suppress detected and historical card items.

- [ ] **Step 2: Run major agent evals**

Run:

```bash
npm run eval:agent:major
npm run eval:agent -- --suite major-capabilities-expanded
npm run eval:agent -- --suite major-capabilities-multiturn
```

Expected: PASS. Recurring/subscription cases should continue expecting `get_recurring_activity` and `recurring_activity`.

- [ ] **Step 3: Run release checks**

Run:

```bash
npm test
npm run build
npm run check:deployment
npm run check:db-schema-names
npm run play:android-copy:verify
git diff --check
```

Expected: PASS.

## Task 7: Production-Safe Verification

**Files:**
- No planned source changes.

- [ ] **Step 1: Re-run aggregate SQL before deploy**

Using Supabase MCP `execute_sql` against project `qevvmulexfoebjmlxbts`, rerun the aggregate query from the read-only investigation or an equivalent aggregate-only query.

Expected: record:

- total transactions,
- latest transaction date,
- current `recurring_obligation_rules` count,
- current detector final-group count under old rules if the query is still available.

Do not select merchant names, descriptions, or user-specific transaction details for the closeout.

- [ ] **Step 2: Verify locally or in preview with a seeded test snapshot**

Use unit tests as the primary proof. If browser proof is needed, run the app and use the Codex in-app Browser `iab` backend first.

Browser acceptance:

1. Ask: `What bills are coming up?`
2. Confirm the recurring activity card appears.
3. Confirm a confirmed-rule scenario shows a dated item.
4. Confirm an empty scenario uses the clarified empty copy.

Do not use standalone Playwright, external browser-control servers, shell-launched browsers, or Computer Use unless Tyler explicitly approves that fallback.

- [ ] **Step 3: Avoid broad production writes**

Do not seed or backfill broad production `recurring_obligation_rules` rows as part of this implementation.

Allowed production data actions:

- aggregate-only reads for verification,
- a single reviewer/test-account confirmed rule only if Tyler approves the target account and purpose,
- no user-wide backfill of Plaid `kind` values.

- [ ] **Step 4: Closeout evidence**

Closeout should include:

- focused test command results,
- full release-check results,
- aggregate production read before deploy,
- browser or preview proof if performed,
- any production data action, with exact scope.

## Rollback Notes

- Card-builder changes are pure application code. Roll back by reverting the implementation commits; no schema rollback is required.
- Plaid `kind` persistence affects only newly synced rows. If it causes unexpected classification, revert the provider-normalization commit; existing rows remain valid because `kind` is nullable.
- Bill-correction schedule enforcement can be reverted independently if it blocks user corrections, but confirmed rules without `expectedDay` should not be relied on for upcoming-card display.
- Empty-copy changes are UI-only and safe to revert independently.

## Self-Review

- Spec coverage: route, card data source, confirmed rules, no-rule production state, ignored rules, Plaid normalization, empty state, tests, and live verification are covered.
- Plan-quality scan: no fill-in-later language or unnamed tests are present.
- Type consistency: `RecurringActivityItem` keeps its existing schema; source information is internal and represented externally through `id`, `confidence`, `sourceTransactionCount`, and `lastSeenDate`.
