# Pip Direct Conversation Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thoroughly test Pip by talking to it directly across scripted API transcripts, local phone-sized UI sessions, and an authenticated real-data pass.

**Architecture:** Run the same core conversation matrix through three progressively more realistic layers. Layer 1 uses deterministic local API/eval harnesses for repeatable pass/fail checks. Layer 2 uses the actual app UI in the Codex in-app Browser with a phone viewport. Layer 3 uses an authenticated test/live session only after the local layers pass, with explicit safeguards around real data and cleanup.

**Tech Stack:** Next.js app, Pip `/api/agent`, Vitest, Playwright E2E, Codex in-app Browser plugin with `iab` backend, Supabase-backed authenticated app state where available.

---

## Source Context

Run this plan from the feature branch:

```bash
git fetch origin
git checkout codex/pip-savings-context-state-machine
git status --short --branch
```

Expected:

```text
## codex/pip-savings-context-state-machine...origin/codex/pip-savings-context-state-machine
```

Relevant durable context:
- GBrain slug: `sessions/2026/06/freecash-pip-savings-context-state-machine-implementation`
- Draft PR: `https://github.com/MayberryDT/spendable/pull/1`

Important project rule:
- Browser automation must use the Codex in-app Browser plugin with the `iab` backend first.
- Do not fall back to standalone Playwright/browser control for interactive browser work unless Tyler explicitly approves it.
- Playwright is still allowed for repo-native scripted E2E commands such as `npm run test:e2e`.

## Test Matrix

Every layer should exercise these conversations:

### A. Savings Goal Context

1. User: `I need to save for a trip to Japan`
   - Expected: Pip asks for missing details.
   - Expected: response mode is clarify.
   - Expected: pending action is `create_savings_goal`.
   - Forbidden: recurring bills, subscriptions, generic spending advice, fake success claim.

2. User: `Yes`
   - Expected: Pip keeps the Japan savings-goal context.
   - Expected: Pip asks for the amount or target details.
   - Forbidden: routing to recurring bills or a random unrelated answer.

3. User: `Set the savings goal`
   - Expected: Pip still keeps the same pending Japan goal.
   - Expected: Pip asks for missing target amount/date if needed.
   - Forbidden: claiming the goal was created before tool/card success.

4. User: `$3000 by December 1st`
   - Expected: Pip creates or plans the savings goal using `create_savings_goal`.
   - Expected: visible `savings_goal_plan` card or equivalent savings goal card.
   - Expected: no old `cushion` language.

5. User: `How much do I need to hit that goal?`
   - Expected: Pip understands `that goal`.
   - Expected: uses `list_savings_goals` or the saved goal state.
   - Expected: gives a concrete monthly/weekly/daily answer.

### B. Spendable Cash Still Works

1. User: `Can I spend $50?`
   - Expected: purchase simulation, not savings-goal routing.
   - Expected: no hard guarantee language.

2. User: `What about $20 instead?`
   - Expected: follow-up purchase simulation using prior spend context.

3. User: `Why this number?`
   - Expected: Spendable Cash explanation/drivers card.

4. User: `Show the math`
   - Expected: math breakdown card.

### C. Routing Guardrails

1. User: `What can I cut back on?`
   - Expected: grounded spending opportunity, not a savings-goal draft.

2. User: `How do I lower my spending without feeling miserable?`
   - Expected: short conversational advice, no card unless deterministic data is used.

3. User: `What does Android cost?`
   - Expected: pricing/support/policy response, not savings-goal routing.

4. User: `Do I have subscriptions coming up?`
   - Expected: recurring activity.

5. User: `Show my bank accounts`
   - Expected: connected accounts, no placeholder bank names.

### D. App Freshness And Phone UX

1. Open `/app`.
   - Expected: app triggers a refresh/sync attempt or shows a clear current data state.
   - Expected: Spendable Cash Today number remains first-screen dominant.
   - Expected: no large stale-refreshed text consuming primary space.

2. Reload after a savings-goal draft is pending.
   - Expected: Pip retains the pending savings context if persistence is available.

3. Use a 390 x 844 phone viewport.
   - Expected: no horizontal overflow.
   - Expected: chat input remains reachable.
   - Expected: savings goal card does not overlap the number or controls.

## Deliverables

