# Pip Real Recurring Bills Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "What bills are coming up?" reliably show real upcoming monthly bills, subscriptions, loan payments, and recurring services from connected transaction data, even when provider categories or merchant names do not contain obvious bill keywords.

**Architecture:** Keep routing, card schemas, card rendering, confirmed rules, ignored rules, and database schema unchanged. Fix the recurring detector inside `src/lib/pip-cash/insights.ts` by broadening cadence eligibility, selecting the best monthly sequence when a merchant has extra charges, and then applying evidence tiers so strict monthly repeats can show without turning everyday spend into bills. Use synthetic tests that mirror the live failure shape without storing private production merchant data in fixtures.

**Tech Stack:** Next.js, TypeScript, Vitest, existing Pip financial snapshot model, existing `buildRecurringActivity()`/`RecurringActivityItem` public API.

---

## Optimized Rubric

- Production fit, 25 pts: high means the plan directly fixes the live failure modes already observed, not only the toy keyword case.
- False-positive control, 20 pts: high means the detector catches real monthly obligations while resisting grocery, retail, transfer, card-payment, and noisy same-merchant patterns.
- Implementation specificity, 20 pts: high means each file, helper, test, and command is explicit enough for a fresh agent to execute.
- Verification strength, 20 pts: high means focused unit tests, integration/eval checks, build checks, and read-only production verification are all included.
- Operational safety, 15 pts: high means no production writes, no schema churn, clean commit scope, merge readiness, and rollback criteria are clear.

Score trajectory: `78 -> 88 -> 94 -> 94`. The plateau is acceptable because remaining gains would require a larger recurring-obligation product redesign instead of a detector fix.

## Production Failure Summary

- Production routing worked: the live "What bills are coming up?" turn called `get_recurring_activity` and rendered a `recurring_activity` card.
- Production data was present: sync succeeded, the snapshot was fresh, active accounts existed, and transactions were current.
- There were no persisted confirmed recurring rules for the user, so automatic detection had to carry the card.
- Automatic detection failed because `buildRecurringActivity()` filtered transactions through `isDefaultRecurringActivityCandidate()` before cadence grouping.
- That filter only admitted rent/fees and purchases with explicit words like `subscription`, `premium`, `streaming`, `utility`, `internet`, `gym`, or `insurance`.
- Real live recurring charges had monthly cadence but categories/merchant names like entertainment, loan payments, generic services, and even provider-miscategorized food/restaurant categories. They never reached cadence evaluation.
- A second reliability issue exists: current monthly occurrence selection picks the first transaction in each month. If a merchant has an extra/partial charge earlier than the monthly bill in one month, the detector can break the cadence even though the recurring charge is visible.

## File Structure

- Modify: `src/lib/pip-cash/insights.ts`
  - Keep `buildRecurringActivity()` as the public API.
  - Replace the narrow pre-cadence candidate filter with broad negative expense eligibility.
  - Improve monthly occurrence selection so it chooses the best stable monthly sequence, not blindly the first row per month.
  - Add private evidence helpers:
    - explicit bill/subscription text,
    - strong recurring provider category,
    - strict 3+ month cadence,
    - noisy/everyday guardrails.
  - Preserve confirmed-rule priority and ignored-rule suppression exactly.

- Modify: `src/lib/pip-cash/insights.test.ts`
  - Add failing tests for production-shaped missed bills.
  - Add sequence-selection regression coverage for same-merchant extra charges.
  - Add false-positive guardrails.

- Do not modify:
  - `src/lib/agent/intent-catalog.ts`
  - `src/lib/agent/ai-agent.ts`
  - `src/lib/agent/tool-runner.ts`
  - `src/components/cards/CardRenderer.tsx`
  - Supabase migrations or production data

The agent route and card display already work. This fix belongs in the financial-read layer.

---

## Detector Policy

Automatic recurring activity should include a group when all of these are true:

