# Pip Direct Conversation Testing Optimized Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for delegated execution. Browser work must use the Codex in-app Browser plugin with the `iab` backend first.

**Goal:** Talk to Pip directly and produce a release-quality evidence report covering scripted API transcripts, phone-sized local UI behavior, and authenticated real-data readiness/behavior.

**Architecture:** Run a gated three-layer test ladder. Layer 1 proves the agent contract through repeatable local tests and eval transcripts. Layer 2 proves the actual phone UI through the Codex in-app Browser against the local feature branch. Layer 3 proves authenticated behavior only when auth state and a safe test account are available; otherwise it records a precise blocker instead of faking coverage.

**Tech Stack:** Next.js, `/api/agent`, Vitest, repo-native Playwright E2E, Codex in-app Browser `iab`, Supabase-backed auth where available, markdown evidence report under `/tmp`.

---

## Optimizer Summary

### Rubric

- **Conversation fidelity (25):** The plan must catch context loss, false success claims, wrong tool/card routing, and old cushion language.
- **Layer realism (20):** The plan must escalate from deterministic API checks to real UI and authenticated state without confusing what each layer proves.
- **Execution safety (15):** The plan must avoid dirty-main contamination, port/browser conflicts, destructive authenticated writes, and accidental user-data changes.
- **Evidence quality (15):** The plan must require exact prompts, tool/card evidence, screenshots, failure text, and one final verdict.
- **Parallelization fit (10):** The plan must use subagents only for independent work and keep shared browser/dev-server work coordinated.
- **Feasibility (10):** Commands must match the repo's actual CLIs and known feature branch.
- **Triage usefulness (5):** Findings must map to merge/fix/block release decisions.

### Score Trajectory

`78 -> 90 -> 94 -> 94`

### Accepted Improvements

- Replaced unsupported eval CLI flags with the repo's actual env-var based eval controls.
- Split work into parallel-safe subagent lanes and serialized browser/auth work where shared state matters.
- Added a hard distinction between "authenticated pass completed" and "authenticated pass blocked by missing safe auth state."
- Added a single evidence schema so subagent outputs can be merged without losing prompt-level results.

---

## Branch And Environment Contract

All test execution must use the feature worktree:

```bash
cd /tmp/FreeCash-pip-savings-context-state-machine
git status --short --branch
git log --oneline --decorate -2
```

Expected:

```text
## codex/pip-savings-context-state-machine...origin/codex/pip-savings-context-state-machine
bb1e55f ... fix: stabilize Pip savings goal conversations
```

Do not use the dirty main checkout at `/home/tyler/Documents/FreeCash` for test execution.

Shared output paths:

```text
/tmp/pip-direct-conversation-test-report.md
/tmp/pip-agent-eval-report.json
/tmp/pip-direct-conversation-artifacts/
```

Create the artifact directory before testing:

```bash
mkdir -p /tmp/pip-direct-conversation-artifacts
```

## Core Prompt Matrix

Run these exact prompts unless a layer-specific task says otherwise.

### Savings Goal Context

```text
I need to save for a trip to Japan
Yes
Set the savings goal
$3000 by December 1st
How much do I need to hit that goal?
```

Pass criteria:
- The first three turns preserve a `create_savings_goal` pending action or equivalent visible context.
- `Yes` and `Set the savings goal` do not route to recurring bills, subscriptions, or unrelated advice.
- Pip does not claim the goal was created before `create_savings_goal` succeeds and a savings goal card/result exists.
- The final progress question resolves `that goal` to Japan.
- Pip uses savings language, not cushion language.

### Spendable Cash Regression

```text
Can I spend $50?
What about $20 instead?
Why this number?
Show the math
```

Pass criteria:
- Purchase prompts use purchase simulation.
- Follow-up amount keeps the prior spend context.
- Explanation/math prompts return the expected deterministic cards.
- Pip avoids hard guarantee/permission language.

### Routing Guardrails

```text
What can I cut back on?
How do I lower my spending without feeling miserable?
What does Android cost?
Do I have subscriptions coming up?
Show my bank accounts
```

Pass criteria:
- Cutback prompts do not become savings goals.
- Android/pricing/support prompts do not become savings goals.
- Recurring prompts return recurring activity.
- Bank-account prompts return connected accounts without placeholder names.

### Phone Freshness And Layout

Pass criteria:
- `/app` opens with Spendable Cash Today as the dominant first-screen signal.
- The chat input remains reachable on a `390 x 844` viewport.
- No horizontal overflow.
- Refreshed-data text is useful but not visually dominating the number.
- Reload during a pending draft either preserves context when persistence is available or fails gracefully without unrelated routing.