Create one local evidence report after executing all layers:

```text
/tmp/pip-direct-conversation-test-report.md
```

The report must include:
- Branch and commit tested.
- Base URL tested for each layer.
- Exact transcript prompts.
- Pass/fail result per prompt.
- Tool/card evidence where available.
- Screenshots or Browser evidence paths for UI and authenticated passes.
- Bugs found, ordered by severity.
- Clear recommendation: merge, fix before merge, or block release.

---

## Task 1: Scripted Local API And Eval Transcript Pass

**Files:**
- Read: `scripts/eval-agent.mjs`
- Read: `scripts/eval-agent.test.ts`
- Read: `src/lib/agent/ai-agent.test.ts`
- Read: `src/app/api/agent/route.test.ts`
- Read: `src/lib/data/agent-chat-turns.test.ts`
- Output: `/tmp/pip-direct-conversation-test-report.md`

- [ ] **Step 1: Confirm branch and clean worktree**

```bash
git status --short --branch
git log --oneline --decorate -2
```

Expected:

```text
## codex/pip-savings-context-state-machine...origin/codex/pip-savings-context-state-machine
bb1e55f ... fix: stabilize Pip savings goal conversations
```

If the worktree is dirty from unrelated files, do not clean it. Record the dirty files in the report and continue only if they do not affect the tests.

- [ ] **Step 2: Run focused deterministic tests**

```bash
npm test -- \
  scripts/eval-agent.test.ts \
  src/lib/agent/ai-agent.test.ts \
  src/app/api/agent/route.test.ts \
  src/lib/data/agent-chat-turns.test.ts \
  src/lib/savings-goals/draft.test.ts
```

Expected:

```text
Test Files ... passed
Tests ... passed
```

Failure rule:
- If any test fails, stop and inspect the failing assertion before moving to browser testing.
- Record exact failing test names and failure messages in `/tmp/pip-direct-conversation-test-report.md`.

- [ ] **Step 3: Run the full agent eval suite against the local app API**

Start the local app if no server is already running:

```bash
PIP_SUPABASE_MODE=off npm run dev -- --webpack -p 3000
```

In a second shell, run:

```bash
PIP_AGENT_EVAL_BASE_URL=http://127.0.0.1:3000 \
PIP_AGENT_EVAL_REPORT=/tmp/pip-agent-eval-report.json \
npm run eval:agent
```

Expected:

```text
Agent eval passed
```

Required evidence:
- Confirm the report includes `phone-savings-japan-context`.
- Confirm there is no failure for creation claims without `create_savings_goal` and a savings card.
- Confirm savings prompts do not contain `cushion` unless the user asked about old wording and Pip redirects to Monthly Savings language.

- [ ] **Step 4: Manually inspect the eval report for the core transcript**

```bash
node -e "const report=require('/tmp/pip-agent-eval-report.json'); console.log(JSON.stringify(report.cases?.find(c=>c.id==='phone-savings-japan-context') ?? report, null, 2));"
```

Expected:
- The Japan transcript is present.
- The first three turns carry `pendingAction.type === "create_savings_goal"`.
- The amount/date turn uses `create_savings_goal`.
- The final progress question uses `list_savings_goals`.

- [ ] **Step 5: Append Task 1 findings to the report**

Add this section to `/tmp/pip-direct-conversation-test-report.md`:

```md
## Layer 1: Scripted API/Eval

- Branch:
- Commit:
- Base URL:
- Focused tests:
- Agent eval report:
- Japan transcript result:
- Failures:
- Release impact:
```

---

## Task 2: Local Phone-Sized UI Pass In The Codex In-App Browser

**Files:**
- Read: `tests/e2e/ai-agent.spec.ts`
- Read: `tests/helpers/mock-agent-runtime.ts`
- Output: `/tmp/pip-direct-conversation-test-report.md`
- Output: Browser screenshots/evidence paths under `/tmp`

- [ ] **Step 1: Run the repo-native phone E2E first**

```bash
npm run test:e2e -- tests/e2e/ai-agent.spec.ts -g "Japan savings goal"
```

Expected:

```text
1 passed
```

Failure rule:
- If this fails, do not start interactive UI testing.
- Record the trace path and error in the report.

- [ ] **Step 2: Start the local app for interactive browser testing**