1. The source transactions are negative expenses.
2. `classifyTransaction(transaction)` is `purchase`, `rent`, or `fee`.
3. A valid monthly sequence is found:
   - at least 2 occurrences for explicit bill text or strong recurring categories,
   - at least 3 occurrences for generic/category-agnostic strict cadence,
   - each interval is between `MONTHLY_INTERVAL_MIN_DAYS` and `MONTHLY_INTERVAL_MAX_DAYS`.
4. The latest selected monthly occurrence is within `ACTIVE_MONTHLY_LOOKBACK_DAYS` for fresh candidates, or qualifies for existing low-confidence historical handling.
5. The projected next date is inside `RECURRING_CARD_HORIZON_DAYS` or the caller-provided horizon.
6. The merchant is not ignored by a recurring obligation rule.
7. The merchant is not already represented by a confirmed recurring rule.
8. Evidence passes at least one tier:
   - Tier 1: rent or fee classification.
   - Tier 2: explicit bill/subscription text.
   - Tier 3: strong recurring provider category, with 2+ monthly occurrences.
   - Tier 4: strict 3+ month recurring cadence, regardless of category, for provider-miscategorized services.

Strict cadence means:

```text
occurrence count >= 3
day spread <= 3
amount spread <= 15% of average absolute amount
one selected recurring charge per month
```

This intentionally allows a miscategorized service with exact monthly behavior to show, while rejecting loose grocery/retail habits and noisy merchants with extra purchases.

---

### Task 1: Add Failing Regression Tests For The Live Failure Shape

**Files:**
- Modify: `src/lib/pip-cash/insights.test.ts`

- [ ] **Step 1: Add a multi-item test for real-shaped monthly obligations without bill keywords**

Add this inside `describe("Recurring activity", () => { ... })`, near the existing recurring subscription tests:

```ts
  it("detects production-shaped monthly obligations without explicit bill keywords", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "video_apr",
        date: "2026-04-04",
        description: "Video Stream",
        merchantName: "Video Stream",
        amountCents: -1466,
        category: "entertainment:entertainment_tv_and_movies",
        kind: "purchase",
      }),
      tx({
        id: "video_may",
        date: "2026-05-04",
        description: "Video Stream",
        merchantName: "Video Stream",
        amountCents: -1466,
        category: "entertainment:entertainment_tv_and_movies",
        kind: "purchase",
      }),
      tx({
        id: "video_jun",
        date: "2026-06-04",
        description: "Video Stream",
        merchantName: "Video Stream",
        amountCents: -1466,
        category: "entertainment:entertainment_tv_and_movies",
        kind: "purchase",
      }),
      tx({
        id: "loan_apr",
        date: "2026-04-05",
        description: "Credit Builder",
        merchantName: "Credit Builder",
        amountCents: -2620,
        category: "loan_payments:loan_payments_other_payment",
        kind: "purchase",
      }),
      tx({
        id: "loan_may",
        date: "2026-05-05",
        description: "Credit Builder",
        merchantName: "Credit Builder",
        amountCents: -2620,
        category: "loan_payments:loan_payments_other_payment",
        kind: "purchase",
      }),
      tx({
        id: "loan_jun",
        date: "2026-06-05",
        description: "Credit Builder",
        merchantName: "Credit Builder",
        amountCents: -2620,
        category: "loan_payments:loan_payments_other_payment",
        kind: "purchase",
      }),
      tx({
        id: "tool_apr",
        date: "2026-04-10",
        description: "Workspace Tool",
        merchantName: "Workspace Tool",
        amountCents: -500,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "tool_may",
        date: "2026-05-10",
        description: "Workspace Tool",
        merchantName: "Workspace Tool",
        amountCents: -500,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "tool_jun",
        date: "2026-06-10",
        description: "Workspace Tool",
        merchantName: "Workspace Tool",
        amountCents: -500,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "api_apr",
        date: "2026-04-01",
        description: "Research API",
        merchantName: "Research API",
        amountCents: -1504,
        category: "food_and_drink:food_and_drink_restaurant",
        kind: "purchase",
      }),
      tx({
        id: "api_may",
        date: "2026-05-01",
        description: "Research API",
        merchantName: "Research API",
        amountCents: -1504,
        category: "food_and_drink:food_and_drink_restaurant",
        kind: "purchase",
      }),
      tx({
        id: "api_jun",
        date: "2026-06-01",
        description: "Research API",
        merchantName: "Research API",
        amountCents: -1504,
        category: "food_and_drink:food_and_drink_restaurant",
        kind: "purchase",
      }),
    ]));

    expect(activity.items.map((item) => ({
      label: item.label,
      expectedDate: item.expectedDate,
      amountCents: item.amountCents,
      confidence: item.confidence,
    }))).toEqual([
      {
        label: "Research API",
        expectedDate: "2026-07-01",
        amountCents: -1504,
        confidence: "high",
      },
      {
        label: "Video Stream",
        expectedDate: "2026-07-04",
        amountCents: -1466,
        confidence: "high",
      },
      {
        label: "Credit Builder",
        expectedDate: "2026-07-05",
        amountCents: -2620,
        confidence: "high",
      },
      {
        label: "Workspace Tool",
        expectedDate: "2026-07-10",
        amountCents: -500,
        confidence: "high",
      },
    ]);
  });
```

