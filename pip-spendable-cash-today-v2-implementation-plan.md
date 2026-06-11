# Pip Spendable Cash Today V2

## Implementation Plan for Codex

---

## 0. Core decision

Pip should **keep the name “Spendable Cash Today.”** The metric should change underneath.

The current metric is useful, but it is pointed at the wrong behavioral target. Today, the engine calculates:

```txt
rolling net = income - spending - protected savings
Spendable Cash Today = rolling net / rolling window days
```

The new target:

```txt
Spendable Cash Today = an adaptive daily spending allowance
```

It should be based on:

- Historical income patterns
- Recurring/fixed obligations
- Protected savings
- Current-month spending pace
- Recent overspending/underspending
- Actual cash as a guardrail
- Data confidence

It should **not** require users to manually set a budget or paycheck schedule.

---

# 1. Product thesis to preserve

## Core user behavior

The app is for users who currently do this:

```txt
Open bank app → see balance → assume that is spendable → overspend
```

Pip replaces that with:

```txt
Open Pip → see Spendable Cash Today → spend around that number → close app
```

The agent is valuable, but secondary. The top number is the product.

## Product constraints

Preserve these:

1. **Three-step onboarding only**
   - Sign in
   - Pick protected savings amount
   - Connect accounts

2. **No visible budget setup**
   - No category budgets.
   - No paycheck schedule setup.
   - No manual bill calendar setup.

3. **No dashboard**
   - The app remains one number + chat + cards when needed.

4. **Agent-accessible depth**
   - Users can ask Pip for details, assumptions, and corrections.
   - But details are hidden by default.

5. **Savings before spending**
   - Protected savings comes out before the user sees the spendable number.

6. **The number should shape behavior**
   - Overspend → future number drops.
   - Spend lightly → future number rises.
   - Shortfall → number hits `$0`, not negative.

---

# 2. Current system summary

## Current calculation

The existing engine lives around `calculatePipCash`. It:

- Builds a rolling calendar-month window from the `asOfDate`
- Annotates credit-card settlement matches
- Totals window income
- Totals gross spending
- Subtracts refunds from spending
- Ignores transfers and credit-card payments
- Subtracts protected monthly savings
- Divides rolling net by window days

The rolling date window is “one calendar month back plus one day through today,” not a forward-looking period.

The current fake-data test confirms the prototype `$43` number:

```txt
Income: $4,200
Spending: $2,624
Protected savings: $243
Rolling net: $1,333
Spendable Cash Today: $43
```

## Current useful pieces to keep

Keep these concepts:

- Credit-card settlement payments should not count as new spending.
- Refunds should offset spending instead of inflating income.
- Missing-card warnings are useful when a card payment appears but the card is not connected.
- Pending card spend is already treated conservatively when material.
- Recurring activity and forecast helpers already exist and can be reused or expanded.

## Current pieces to demote

The existing `pipCashTodayCents` should no longer be the main product metric.

It should become a secondary signal, something like:

```txt
rollingDailySurplusCents
cashFlowPaceCents
monthlySurplusPaceCents
```

It is still valuable for explanation and warnings, but it should not drive the main number.

---

# 3. New metric definition

## Public definition

> **Spendable Cash Today** is the amount Pip says is okay to use today based on the user’s normal money pattern, protected savings goal, recurring obligations, recent spending pace, and available cash.

## Internal definition

```txt
Spendable Cash Today =
  baseline daily allowance
  + behavior adjustment
  - cash reality adjustment
```

Floored at `$0`.

Negative states become shortfall states.

---

# 4. Calculation model

## 4.1 High-level formula

```txt
average monthly income
- average recurring obligations
- protected monthly savings
- hidden cushion
= monthly everyday spending pool

monthly everyday spending pool / 30.44
= baseline daily allowance

baseline daily allowance
+ current behavior adjustment
= adaptive daily allowance

adaptive daily allowance capped by cash reality
= Spendable Cash Today
```

## 4.2 Why this is better

The old formula subtracts everyday spending before giving the user a daily number.