```bash
PIP_SUPABASE_MODE=off npm run dev -- --webpack -p 3000
```

Expected:

```text
Local: http://localhost:3000
```

- [ ] **Step 3: Open the in-app Browser with a phone viewport**

Use the Codex in-app Browser plugin with the `iab` backend.

Open:

```text
http://127.0.0.1:3000/app
```

Set viewport:

```text
390 x 844
```

Expected:
- Spendable Cash Today is visible without horizontal scroll.
- Chat input is visible or reachable.
- No large stale refreshed-data text dominates the first viewport.

- [ ] **Step 4: Talk to Pip through the actual UI**

Enter these prompts exactly:

```text
I need to save for a trip to Japan
Yes
Set the savings goal
$3000 by December 1st
How much do I need to hit that goal?
Can I spend $50?
What about $20 instead?
Why this number?
Show the math
What can I cut back on?
What does Android cost?
Do I have subscriptions coming up?
Show my bank accounts
```

For each prompt, capture:
- Visible assistant response.
- Any visible card title.
- Whether the chat context was preserved.
- Whether the response was obviously unrelated.
- Screenshot if the UI looks wrong.

Pass criteria:
- `Yes` and `Set the savings goal` stay on the Japan savings flow.
- No goal-created wording appears before a successful savings goal card/tool result.
- Spend questions still produce purchase simulations.
- Android/pricing/support questions do not become savings goals.
- The UI remains usable on phone dimensions.

- [ ] **Step 5: Test reload while context is pending**

Restart a fresh chat or use the current one before goal creation:

```text
I need to save for a trip to Japan
```

Reload the page.

Then send:

```text
Yes
```

Expected:
- If local fake/no-Supabase mode cannot persist chat turns, record that limitation.
- If persistence is available in the local environment, Pip should retain the pending Japan savings context.
- In either case, Pip must not route `Yes` to recurring bills or unrelated advice.

- [ ] **Step 6: Append Task 2 findings to the report**

Add this section:

```md
## Layer 2: Local In-App Browser Phone UI

- Base URL:
- Viewport:
- Browser backend:
- E2E command result:
- Transcript pass/fail:
- Reload/context result:
- Screenshots:
- UI issues:
- Release impact:
```

---

## Task 3: Authenticated Real-Data Pass

**Files:**
- Read: `README.md`
- Read: `playwright.live.config.ts`
- Read: `tests/e2e/live-authenticated-onboarding.spec.ts`
- Read: `scripts/check-live-smoke-env.mjs`
- Output: `/tmp/pip-direct-conversation-test-report.md`
- Optional output: `/tmp/pip-live-auth.json`
- Optional output: `/tmp/pip-in-app-browser-evidence.json`

Safety rule:
- Prefer a test/reviewer account.
- Do not create a real personal savings goal in Tyler's own account unless Tyler explicitly approves that account for test writes.
- If no cleanup path is available, stop before final creation and record the blocker.

- [ ] **Step 1: Decide the authenticated target**

Use one of these:

```text
Production: https://spendwithpip.com/app
Preview: open the exact Netlify/GitHub deploy-preview URL for PR 1 and append /app
Local with real Supabase env: http://127.0.0.1:3000/app
```

Selection rule:
- Use the PR preview if available and configured with the savings feature flags.
- Use production only after merge/deploy or if Tyler explicitly wants production tested.
- Use local real Supabase only if the environment is already configured and the test user is safe.

- [ ] **Step 2: Confirm production/preview flags before testing savings goals**

For deployed targets, verify that both flags are present in the deployed environment before expecting goal creation:

```bash
node scripts/check-deployment-env.mjs --require-savings-goals
```

Expected:

```text
Deployment environment check passed.
```

If the command cannot inspect the deployed target or flags are missing, record that savings goal creation cannot be fairly tested on that target.

- [ ] **Step 3: Establish authenticated session**

Preferred existing path:

```bash
npm run capture:live-auth
```

This saves:

```text
/tmp/pip-live-auth.json
```

Alternative:
- Use the Codex in-app Browser if Playwright auth capture is blocked by Google.
- Keep the session in the browser; do not export or store credentials.

- [ ] **Step 4: Run authenticated smoke preflight**