Expected before implementation: FAIL because the current candidate gate rejects these rows before cadence grouping.

- [ ] **Step 2: Add a test for two-month strong-category subscriptions**

This catches cases where only two months are present but the provider category is strongly recurring:

```ts
  it("allows two-month recurring evidence for strong subscription categories", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "tv_may",
        date: "2026-05-04",
        description: "Movie Box",
        merchantName: "Movie Box",
        amountCents: -1899,
        category: "entertainment:entertainment_tv_and_movies",
        kind: "purchase",
      }),
      tx({
        id: "tv_jun",
        date: "2026-06-04",
        description: "Movie Box",
        merchantName: "Movie Box",
        amountCents: -1899,
        category: "entertainment:entertainment_tv_and_movies",
        kind: "purchase",
      }),
    ]));

    expect(activity.items[0]).toMatchObject({
      label: "Movie Box",
      expectedDate: "2026-07-04",
      amountCents: -1899,
      sourceTransactionCount: 2,
    });
  });
```

Expected before implementation: FAIL.

- [ ] **Step 3: Add a test for extra same-merchant charges**

This proves the detector chooses the stable monthly sequence instead of the earliest transaction in each month:

```ts
  it("uses the stable monthly charge when a merchant has extra same-month charges", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "cloud_apr",
        date: "2026-04-10",
        description: "Cloud Host",
        merchantName: "Cloud Host",
        amountCents: -2000,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "cloud_may",
        date: "2026-05-10",
        description: "Cloud Host",
        merchantName: "Cloud Host",
        amountCents: -2000,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "cloud_jun_extra",
        date: "2026-06-02",
        description: "Cloud Host",
        merchantName: "Cloud Host",
        amountCents: -300,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "cloud_jun",
        date: "2026-06-10",
        description: "Cloud Host",
        merchantName: "Cloud Host",
        amountCents: -2000,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
    ]));

    expect(activity.items[0]).toMatchObject({
      label: "Cloud Host",
      expectedDate: "2026-07-10",
      amountCents: -2000,
      confidence: "high",
      sourceTransactionCount: 3,
      lastSeenDate: "2026-06-10",
    });
  });
```

Expected before implementation: FAIL because the current month picker can select the June 2 extra charge and break the monthly interval.

- [ ] **Step 4: Add false-positive guardrails**

Add these tests near the existing "does not show repeat retail purchases" test:

```ts
  it("does not show loose grocery habits as recurring bills", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "market_apr",
        date: "2026-04-02",
        description: "Corner Market",
        merchantName: "Corner Market",
        amountCents: -7100,
        category: "food_and_drink:food_and_drink_groceries",
        kind: "purchase",
      }),
      tx({
        id: "market_may",
        date: "2026-05-04",
        description: "Corner Market",
        merchantName: "Corner Market",
        amountCents: -9600,
        category: "food_and_drink:food_and_drink_groceries",
        kind: "purchase",
      }),
      tx({
        id: "market_jun",
        date: "2026-06-01",
        description: "Corner Market",
        merchantName: "Corner Market",
        amountCents: -8300,
        category: "food_and_drink:food_and_drink_groceries",
        kind: "purchase",
      }),
    ]));

    expect(activity.items).toEqual([]);
  });

  it("does not show two-month generic service repeats without strict evidence", () => {
    const activity = buildRecurringActivity(snapshotWith([
      tx({
        id: "service_may",
        date: "2026-05-12",
        description: "Local Service",
        merchantName: "Local Service",
        amountCents: -4000,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
      tx({
        id: "service_jun",
        date: "2026-06-12",
        description: "Local Service",
        merchantName: "Local Service",
        amountCents: -4000,
        category: "general_services:general_services_other_general_services",
        kind: "purchase",
      }),
    ]));

    expect(activity.items).toEqual([]);
  });
```

- [ ] **Step 5: Run focused tests and confirm the new positive tests fail**

Run:

```bash
npm test -- src/lib/pip-cash/insights.test.ts
```

Expected: FAIL for the new positive tests. Existing tests should still show the current baseline behavior.

---

### Task 2: Implement Broader Eligibility And Evidence Tiers

**Files:**
- Modify: `src/lib/pip-cash/insights.ts`

- [ ] **Step 1: Add category constants near the recurring constants**

Add below `MONTHLY_INTERVAL_MAX_DAYS`:

```ts
const STRICT_RECURRING_DAY_SPREAD_DAYS = 3;
const STRICT_RECURRING_AMOUNT_SPREAD_RATIO = 0.15;

const STRONG_RECURRING_CATEGORY_PATTERNS = [
  /^entertainment(?::|_)/,
  /^loan_payments(?::|_)/,
  /^rent_and_utilities(?::|_)/,
  /^telecommunication_services(?::|_)/,
  /^personal_care(?::|_).*gyms?/,
  /^insurance(?::|_)/,
];
```

Do not include `general_services`, `food_and_drink`, `shops`, `general_merchandise`, or `travel` as strong categories. Those can only pass through strict 3+ month cadence or explicit bill text.

- [ ] **Step 2: Replace the early recurring transaction filter**

In `buildRecurringActivity()`, replace:

```ts
  const recurringTransactions = lookbackTransactions
    .filter((transaction) => isDefaultRecurringActivityCandidate(transaction));
```

with:

```ts
  const recurringTransactions = lookbackTransactions
    .filter((transaction) => isRecurringExpenseCandidate(transaction));
```

- [ ] **Step 3: Apply evidence after cadence candidate construction**

In both loops over `grouped.values()`, immediately after the existing `if (!candidate) { continue; }` block, add:

```ts
    if (!hasRecurringActivityEvidence(group, candidate)) {
      continue;
    }
```

Keep the existing ignored/confirmed/horizon conditions after this new evidence check.

- [ ] **Step 4: Remove the stale narrow gate from historical candidates**

In `buildHistoricalRecurringCandidate()`, delete:

```ts
  if (!isDefaultRecurringActivityCandidate(latest)) {
    return null;
  }
```

The caller now applies `hasRecurringActivityEvidence()` consistently for fresh and historical candidates.

- [ ] **Step 5: Replace `isDefaultRecurringActivityCandidate()` with evidence helpers**

Remove `isDefaultRecurringActivityCandidate()` and add these helpers in its place:

```ts
function isRecurringExpenseCandidate(transaction: Transaction): boolean {
  const kind = classifyTransaction(transaction);

  if (transaction.amountCents >= 0) {
    return false;
  }

  return kind === "purchase" || kind === "rent" || kind === "fee";
}

function hasRecurringActivityEvidence(
  transactions: Transaction[],
  candidate: RecurringActivityItem,
): boolean {
  const monthlyOccurrences = getMonthlyRecurringOccurrences(transactions);

  if (monthlyOccurrences.length < 2) {
    return false;
  }

  if (candidate.kind === "rent" || candidate.kind === "fee") {
    return true;
  }

  if (monthlyOccurrences.some((transaction) => isLikelyBillOrSubscription(transaction))) {
    return true;
  }

  if (monthlyOccurrences.some((transaction) => hasStrongRecurringCategory(transaction))) {
    return true;
  }

  return hasStrictRecurringCadence(monthlyOccurrences);
}

function hasStrongRecurringCategory(transaction: Transaction): boolean {
  const category = normalizeCategory(transaction.category);

  if (!category) {
    return false;
  }

  return STRONG_RECURRING_CATEGORY_PATTERNS.some((pattern) => pattern.test(category));
}

function hasStrictRecurringCadence(transactions: Transaction[]): boolean {
  if (transactions.length < 3) {
    return false;
  }

  const days = transactions.map((transaction) => parseDateParts(transaction.date).day);
  const amounts = transactions.map((transaction) => Math.abs(transaction.amountCents));
  const daySpread = Math.max(...days) - Math.min(...days);
  const amountSpread = Math.max(...amounts) - Math.min(...amounts);
  const averageAmount = amounts.reduce((total, amount) => total + amount, 0) / amounts.length;

  return (
    daySpread <= STRICT_RECURRING_DAY_SPREAD_DAYS &&
    amountSpread <= averageAmount * STRICT_RECURRING_AMOUNT_SPREAD_RATIO
  );
}

function normalizeCategory(category: string | undefined): string {
  return (category ?? "").trim().toLowerCase();
}
```

- [ ] **Step 6: Expand the explicit bill/subscription text matcher**

Update `isLikelyBillOrSubscription()` so plurals and provider wording are not accidentally missed:

```ts
  return (
    /\b(subscription|subscriptions|premium|membership|memberships|streaming|utility|utilities|electric|electricity|power|water|sewer|internet|broadband|mobile|phone|cellular|wireless|insurance|gym|gyms|fitness|rent|mortgage|loan|installment)\b/.test(haystack) ||
    /\b(natural gas|gas bill|tv and movies|credit builder)\b/.test(haystack)
  );
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- src/lib/pip-cash/insights.test.ts
```

Expected: the category/evidence tests may still fail if the extra-charge sequence test has not been implemented yet. Existing transfer, income, card-payment, ignored-rule, and confirmed-rule tests must not regress.

---

### Task 3: Select The Best Monthly Sequence When A Merchant Has Extra Charges

**Files:**
- Modify: `src/lib/pip-cash/insights.ts`

- [ ] **Step 1: Replace `getMonthlyRecurringOccurrences()` with a best-sequence selector**

Replace the current `getMonthlyRecurringOccurrences()` implementation with:

```ts
function getMonthlyRecurringOccurrences(transactions: Transaction[]): Transaction[] {
  const monthlyGroups = [...groupBy(transactions, (transaction) => transaction.date.slice(0, 7)).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, monthTransactions]) => ({
      month,
      transactions: [...monthTransactions].sort((left, right) =>
        left.date.localeCompare(right.date) ||
        Math.abs(right.amountCents) - Math.abs(left.amountCents)
      ),
    }));

  if (monthlyGroups.length < 2) {
    return [];
  }

  let best: Transaction[] = [];

  for (const { month, transactions: monthTransactions } of monthlyGroups) {
    for (const seed of monthTransactions) {
      const sequence = buildMonthlySequenceFromSeed(seed, month, monthlyGroups);

      if (isBetterMonthlySequence(sequence, best)) {
        best = sequence;
      }
    }
  }

  if (!isValidMonthlySequence(best)) {
    return [];
  }

  return best;
}
```

- [ ] **Step 2: Add sequence helper functions after `getMonthlyRecurringOccurrences()`**

Add:

```ts
function buildMonthlySequenceFromSeed(
  seed: Transaction,
  seedMonth: string,
  monthlyGroups: { month: string; transactions: Transaction[] }[],
): Transaction[] {
  const sequence = [seed];
  let previous = seed;

  for (const { month, transactions } of monthlyGroups) {
    if (month <= seedMonth) {
      continue;
    }

    const next = transactions
      .filter((transaction) => isMonthlyInterval(daysBetweenDates(previous.date, transaction.date)))
      .sort((left, right) =>
        monthlySequenceTransactionScore(seed, left) - monthlySequenceTransactionScore(seed, right)
      )[0];

    if (!next) {
      continue;
    }

    sequence.push(next);
    previous = next;
  }

  return sequence;
}

function isBetterMonthlySequence(candidate: Transaction[], current: Transaction[]): boolean {
  if (candidate.length !== current.length) {
    return candidate.length > current.length;
  }

  if (candidate.length < 2) {
    return false;
  }

  const candidateStrict = hasStrictRecurringCadence(candidate);
  const currentStrict = hasStrictRecurringCadence(current);

  if (candidateStrict !== currentStrict) {
    return candidateStrict;
  }

  return monthlySequenceStabilityScore(candidate) < monthlySequenceStabilityScore(current);
}

function isValidMonthlySequence(transactions: Transaction[]): boolean {
  if (transactions.length < 2) {
    return false;
  }

  return transactions
    .slice(1)
    .every((transaction, index) => isMonthlyInterval(daysBetweenDates(transactions[index].date, transaction.date)));
}

function monthlySequenceTransactionScore(seed: Transaction, transaction: Transaction): number {
  const seedDay = parseDateParts(seed.date).day;
  const transactionDay = parseDateParts(transaction.date).day;
  const seedAmount = Math.max(1, Math.abs(seed.amountCents));
  const amountSpreadRatio = Math.abs(Math.abs(transaction.amountCents) - Math.abs(seed.amountCents)) / seedAmount;

  return Math.abs(transactionDay - seedDay) * 100 + amountSpreadRatio * 100;
}

function monthlySequenceStabilityScore(transactions: Transaction[]): number {
  const days = transactions.map((transaction) => parseDateParts(transaction.date).day);
  const amounts = transactions.map((transaction) => Math.abs(transaction.amountCents));
  const averageAmount = Math.max(1, amounts.reduce((total, amount) => total + amount, 0) / amounts.length);

  return (
    Math.max(...days) - Math.min(...days) +
    (Math.max(...amounts) - Math.min(...amounts)) / averageAmount
  );
}
```

This preserves the existing monthly interval rules while fixing the "first transaction of the month" assumption.

- [ ] **Step 3: Run focused tests again**

Run:

```bash
npm test -- src/lib/pip-cash/insights.test.ts
```

Expected: PASS. The production-shaped positives, extra-charge sequence test, and guardrails should all pass.

---

### Task 4: Verify Agent/Card Integration Did Not Drift

**Files:**
- Test only unless a real integration failure appears.

- [ ] **Step 1: Verify the recurring tool card still works**

Run:

```bash
npm test -- src/lib/agent/tool-runner.test.ts src/components/cards/CardRenderer.test.tsx
```

Expected: PASS. `show_recurring_activity` still returns a `recurring_activity` card and the renderer still handles populated and empty states.