That makes the number too low because groceries, gas, dining, coffee, household supplies, and normal discretionary purchases are exactly what the number is supposed to guide.

The new formula excludes fixed/recurring obligations first, then gives the user a daily allowance for everyday spending.

---

# 5. Data windows

## 5.1 Use completed months for the baseline

The baseline should not use a rolling 30/31-day window.

Use completed historical months when possible:

```txt
Example on June 20:
Use March, April, May for baseline.
Use June month-to-date for behavior adjustment.
```

This avoids weird cases where rent or income falls just outside a rolling window.

## 5.2 Recommended lookback hierarchy

| Available history | Baseline strategy |
|---|---|
| 0–29 days | Low confidence; use conservative simple fallback |
| 30–59 days | Medium-low confidence; use available partial pattern |
| 60–89 days | Medium confidence |
| 90+ days | Main target baseline |
| 12 months, later | Use for seasonality and stronger recurring detection |

The initial V2 should be designed around 90 days of transaction history, since the current Plaid configuration is already shaped around that.

## 5.3 Current month is not baseline

The current month should answer:

```txt
Are they ahead or behind their normal pace?
```

It should not redefine the whole baseline immediately.

---

# 6. Categorization model

## 6.1 Split money activity into hidden groups

Do not expose category budgets. Internally, classify transactions into these groups:

| Group | Purpose |
|---|---|
| Income | Establish earning pattern |
| Recurring obligations | Rent, utilities, subscriptions, insurance, debt minimums, regular bills |
| Everyday spending | Groceries, gas, dining, shopping, coffee, household, random card purchases |
| Transfers | Usually ignored |
| Credit-card payments | Usually ignored as settlement |
| Refunds | Offset everyday spending |
| Savings/protected movement | Excluded from spendable allowance |
| Fees | Usually obligations or negative drivers |
| Unknown | Count conservatively but lower confidence |

The current classifier is simple: it uses explicit `kind` when present, otherwise keywords and sign-based fallback. That is acceptable for beta, but the new metric needs stronger classification around recurring obligations versus everyday spending.

---

# 7. Baseline daily allowance

## 7.1 Calculate average monthly income

Use completed months.

For each completed month:

```txt
monthlyIncome = sum income transactions
```

Then calculate robust average:

```txt
averageMonthlyIncome = robustAverage(monthlyIncomeByMonth)
```

Recommended behavior:

- Ignore obvious one-off outliers when possible.
- Do not let one unusually high month massively inflate the allowance.
- If income is irregular, lower confidence and use a conservative average.

## 7.2 Calculate average recurring obligations

For each completed month:

```txt
monthlyRecurringObligations =
  rent
  + utilities
  + subscriptions
  + insurance
  + recurring bills
  + debt minimums if identifiable
  + regular fees
```

Use recurring detection.

Improve it for this use case:

- Detect recurring merchants.
- Detect amount similarity.
- Detect date similarity.
- Treat rent as fixed obligation even if only seen once.
- Treat subscriptions/bills as recurring if category/merchant strongly suggests it.
- Assign confidence.

## 7.3 Protected savings

Use the user’s chosen monthly protected savings amount.

Keep the product behavior:

```txt
Protected savings is removed before Spendable Cash Today exists.
```

Later, split this into richer concepts:

```txt
monthlySavingsGoalCents
protectedBalanceFloorCents
savingsAlreadyProtectedThisMonthCents
remainingSavingsToProtectCents
```

But V2 can begin with the existing monthly protected amount.

## 7.4 Hidden cushion

Add a small invisible buffer.

Purpose:

- Prevent the number from being too aggressive
- Absorb classification mistakes
- Protect against small unknown bills
- Help users save without thinking

Suggested starting options:

```txt
3% of average monthly income
or
5% of monthly everyday pool
or
minimum $50/month, maximum $250/month
```

This should not be presented as a separate budget. Pip can mention it only if asked:

```txt
I leave a small cushion out so the number is not too aggressive.
```

## 7.5 Monthly everyday pool

```txt
monthlyEverydayPool =
  averageMonthlyIncome
  - averageMonthlyRecurringObligations
  - protectedSavingsMonthly
  - hiddenCushion
```