## Evidence Schema

Every worker writes a markdown section with this shape:

```md
## Layer Name

- Worker:
- Branch:
- Commit:
- Base URL:
- Commands run:
- Prompt results:
  - Prompt:
  - Result: PASS | FAIL | BLOCKED
  - Evidence:
  - Notes:
- Artifacts:
- Bugs:
  - Severity:
  - Repro:
  - Expected:
  - Actual:
  - Suggested owner:
- Layer verdict: PASS | FAIL | BLOCKED
```

The controller merges sections into:

```text
/tmp/pip-direct-conversation-test-report.md
```

## Task 0: Controller Preflight

**Owner:** Main agent.

- [ ] Confirm the feature worktree exists and is clean.
- [ ] Confirm `node_modules` is available. If the worktree has no `node_modules`, create a temporary symlink to `/home/tyler/Documents/FreeCash/node_modules` and remove it before final closeout.
- [ ] For local savings-goal testing, start the dev server with both savings feature flags enabled:
  `PIP_SAVINGS_GOALS_ENABLED=true NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=true`.
- [ ] Create `/tmp/pip-direct-conversation-artifacts`.
- [ ] Start a local dev server only once when browser/API layers need it.
- [ ] Track server PID/session and stop it before final closeout.

Preflight commands:

```bash
cd /tmp/FreeCash-pip-savings-context-state-machine
git status --short --branch
test -e node_modules || ln -s /home/tyler/Documents/FreeCash/node_modules node_modules
mkdir -p /tmp/pip-direct-conversation-artifacts
```

## Task 1: Scripted API And Eval Transcript Pass

**Owner:** Subagent worker.  
**Workdir:** `/tmp/FreeCash-pip-savings-context-state-machine`  
**Parallel safety:** Can run independently before interactive Browser testing. Do not edit files.

- [ ] Run focused tests:

```bash
npm test -- \
  scripts/eval-agent.test.ts \
  src/lib/agent/ai-agent.test.ts \
  src/app/api/agent/route.test.ts \
  src/lib/data/agent-chat-turns.test.ts \
  src/lib/savings-goals/draft.test.ts
```

- [ ] If a local server is already running on `http://localhost:3001`, use it. Otherwise start one:

```bash
PIP_SUPABASE_MODE=off \
PIP_SAVINGS_GOALS_ENABLED=true \
NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=true \
npm run dev -- --webpack -p 3001
```

- [ ] Run the eval harness:

```bash
PIP_AGENT_EVAL_BASE_URL=http://localhost:3001 \
PIP_AGENT_EVAL_REPORT=/tmp/pip-agent-eval-report.json \
npm run eval:agent
```

- [ ] Inspect the Japan transcript:

```bash
node -e "const report=require('/tmp/pip-agent-eval-report.json'); const item=(report.cases||[]).find(c=>c.id==='phone-savings-japan-context'); console.log(JSON.stringify(item ?? report, null, 2));"
```

Required findings:
- `phone-savings-japan-context` is present.
- First three turns keep `create_savings_goal` pending state.
- Amount/date turn uses `create_savings_goal`.
- Final progress turn uses `list_savings_goals`.
- No false goal-created claim appears without tool/card evidence.

Write:

```text
/tmp/pip-direct-conversation-artifacts/layer-1-scripted.md
```

## Task 2: Repo-Native Phone E2E Pass

**Owner:** Subagent worker.  
**Workdir:** `/tmp/FreeCash-pip-savings-context-state-machine`  
**Parallel safety:** Can run independently from Task 1 if port `3000` is free. If a dev server is already running, wait or report blocked instead of killing it. Do not edit files.

- [ ] Run the focused phone E2E:

```bash
npm run test:e2e -- tests/e2e/ai-agent.spec.ts -g "Japan savings goal"
```

Expected:

```text
1 passed
```

- [ ] If it fails, capture:
  - failing assertion
  - Playwright trace path
  - screenshot/video path if emitted

Write:

```text
/tmp/pip-direct-conversation-artifacts/layer-2-e2e.md
```

## Task 3: Interactive Local Phone UI Pass

**Owner:** Main agent, because the shared in-app Browser session must be coordinated directly.  
**Workdir:** `/tmp/FreeCash-pip-savings-context-state-machine`  
**Tooling:** Codex in-app Browser plugin with `iab` backend first.

- [ ] Ensure local server is running:

```bash
PIP_SUPABASE_MODE=off \
PIP_SAVINGS_GOALS_ENABLED=true \
NEXT_PUBLIC_SAVINGS_GOALS_ENABLED=true \
npm run dev -- --webpack -p 3001
```