- [ ] **Step 2: Verify routing still chooses the same tool**

Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/lib/agent/intent-router.test.ts src/lib/agent/intent-router-dogfood.test.ts
```

Expected: PASS. Upcoming bill prompts still map to `get_recurring_activity`.

- [ ] **Step 3: Verify agent eval fixtures**

Run:

```bash
npm run eval:agent -- --routing-only
npm run eval:agent:major
```

Expected: PASS. Recurring/bill prompts still expect `get_recurring_activity` and `recurring_activity`.

---

### Task 5: Read-Only Production Replay

**Files:**
- No repository files expected.
- Use the Supabase connector or another read-only authenticated path. Do not use local Supabase CLI if it hits telemetry/write errors.

- [ ] **Step 1: Identify the same live user from recent chat turns**

Read-only query shape:

```sql
select user_id, created_at, user_message, used_tools, card_types, request_metadata
from public.agent_chat_turns
where user_message ilike '%bills%coming up%'
order by created_at desc
limit 5;
```

Expected: the relevant recent turn used `get_recurring_activity` and `recurring_activity`.

- [ ] **Step 2: Re-run a read-only aggregate against that user's transactions**

The aggregate should answer these questions without writing rows:

```text
How many negative purchase/rent/fee transactions are eligible for recurring cadence?
How many groups pass 2+ month strong category evidence?
How many groups pass 3+ month strict cadence evidence?
Which groups are suppressed by ignored rules?
Which groups are superseded by confirmed rules?
Which groups project into the next 45 days?
```

Expected after implementation: the groups that previously looked monthly but were blocked by keyword-only filtering now classify as renderable under either strong-category evidence or strict-cadence evidence.

- [ ] **Step 3: Keep production untouched**

Do not insert, update, or delete from:

```text
public.recurring_obligation_rules
public.transactions
public.pip_cash_snapshots
public.agent_chat_turns
```

This detector fix must work from existing connected data alone.

---

### Task 6: Full Verification, Commit, And Merge Readiness

**Files:**
- No additional files expected.

- [ ] **Step 1: Run full unit suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run deployment guard checks**

Run:

```bash
npm run check:deployment
npm run check:db-schema-names
npm run play:android-copy:verify
git diff --check
```

Expected: PASS for each command.

- [ ] **Step 4: Rebase before publishing if `main` moved**

Run:

```bash
git fetch origin
git status --short --branch
```

If the branch is behind `origin/main`, rebase onto `origin/main`, rerun Steps 1-3, then continue.

- [ ] **Step 5: Commit only the detector and tests**

Run:

```bash
git status --short
git add src/lib/pip-cash/insights.ts src/lib/pip-cash/insights.test.ts
git commit -m "fix: detect recurring bills from cadence evidence"
```

Expected: one focused commit. The plan doc should be committed only if Tyler wants planning artifacts included.

---

## Rollout And Rollback

Rollout:

1. Merge only after focused tests, full tests, build, deployment checks, and read-only production replay pass.
2. Deploy through the existing Pip production path.
3. Verify live by asking "What bills are coming up?" in the authenticated live app. Use the in-app Browser plugin first for browser automation.
4. Confirm the response includes a non-empty recurring card and does not include obvious everyday retail/card-payment/transfer noise.

Rollback:

1. If the live card is noisy, revert the single detector commit.
2. Redeploy the previous passing main.
3. Keep the tests that describe the desired behavior only if they are still valid after the rollback decision; otherwise revert the whole commit and open a new narrower plan.

---

## Success Criteria

- The live upcoming-bills card is non-empty when connected data contains clear monthly obligations.
- Monthly subscriptions/services can be detected without explicit bill keywords.
- Miscategorized services can be detected when they have strict 3+ month stable cadence.
- Same-merchant extra charges no longer break an otherwise stable monthly sequence.
- Confirmed recurring rules still take priority over detected items.
- Ignored merchants still suppress detected items.
- Income, transfers, credit-card payments, duplicate same-week purchases, loose grocery/retail habits, and two-month generic service repeats are not shown as bills.
- No production data mutation or schema migration is required.

## Optimizer Notes

- The first draft fixed the keyword gate but over-trusted generic categories and under-specified the extra-charge failure mode.
- The optimized plan makes category evidence tiered: strong categories can pass with 2 months, generic/miscategorized services need strict 3+ month cadence.
- The optimized plan adds a sequence-selection task so merchants with extra charges are not missed because one month has an earlier non-recurring charge.
- The optimized plan turns production verification into an explicit read-only replay checkpoint instead of a loose note.
- Final review added two hardening details before commit: materially larger evidence-backed bill sequences can beat tiny strict add-ons, and strict-cadence fallback excludes simple retail, gas, travel, coffee, grocery, and general-merchandise categories.