If this is negative:

```txt
baselineDailyAllowance = 0
shortfallPatternCents = abs(monthlyEverydayPool)
```

## 7.6 Baseline daily allowance

```txt
baselineDailyAllowance =
  monthlyEverydayPool / 30.44
```

This becomes the user’s normal daily spending room before recent behavior adjustment.

---

# 8. Behavior adjustment

## 8.1 Goal

This is the habit-forming part.

Pip should respond to behavior automatically:

```txt
Overspend → future number drops.
Spend lightly → future number rises.
```

The user should feel the pattern without managing a budget.

## 8.2 Current-month allowed spending

```txt
allowedSoFarThisMonth =
  baselineDailyAllowance
  * elapsedDaysInCurrentMonth
```

Use the calendar month because users intuitively experience “this month” and because recurring bills/rent are monthly patterns.

## 8.3 Current-month actual everyday spending

```txt
actualEverydaySpendSoFar =
  sum current-month everyday spending
  - current-month refunds related to everyday spending
```

Exclude:

- Rent
- Utilities
- Subscriptions
- Recurring bills
- Card settlement payments
- Transfers
- Protected savings
- Income

## 8.4 Variance

```txt
variance =
  allowedSoFarThisMonth - actualEverydaySpendSoFar
```

Interpretation:

| Variance | Meaning |
|---:|---|
| Positive | User spent less than allowance so far |
| Zero | User is on pace |
| Negative | User overspent allowance so far |

## 8.5 Recovery window

Spread the variance across a recovery period.

Recommended default:

```txt
14 days
```

Why:

- Short enough that users feel consequences
- Long enough that one bad day does not destroy the number
- Simple enough for Pip to explain

```txt
rawBehaviorAdjustment = variance / 14
```

## 8.6 Clamp adjustment

Avoid wild swings.

Suggested initial clamp:

```txt
maxDownwardAdjustment = -60% of baselineDailyAllowance
maxUpwardAdjustment = +50% of baselineDailyAllowance
```

So:

```txt
behaviorAdjustment =
  clamp(rawBehaviorAdjustment, -baseline * 0.6, baseline * 0.5)
```

Rationale:

- Overspending should hurt.
- Underspending should be rewarded.
- Neither should make the app feel chaotic.

## 8.7 Adaptive daily allowance

```txt
adaptiveDailyAllowance =
  baselineDailyAllowance + behaviorAdjustment
```

If below zero:

```txt
spendableCashToday = 0
shortfall = abs(adaptiveDailyAllowance)
```

---

# 9. Cash reality guardrail

## 9.1 Purpose

The number is pattern-based, but it cannot ignore actual cash.

Example problem:

```txt
Historical pattern says $80/day.
Checking account has $12.
```

Pip should not show `$80`.

## 9.2 Use cash as a cap, not the primary model

The product is not “available bank balance divided by days.” The bank balance is only a safety constraint.

Calculate:

```txt
availableCash =
  available checking/cash balances
  + allowed unprotected cash accounts
  - pending committed spend
```

Protected savings should be excluded.

## 9.3 Cash cap

Use a simple conservative cap:

```txt
cashDailyCap = availableCashAfterProtection / 14
```

Then:

```txt
spendableCashToday =
  min(adaptiveDailyAllowance, cashDailyCap)
```

If cash data is stale, missing, or low-confidence, lower confidence and avoid overclaiming.

## 9.4 Do not overdo this in V2

For initial implementation:

- Use checking/cash available balances.
- Exclude savings marked protected.
- Use credit-card available balances only as context, not spendable cash.
- Do not rely on exact upcoming paycheck dates.

---

# 10. Negative and shortfall states

## 10.1 Never show negative as the main number

Main UI should floor at `$0`.

```txt
Spendable Cash Today
$0
```

Then explain separately:

```txt
You’re $38 over your pattern.
```

or:

```txt
No extra room today. Essentials only.
```

## 10.2 Internal negative values still matter

Keep:

```txt
adaptiveDailyAllowanceCents
shortfallCents
patternShortfallCents
cashShortfallCents
```