- [ ] Open in the in-app Browser:

```text
http://localhost:3001/app
```

- [ ] Set viewport to `390 x 844`.
- [ ] Send the full Core Prompt Matrix through the visible chat UI.
- [ ] Capture screenshots after:
  - initial load
  - after `Yes`
  - after `$3000 by December 1st`
  - after `How much do I need to hit that goal?`
  - after `What does Android cost?`
- [ ] Test reload during a pending draft:

```text
I need to save for a trip to Japan
Reload the page.
Yes
```

Required findings:
- Whether UI context is preserved.
- Whether visible response is related.
- Whether cards match expectations.
- Whether layout stays usable.
- Whether freshness text crowds the first viewport.

Write:

```text
/tmp/pip-direct-conversation-artifacts/layer-3-browser-ui.md
```

## Task 4: Authenticated Real-Data Readiness And Pass

**Owner:** Subagent for readiness checks, main agent for any Browser-authenticated interaction.  
**Workdir:** `/tmp/FreeCash-pip-savings-context-state-machine`  
**Safety:** Do not create a real savings goal unless the authenticated session is a test/reviewer account or Tyler explicitly approves writes.

### Task 4A: Readiness Worker

- [ ] Check whether `/tmp/pip-live-auth.json` exists.
- [ ] Run preflight if it exists:

```bash
PIP_LIVE_STORAGE_STATE=/tmp/pip-live-auth.json npm run check:live-smoke
```

- [ ] Check local docs/scripts for required live target rules:

```bash
rg -n "PIP_LIVE_STORAGE_STATE|capture:live-auth|PIP_LIVE_BASE_URL|PIP_LIVE_COMPLETE_PLAID" README.md scripts tests/e2e
```

- [ ] Check deploy flag requirements locally:

```bash
node scripts/check-deployment-env.mjs --require-savings-goals
```

If that command fails because env vars are absent locally, record that deployment flag verification is blocked locally. Do not treat missing local env as an app failure.

Write:

```text
/tmp/pip-direct-conversation-artifacts/layer-4-auth-readiness.md
```

### Task 4B: Authenticated Browser Pass

Only run if a safe authenticated session is available.

- [ ] Open target:

```text
https://spendwithpip.com/app
```

or the exact approved preview/local authenticated URL.

- [ ] Run non-destructive prompts:

```text
Why this number?
Show the math
Can I spend $50?
What about $20 instead?
What can I cut back on?
Show my bank accounts
Do I have subscriptions coming up?
```

- [ ] Run savings setup to the write boundary:

```text
I need to save for a trip to Japan
Yes
Set the savings goal
```

- [ ] Stop before `$3000 by December 1st` unless write safety is confirmed.
- [ ] If write safety is confirmed, send:

```text
$3000 by December 1st
How much do I need to hit that goal?
```

- [ ] Cleanup created test goal if the UI exposes cleanup. If no cleanup exists, record the exact created test goal for manual cleanup.

Write:

```text
/tmp/pip-direct-conversation-artifacts/layer-4-auth-browser.md
```

If no safe authenticated session is available, write `BLOCKED` with the exact missing prerequisite.

## Task 5: Final Synthesis

**Owner:** Main agent.

- [ ] Merge all layer artifacts into `/tmp/pip-direct-conversation-test-report.md`.
- [ ] Classify every issue:
  - **Blocker:** context loss, false goal creation claim, wrong financial state, wrong user data, unsafe authenticated write.
  - **High:** core phone chat unusable, stale/misleading app-open refresh, major routing answer unrelated.
  - **Medium:** confusing copy, cushion wording leak, missing but non-critical card.
  - **Low:** polish, spacing, minor wording.
- [ ] Make exactly one recommendation:
  - `Merge`
  - `Fix before merge`
  - `Block release`
- [ ] Include evidence paths, screenshots, commands, branch, commit, PR.
- [ ] Stop the local dev server and remove temporary `node_modules` symlink if created.
- [ ] Run final `git status --short --branch` in the feature worktree and record it.

Final report template:

```md
# Pip Direct Conversation Test Report

## Verdict

Recommendation: Merge | Fix before merge | Block release

## Environment

- Branch:
- Commit:
- PR:
- Local URL:
- Authenticated target:
- Test date:

## Layer Results

- Scripted API/eval:
- Repo-native phone E2E:
- In-app Browser phone UI:
- Authenticated real-data:

## Findings

### Blocker

### High

### Medium

### Low

## Evidence

- Eval report:
- Layer artifacts:
- Screenshots:
- Browser/auth evidence:

## Raw Transcript Notes
```