```bash
PIP_LIVE_STORAGE_STATE=/tmp/pip-live-auth.json npm run check:live-smoke
```

Expected:

```text
Live authenticated smoke preflight passed.
```

If there is no saved storage state because the in-app Browser path is being used, skip this command and record the Browser-auth path in the report.

- [ ] **Step 5: Open authenticated Pip in the in-app Browser**

Use Codex in-app Browser with `iab`.

Open the selected target:

```text
https://spendwithpip.com/app
```

or the selected preview/local URL.

Expected:
- User is signed in.
- Spendable Cash Today loads.
- The app either refreshes on open or exposes a current sync state.
- Connected-data freshness is visible somewhere but does not crowd the primary number.

- [ ] **Step 6: Run a non-destructive authenticated transcript first**

Send:

```text
Why this number?
Show the math
Can I spend $50?
What about $20 instead?
What can I cut back on?
Show my bank accounts
Do I have subscriptions coming up?
```

Expected:
- Responses use the user's authenticated data where available.
- Pip does not fall back to fake placeholder banks or canned generic claims.
- Cards match the requested domain.
- No obviously stale or contradictory data appears.

- [ ] **Step 7: Run savings-goal transcript up to the write boundary**

Send:

```text
I need to save for a trip to Japan
Yes
Set the savings goal
```

Expected:
- Pip keeps the Japan goal context.
- Pip asks for target amount/date.
- Pip does not mention recurring bills unless the user asked about recurring bills.

- [ ] **Step 8: Create one controlled test goal only if safe**

Only continue if this is a test/reviewer account or Tyler has explicitly approved writes in the authenticated account.

Send:

```text
$3000 by December 1st
```

Expected:
- Pip creates a savings goal card.
- Pip gives concrete plan math.
- Pip does not claim money has been moved or held.
- Pip uses savings language, not cushion language.

Immediately send:

```text
How much do I need to hit that goal?
```

Expected:
- Pip references the same newly created Japan goal.
- Pip does not lose context.

Cleanup:
- If the UI exposes delete/archive for the test goal, delete/archive it.
- If no cleanup path exists, record the created test goal name/date in the report and flag it for manual cleanup.

- [ ] **Step 9: Test app reopen freshness**

Close or reload the app, then open it again.

Expected:
- Pip attempts current data refresh or clearly shows why it cannot.
- Spendable Cash Today is still the primary first-screen item.
- The refreshed timestamp is useful but not taking excessive space.

- [ ] **Step 10: Append Task 3 findings to the report**

Add this section:

```md
## Layer 3: Authenticated Real-Data Pass

- Target URL:
- Account type:
- Savings flags verified:
- Auth method:
- Write safety decision:
- Non-destructive transcript:
- Savings write transcript:
- Cleanup result:
- Refresh-on-open result:
- Screenshots/evidence:
- Release impact:
```

---

## Task 4: Final Triage And Recommendation

**Files:**
- Output: `/tmp/pip-direct-conversation-test-report.md`

- [ ] **Step 1: Classify every issue found**

Use this severity scale:

```md
### Severity

- Blocker: Pip loses context, creates wrong financial state, claims success without tool success, or exposes/uses wrong user's data.
- High: phone UI blocks the core chat/savings flow, app-open refresh is stale or misleading, or major routing answers are unrelated.
- Medium: copy is confusing, savings/cushion wording leaks, a card is missing but the answer is correct.
- Low: polish, spacing, or minor wording issue.
```

- [ ] **Step 2: Make the merge recommendation**

Use exactly one:

```md
## Recommendation

Merge: all three layers passed; remaining issues are low risk.
```

or:

```md
## Recommendation

Fix before merge: local/scripted behavior is solid, but phone UI or authenticated behavior has high-risk issues.
```

or:

```md
## Recommendation

Block release: Pip still loses context, misroutes financial prompts, claims false goal creation, or authenticated data behavior is unsafe.
```

- [ ] **Step 3: Attach evidence paths**

Include:

```md
## Evidence

- Eval report:
- Browser screenshots:
- Auth proof/evidence:
- PR:
- Branch:
- Commit:
```

- [ ] **Step 4: Report back to Tyler**

Final response should include:
- One-sentence verdict.
- 3-5 highest-signal findings.
- Exact report path.
- Whether the PR can move forward.