But public top number remains non-negative.

## 10.3 Shortfall types

Distinguish internally:

| Shortfall type | Meaning | User copy |
|---|---|---|
| Pattern shortfall | User’s income pattern does not cover obligations/savings/cushion | “Your normal pattern is short by $X/month.” |
| Behavior shortfall | Recent spending exceeded pace | “You’re $X over your pattern.” |
| Cash shortfall | Actual cash is too low | “Cash is tight today.” |
| Data shortfall | Missing/stale data prevents trust | “I need more data to make this reliable.” |

---

# 11. Product copy states

## 11.1 Normal state

```txt
Spendable Cash Today
$84

That’s your room for today after bills and savings.
```

## 11.2 Recent overspending

```txt
Spendable Cash Today
$52

Recent spending lowered today’s room.
```

## 11.3 Spending lightly

```txt
Spendable Cash Today
$118

You spent lightly lately, so today has more room.
```

## 11.4 Tight

```txt
Spendable Cash Today
$12

Keep it light today.
```

## 11.5 Shortfall

```txt
Spendable Cash Today
$0

You’re $38 over your pattern.
```

## 11.6 Low confidence

```txt
Spendable Cash Today
$64

This is an early estimate while I learn your pattern.
```

## 11.7 Missing card

```txt
Spendable Cash Today
$64

This may change if you connect the missing card.
```

---

# 12. Agent behavior updates

## 12.1 Agent role

Pip should explain the number, but the number should come from deterministic tools.

Keep the architectural principle:

```txt
Deterministic tools produce financial facts and cards.
The model writes the visible response.
```

## 12.2 New agent tools / tool concepts

Add or update tools around the new metric.

### `get_spendable_cash_today`

Purpose:

```txt
Return the current V2 metric, state, drivers, warnings, and confidence.
```

### `get_spendable_cash_drivers`

Purpose:

```txt
Explain baseline, behavior adjustment, savings, recurring obligations, and cash guardrail.
```

### `simulate_purchase`

Update purpose:

```txt
Show how a purchase affects the adaptive allowance and shortfall.
```

Current simulation subtracts the purchase directly from today’s number. That should change.

### `get_pattern_assumptions`

Purpose:

```txt
Show what Pip is assuming: income average, recurring obligations, everyday spend, savings, cushion, confidence.
```

### `get_recent_spending_pressure`

Purpose:

```txt
Explain whether recent spending raised or lowered today’s number.
```

## 12.3 Explanation style

Pip should answer like:

```txt
I found $52 for today. Your normal room is $66, but recent spending lowered it by $14.
```

Or:

```txt
I found $84 for today. Bills and savings are already held back.
```

Avoid:

```txt
Your rolling net divided by 31 days is...
```

That can still exist behind “show the math,” but not as the default explanation.

## 12.4 Negative-state behavior

If user asks:

```txt
Can I spend $20?
```

And state is shortfall:

```txt
That would add $20 to the shortfall. If it’s essential, cover it; otherwise wait.
```

No shame. No “you cannot.” No fake certainty.

---

# 13. Prompt chip updates

Prompt chips should reflect the new behavior loop.

## 13.1 Default chips

```txt
Why this amount?
Can I spend $50?
What changed?
```

Recommended defaults:

- `Why this amount?`
- `Can I spend $50?`
- `What changed today?`

## 13.2 Positive state chips

- `What raised it?`
- `What lowered it?`
- `Show my pattern`
- `Can I spend $50?`

## 13.3 Overspending state chips

- `Why did it drop?`
- `What pushed it down?`
- `How long to recover?`
- `What can wait?`

## 13.4 Shortfall state chips

- `What caused this?`
- `Essentials first`
- `What can wait?`
- `Show shortfall`

## 13.5 Low-confidence state chips

- `Why estimate?`
- `What data is missing?`
- `Show assumptions`
- `Refresh data`

---

# 14. UI changes

## 14.1 Home screen

Keep the main structure:

```txt
Pip
Spendable Cash Today
$84

Short helper line
Prompt chips
Ask Pip anything...
```

## 14.2 Add state subtitle

Add a small dynamic line under the number.

Examples:

```txt
Room for today after bills and savings.
```

```txt
Recent spending lowered today’s room.
```

```txt
You’re $38 over your pattern.
```

```txt
Early estimate while I learn your pattern.
```

## 14.3 Do not add dashboard elements

No permanent charts.

No category list on home.

No visible budget controls.

Cards only appear after the user asks or when needed for a warning.

## 14.4 Negative state

Change current negative behavior from “You’re $X over today” to a more formal shortfall state.

In V2:

```txt
Top number: $0
Subtitle: You’re $38 over your pattern.
```

---

# 15. Data model changes

## 15.1 Add V2 result type

Create a new result concept rather than mutating the meaning of `PipCashResult` too aggressively.

Suggested type:

```txt
SpendableCashTodayResult
```

Fields:

```txt
spendableCashTodayCents
shortfallCents

baselineDailyAllowanceCents
behaviorAdjustmentCents
cashRealityAdjustmentCents

monthlyEverydayPoolCents
averageMonthlyIncomeCents
averageMonthlyRecurringObligationsCents
protectedSavingsMonthlyCents
hiddenCushionCents

allowedSoFarThisMonthCents
actualEverydaySpendSoFarCents
currentMonthVarianceCents

availableCashGuardrailCents
cashDailyCapCents

lookbackStartDate
lookbackEndDate
completedMonthCount
currentMonthStartDate
currentMonthElapsedDays
recoveryDays

confidence
state

drivers
warnings
dataStates

legacyRollingDailySurplusCents
```

## 15.2 Suggested `state` values

```txt
healthy
normal
tight
overspending
shortfall
low_confidence
missing_data
```

## 15.3 Preserve current result temporarily

Do not break existing routes immediately.

For migration:

- Keep `PipCashResult`.
- Add `SpendableCashTodayResult`.
- Let `/api/pip-cash` return both during transition if needed.
- Eventually rename API concepts only after UI and agent are stable.

Plan a gradual transition rather than a hard rewrite.

---

# 16. Engine implementation phases

## Phase 1 — Add classification foundation

Goal:

```txt
Make transaction grouping reliable enough for V2.
```

Tasks:

1. Define internal spending groups:
   - income
   - recurring obligation
   - everyday spending
   - transfer
   - card settlement
   - refund
   - savings/protected
   - fee
   - unknown

2. Reuse current explicit `kind` where available.

3. Add recurring-obligation detection using:
   - merchant name
   - category
   - amount similarity
   - monthly cadence
   - rent keyword/category
   - subscription/bill categories

4. Add confidence per group:
   - high
   - medium
   - low

5. Keep existing credit-card payment dedupe behavior.

6. Keep refund offset behavior.

Output:

```txt
ClassifiedTransaction[]
MonthlyPatternInput
```

## Phase 2 — Build historical monthly baseline

Goal:

```txt
Calculate the user’s normal monthly money pattern.
```

Tasks:

1. Group transactions by calendar month.

2. Identify completed months only.

3. For each completed month, calculate:
   - income
   - recurring obligations
   - everyday spending
   - refunds
   - unknown spend
   - excluded transfers/card payments

4. Calculate robust averages:
   - average monthly income
   - average monthly recurring obligations
   - average monthly everyday spend, for context only
   - average surplus/deficit, for warning only

5. Calculate baseline:

```txt
monthlyEverydayPool =
  avgIncome
  - avgRecurringObligations
  - protectedSavings
  - hiddenCushion
```

6. Calculate:

```txt
baselineDailyAllowance =
  monthlyEverydayPool / 30.44
```

7. Set confidence:
   - high: 3+ completed months, good classification
   - medium: 2 completed months or some unknowns
   - low: less than 2 months, many unknowns, stale/missing data

Output:

```txt
SpendableBaseline
```

## Phase 3 — Add current-month behavior adjustment

Goal:

```txt
Make today’s number respond to recent spending.
```

Tasks:

1. Calculate current month elapsed days.

2. Calculate:

```txt
allowedSoFarThisMonth =
  baselineDailyAllowance * elapsedDays
```

3. Calculate:

```txt
actualEverydaySpendSoFar =
  current month everyday spend - refunds
```

4. Calculate:

```txt
variance =
  allowedSoFarThisMonth - actualEverydaySpendSoFar
```

5. Spread variance over recovery period:

```txt
rawAdjustment = variance / 14
```

6. Clamp adjustment.

7. Calculate:

```txt
adaptiveDailyAllowance =
  baselineDailyAllowance + behaviorAdjustment
```

Output:

```txt
BehaviorAdjustedAllowance
```

## Phase 4 — Add cash guardrail

Goal:

```txt
Prevent pattern-based numbers from exceeding actual cash reality.
```

Tasks:

1. Calculate available cash from connected deposit accounts.

2. Exclude protected savings.

3. Include pending committed spend conservatively.

4. Calculate:

```txt
cashDailyCap = availableCashAfterProtection / 14
```

5. Final number:

```txt
spendableCashToday =
  max(0, min(adaptiveDailyAllowance, cashDailyCap))
```

6. Calculate shortfall if adaptive allowance or cash cap implies `$0`.

7. Add driver if cash guardrail materially lowered the number.

Output:

```txt
SpendableCashTodayResult
```

## Phase 5 — Add explanations and drivers

Goal:

```txt
Make the number understandable without exposing a budget.
```

Drivers should include:

| Driver | Example |
|---|---|
| Baseline room | `$66/day normal room` |
| Recent spending adjustment | `-$14/day from recent spending` |
| Protected savings | `$200/month held back` |
| Recurring obligations | `$1,850/month held back` |
| Hidden cushion | `Small cushion held back` |
| Cash guardrail | `Cash balance capped today’s number` |
| Missing data | `Missing card may change this` |

Default explanation:

```txt
I found $52 for today. Your normal room is $66, but recent spending lowered it by $14.
```

Detailed explanation card:

```txt
Spendable Cash Today
$52

Normal room: +$66/day
Recent spending: -$14/day
Protected savings: -$200/month
Recurring bills held back: -$1,850/month
```

## Phase 6 — Update purchase simulation

Goal:

```txt
Make “Can I spend X?” feel realistic.
```

Do not subtract the purchase directly from today’s displayed number as if the number is a wallet.

Instead:

1. Add purchase amount to current-month everyday spend.
2. Recompute variance.
3. Recompute behavior adjustment.
4. Recompute final Spendable Cash Today.
5. Report before/after.

Example output:

```txt
Before: $52
After purchase: about $48
Effect: lowers your room by $4/day for the next two weeks
```

If shortfall:

```txt
That would put you $22 over your pattern.
```

If essential:

```txt
If it’s essential, cover it. It would add $20 to the shortfall.
```

## Phase 7 — Update API and caching

Goal:

```txt
Serve the new metric without destabilizing the app.
```

Tasks:

1. Add V2 result to snapshot storage.

2. Store:
   - top number
   - state
   - confidence
   - baseline
   - behavior adjustment
   - drivers
   - warnings
   - legacy rolling daily surplus

3. Decide whether to:
   - add a new table
   - add fields to existing `pip_cash_snapshots`
   - store V2 in the existing JSON `result` field during beta

4. Update `/api/pip-cash` response to include V2 metric.

5. Keep backward compatibility for UI until migration complete.

## Phase 8 — Update UI

Goal:

```txt
Show the new number and state clearly.
```

Tasks:

1. Use `spendableCashTodayCents` from V2 result.

2. Floor display at `$0`.

3. Add state subtitle.

4. Update intro copy:
   - normal
   - overspending
   - spending lightly
   - tight
   - shortfall
   - low confidence

5. Keep visual simplicity.

6. Do not add charts or permanent lists.

7. Update fake scenarios:
   - healthy
   - overspending
   - shortfall
   - low confidence
   - missing card
   - cash guardrail

## Phase 9 — Update agent tools and cards

Goal:

```txt
Make chat explain the new metric, not the old formula.
```

Tasks:

1. Update financial fact tools to call V2 engine.

2. Add/replace explanation card:
   - baseline
   - recent adjustment
   - savings
   - recurring obligations
   - cash guardrail
   - confidence

3. Update math card:
   - show V2 calculation first
   - legacy rolling surplus second, if needed

4. Update purchase simulation card:
   - before
   - after
   - daily effect
   - shortfall effect

5. Update prompt chips based on V2 state.

6. Update instructions:
   - never call the number a budget
   - never say exact paycheck forecast
   - explain as pattern-based
   - mention confidence when low
   - do not overpromise “safe”

## Phase 10 — Analytics and product proof

Goal:

```txt
Know whether the new number works better.
```

Add V2-specific properties:

```txt
metricVersion: "v2"
spendableCashTodayCents
baselineDailyAllowanceCents
behaviorAdjustmentCents
cashRealityAdjustmentCents
state
confidence
shortfallCents
currentMonthVarianceCents
```

Track:

1. App opens.
2. Number viewed.
3. Prompt chip selected.
4. Purchase simulation.
5. Negative/shortfall follow-up.
6. User asks “why.”
7. User refreshes data.
8. User changes protected savings.
9. User returns next day.

Most important product signals:

- Do users return daily?
- Do users ask why the number dropped?
- Do users use purchase simulation?
- Do users accept low/tight states or abandon?
- Does protected savings selection survive after onboarding?
- Does the number feel too low or too high in chat feedback?

---

# 17. Testing plan

## 17.1 Unit tests

Create deterministic tests for:

### Baseline

1. Three months of stable income and bills.
2. Irregular income.
3. One unusually high income month.
4. One unusually high bill month.
5. Missing rent in one month.
6. Subscription detection.

### Protected savings

1. `$0` protected savings.
2. `$200` protected savings.
3. Protected savings larger than monthly surplus.
4. Protected savings change invalidates cached result.

### Behavior adjustment

1. User on pace.
2. User overspent yesterday.
3. User underspent this week.
4. Adjustment clamps downward.
5. Adjustment clamps upward.
6. Current month has only one elapsed day.
7. Current month has 30/31 days.

### Cash guardrail

1. Pattern says `$80`, cash cap says `$40`.
2. Pattern says `$40`, cash cap says `$80`.
3. Protected savings excluded from cash.
4. Pending committed spend lowers cap.
5. Missing available balance fallback.

### Shortfall

1. Baseline negative.
2. Behavior adjustment negative.
3. Cash guardrail zero.
4. Display number remains `$0`.
5. Shortfall shown separately.

### Classification

1. Credit-card settlement ignored.
2. Connected card purchases counted.
3. Refund offsets everyday spend.
4. Transfer ignored.
5. Rent treated as recurring obligation.
6. Subscription treated as recurring obligation.
7. Unknown lowers confidence.

## 17.2 Integration tests

1. `/api/pip-cash` returns V2 result.
2. Manual sync stores V2 snapshot.
3. Home screen displays V2 number.
4. Agent “why this amount?” uses V2 drivers.
5. Agent “Can I spend $50?” uses V2 simulation.
6. Low-confidence state shows conservative copy.
7. Missing-card state still appears.

## 17.3 E2E scenarios

Add scenario URLs or fake data modes for:

```txt
?scenario=healthy-v2
?scenario=overspent-v2
?scenario=shortfall-v2
?scenario=low-confidence-v2
?scenario=missing-card-v2
?scenario=cash-guardrail-v2
```

The repo already has fake-data scenario handling for default and negative states. Extend that pattern.

---

# 18. Rollout plan

## Stage 1 — Shadow calculation

Calculate V2 alongside current metric.

Do not show V2 yet.

Log differences:

```txt
oldFreeCashTodayCents
newSpendableCashTodayCents
difference
state
confidence
```

Goal:

```txt
Find obviously bad cases before showing users.
```

## Stage 2 — Internal fake scenarios

Show V2 in fake/dev scenarios.

Validate:

- Number feels higher and more usable
- Overspending lowers future number
- Underspending raises it
- Shortfall displays as `$0`
- Explanations make sense

## Stage 3 — Beta flag

Show V2 to selected beta users.

Keep old metric available internally.

Watch:

- Support confusion
- “why is this wrong?” chats
- Prompt-chip usage
- Return behavior

## Stage 4 — Full switch

Make V2 the default `Spendable Cash Today`.

Keep legacy rolling surplus in detail cards only.

---

# 19. Migration details

## 19.1 Naming

Public names:

```txt
Pip
Spendable Cash Today
```

Do not change.

Internal names can stay messy temporarily, but add V2 names where clarity matters.

Suggested internal names:

```txt
calculateSpendableCashToday
SpendableCashTodayResult
baselineDailyAllowanceCents
behaviorAdjustmentCents
cashRealityAdjustmentCents
legacyRollingDailySurplusCents
```

Avoid continuing to call the new value `pipCashTodayCents` internally if possible. It will confuse future work.

## 19.2 Current `PipCashResult`

Current type includes:

```txt
pipCashTodayCents
rollingNetCents
incomeTotalCents
spendingTotalCents
refundTotalCents
protectedSavingsMonthlyCents
window
drivers
warnings
dataStates
trueBalances
```

Do not simply cram the new model into these fields. Add a new result shape and bridge the UI gradually.

---

# 20. Codex implementation checklist

## Foundation

- [ ] Add V2 result type.
- [ ] Add hidden transaction group model.
- [ ] Add monthly grouping helper.
- [ ] Add completed-month detection.
- [ ] Add robust monthly average helper.
- [ ] Add recurring-obligation detector or adapt existing recurring logic.
- [ ] Add confidence scoring.

## Metric engine

- [ ] Calculate average monthly income.
- [ ] Calculate average monthly recurring obligations.
- [ ] Calculate protected savings.
- [ ] Calculate hidden cushion.
- [ ] Calculate monthly everyday pool.
- [ ] Calculate baseline daily allowance.
- [ ] Calculate current-month everyday spending.
- [ ] Calculate allowed-so-far.
- [ ] Calculate variance.
- [ ] Calculate 14-day behavior adjustment.
- [ ] Clamp behavior adjustment.
- [ ] Add cash guardrail.
- [ ] Floor final number at `$0`.
- [ ] Calculate shortfall.
- [ ] Build drivers.
- [ ] Build warnings.
- [ ] Include legacy rolling surplus.

## API/data

- [ ] Return V2 metric from `/api/pip-cash`.
- [ ] Store V2 snapshot on manual sync.
- [ ] Invalidate V2 snapshot when settings change.
- [ ] Preserve current result during transition.

## UI

- [ ] Display V2 `spendableCashTodayCents`.
- [ ] Add dynamic subtitle.
- [ ] Add shortfall display.
- [ ] Add low-confidence display.
- [ ] Update fake scenarios.
- [ ] Keep visual design minimal.

## Agent

- [ ] Update main financial tools to V2.
- [ ] Update “why” explanation.
- [ ] Update purchase simulation.
- [ ] Add pattern assumptions card.
- [ ] Add recent spending pressure card.
- [ ] Update prompt chips by state.
- [ ] Update language rules around pattern-based allowance.

## Tests

- [ ] Unit tests for baseline.
- [ ] Unit tests for behavior adjustment.
- [ ] Unit tests for cash guardrail.
- [ ] Unit tests for shortfall.
- [ ] Unit tests for classification.
- [ ] Integration tests for API.
- [ ] E2E tests for fake scenarios.
- [ ] Agent evals for common questions.

---

# 21. Final product rule

Everything should reduce to this:

```txt
Pip learns the user’s normal money pattern.
Pip removes bills, savings, and cushion first.
Pip gives one daily spending number.
If the user overspends, tomorrow gets tighter.
If the user spends lightly, tomorrow gets easier.
If there is no room, Pip shows $0 plus the reason.
```

That is the product.

Do not turn this into budgeting software.
Do not require paycheck setup.
Do not expose category budgets.
Do not make the user think.

The top number should be the behavioral replacement for a bank balance.
