# Restore Pip Local Chat Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` or `superpowers:executing-plans` before implementation. This file is the execution source of truth. Track progress with the checkbox steps below.

## Optimizer Record

This plan was optimized with `plan-optimizer` against this rubric:

- **Parity invariant, 25 points:** local fake-data mode and deployed mode use the same model-backed chat engine and the same user-visible chat flow. Only the data source may differ.
- **Dirty-worktree safety, 15 points:** implementation does not overwrite unrelated local work, does not use broad restore/reset commands, and records the current state before edits.
- **Testability, 20 points:** each risky behavior has a focused regression test, plus API, dogfood, build, and browser verification.
- **Sequencing and ownership, 15 points:** tasks are ordered by dependency and split so subagents cannot edit the same files concurrently.
- **Regression coverage, 15 points:** covers the exact reported failures: local refusal, fake instant answers, missing thinking animation, monthly-bill follow-up, Settings redesign, and prompt-chip variety.
- **Feasibility, 10 points:** commands are repo-native, expected outputs are stable, and failures have concrete next actions.

Score trajectory:

```text
82 -> 90 -> 94 -> 94
```

Final score: **94/100**.

Substantive changes from the previous draft:

- Removed unsafe `git restore` guidance and replaced it with inspect-then-edit steps.
- Added first-class chat-history invariants, not just visible-card facts.
- Made the plan robust to this already-dirty worktree: if a "red" test already passes, verify the code invariant and keep moving.
- Replaced brittle exact dogfood pass counts with "zero failures" gates.
- Added clearer subagent ownership and browser evidence requirements.

## Goal

Restore the invariant Tyler expects:

```text
Localhost Pip and deployed Pip use the same model-backed chat behavior.
Only data differs.
```

Local fake app mode may provide fake financial data. It must not replace Pip's agent with a deterministic local runtime, short-circuit normal questions before the model, or make chat feel instant/dead. Pip should always carry recent chat history and visible card facts into the model context so it can answer natural follow-ups without forcing a card.

## Non-Goals

- Do not redesign Settings again unless a preservation test fails.
- Do not change production data, Supabase data, or live deploy settings.
- Do not add an artificial minimum thinking delay in this pass. First restore real model-backed parity. If real model latency is still visually imperceptible, create a separate scoped plan and ask Tyler.
- Do not reintroduce any deterministic local app runtime in app source.
- Do not make localhost "nicer" than production. The target is parity.

## Current Bad State To Correct

The worktree currently includes a prior attempted repair that created local/deployed divergence:

- `src/app/api/agent/route.ts` can call `runAIAgent(agentInput, createLocalDevAgentRuntime())` in local fake app mode.
- `src/lib/agent/local-dev-runtime.ts` exists as an app-source deterministic agent replacement.
- `tests/helpers/mock-agent-runtime.ts` imports that app-source deterministic runtime.
- `src/lib/agent/ai-agent.ts` has a pre-model visible-context answer path for normal user questions.
- `src/lib/agent/model-first-policy.ts` includes `local_fake_app` as a deterministic visible-response exception.

Useful work from the branch should be preserved:

- Recent chat history is sent from the UI to `/api/agent`.
- Visible card facts are summarized into `conversationState.visibleCardFacts`.
- The model input includes recent history and visible facts.
- Chat-only no-card answers are allowed when they are model-backed.
- Settings and prompt-chip improvements remain intact.

## Hard Constraints

- Use `apply_patch` for manual edits.
- Do not run `git reset`, `git checkout --`, or `git restore` to overwrite source files.
- If a baseline file is needed, inspect it with `git show HEAD:path/to/file`, then edit intentionally.
- Do not delete or revert unrelated changes. This worktree is already dirty.
- If a focused "red" test already passes because the worktree is partially fixed, inspect the code invariant and continue.
- If local model config is missing during product verification, stop and report `missing-openai-config`. Do not add a fake fallback.
- Browser automation must use the Codex in-app Browser plugin with the `iab` backend.

## Definition Of Done

- `PIP_SUPABASE_MODE=off PIP_LOCAL_FAKE_APP_MODE=1` still calls `runAIAgent(agentInput)` with exactly one argument.
- Missing model configuration returns a clear `missing-openai-config` style failure and does not silently swap in fake Pip.
- No app-source file defines or imports `createLocalDevAgentRuntime`.
- Normal user-visible answers are model-backed unless they are an explicit outage/system exception already allowed by policy.
- `local_fake_app` is not a model-first policy exception.
- Recent chat history and visible card facts are present in Pip's model context.
- Sending a normal chat message renders the user message, shows `data-testid="agent-thinking"`, then renders the assistant response.
- "What bills are coming up?" followed by "What do those add up to?" can produce a model-backed chat-only follow-up using visible context.
- Settings first-screen and post-chat chip behavior still works.
- Focused unit tests, focused E2E, dogfood, build, and browser verification pass.

## File Ownership Map

- `src/app/api/agent/route.ts`
  - Owns HTTP validation, fake-data route context, model gate, and calling `runAIAgent`.
  - Must not choose a different runtime for local fake app mode.

- `src/lib/agent/ai-agent.ts`
  - Owns model-backed agent execution and model input construction.
  - Must include recent history and visible facts in model input.
  - Must not answer ordinary prompts before the model.

- `src/lib/agent/model-first-policy.ts`
  - Owns allowed deterministic visible exceptions.
  - Must not include `local_fake_app`.

- `src/lib/agent/visible-card-context.ts`
  - Owns compact visible-card facts for model context.
  - Keep this.

- `src/lib/agent/visible-context-answer.ts`
  - Owns the bad pre-model normal answer path.
  - Delete this unless implementation proves it is only needed for explicit outage/system behavior.

- `tests/helpers/mock-agent-runtime.ts`
  - Owns test-only model behavior.
  - It may be deterministic because it is a test helper, but it must not import app-source local runtime.

- `src/components/PipHome.tsx`
  - Owns send state, thinking state, Settings cards, chips, and calling `fetchAgentResponse`.
  - Avoid changing unless the thinking regression test proves the pending state is broken.

- `src/components/pip-home/agent-session.ts`
  - Owns `history` and `conversationState` payloads.
  - Preserve `getThreadHistory()` and `getConversationState()` behavior.

- `tests/e2e/ai-agent.spec.ts`
  - Owns browser-level chat regressions.
  - Add or strengthen thinking-state coverage here.

---

## Phase 0: Preflight And Current-State Inventory

**Purpose:** avoid repeating the failure mode where a fix silently changes localhost behavior.

- [ ] Run:

```bash
git status --short
```

Expected: the worktree is dirty. Record which files are already changed. Do not revert them.

- [ ] Run:

```bash
rg -n "createLocalDevAgentRuntime|local_fake_app|visible-context-answer|createDeterministicVisibleContextResponse" src tests
```

Expected before repair: hits in route/runtime/policy/agent/tests. These hits define what must be removed or isolated.

- [ ] Run:

```bash
rg -n "history: getThreadHistory|visibleCardFacts|formatHistoryForModel|recent_visible_card_context|agent-thinking" src tests
```

Expected: history, visible facts, and thinking hooks exist. These are invariants to preserve.

- [ ] If any expected file or symbol has drifted, update this plan locally before code edits. Do not improvise against stale snippets.

---

## Phase 1: Lock The Route Parity Invariant

**Goal:** local fake app mode can use fake data, but `/api/agent` must call the same `runAIAgent(agentInput)` path as production.

**Files:**

- `src/app/api/agent/route.test.ts`
- `src/app/api/agent/route.ts`
- `src/lib/agent/local-dev-runtime.ts`
- `tests/helpers/mock-agent-runtime.ts`

### Tests First

- [ ] In `src/app/api/agent/route.test.ts`, replace any test that expects local fake runtime behavior with a parity test:

```ts
it("does not replace the model path in local fake app mode when model config is missing", async () => {
  vi.stubEnv("PIP_SUPABASE_MODE", "off");
  vi.stubEnv("PIP_LOCAL_FAKE_APP_MODE", "1");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("OPENAI_BASE_URL", "");
  vi.stubEnv("NETLIFY_AI_GATEWAY_BASE_URL", "");
  vi.stubEnv("NETLIFY_AI_GATEWAY_KEY", "");
  routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
  routeMocks.runAIAgent.mockRejectedValue(
    new AgentUnavailableError({
      code: "missing-openai-config",
      message: "AI is not configured.",
      detail: "Set OPENAI_API_KEY, OPENAI_BASE_URL, or enable Netlify AI Gateway before using the agent.",
    }),
  );

  const response = await POST(jsonRequest({
    message: "Show the pattern assumptions behind this number",
  }));

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toMatchObject({
    code: "missing-openai-config",
    error: "AI is not configured.",
  });
  expect(routeMocks.runAIAgent).toHaveBeenCalledWith(
    expect.objectContaining({
      message: "Show the pattern assumptions behind this number",
      snapshot: fakeSnapshot,
    }),
  );
  expect(routeMocks.runAIAgent.mock.calls[0]).toHaveLength(1);
});
```

- [ ] Add or keep a positive fake-data parity test:

```ts
it("uses the normal model-backed agent path in local fake app mode when model config exists", async () => {
  vi.stubEnv("PIP_SUPABASE_MODE", "off");
  vi.stubEnv("PIP_LOCAL_FAKE_APP_MODE", "1");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  routeMocks.getCurrentFinancialSnapshot.mockResolvedValue(fakeSnapshot);
  routeMocks.runAIAgent.mockResolvedValue(createAgentResponse({
    message: "I found what changed.",
    cards: [],
    usedTools: [],
    responseMode: "chat_only",
  }));

  const response = await POST(jsonRequest({
    message: "Show the pattern assumptions behind this number",
  }));

  expect(response.status).toBe(200);
  expect(routeMocks.runAIAgent).toHaveBeenCalledWith(
    expect.objectContaining({
      message: "Show the pattern assumptions behind this number",
      snapshot: fakeSnapshot,
    }),
  );
  expect(routeMocks.runAIAgent.mock.calls[0]).toHaveLength(1);
});
```

- [ ] Run:

```bash
npm test -- src/app/api/agent/route.test.ts -t "local fake app mode"
```

Expected before implementation: at least one parity test fails if the local runtime override is still present. If the tests already pass, inspect `route.ts` and continue only if the runtime override is already gone.

### Implementation

- [ ] In `src/app/api/agent/route.ts`, remove imports for `shouldUseModel`, `createLocalDevAgentRuntime`, and `isLocalFakeAppMode` if they are only used for runtime selection.

- [ ] Replace:

```ts
const localDevRuntime = getLocalDevRuntimeForRoute();
const response = localDevRuntime
  ? await runAIAgent(agentInput, localDevRuntime)
  : await runAIAgent(agentInput);
```

with:

```ts
const response = await runAIAgent(agentInput);
```

- [ ] Delete `getLocalDevRuntimeForRoute()`.

- [ ] Delete `src/lib/agent/local-dev-runtime.ts`.

- [ ] Rewrite `tests/helpers/mock-agent-runtime.ts` as a standalone test helper. It may use deterministic branches for tests, but it must not import `@/lib/agent/local-dev-runtime`.

Do not restore the file blindly. If the previous baseline is useful, inspect it:

```bash
git show HEAD:tests/helpers/mock-agent-runtime.ts
```

Then edit the current file intentionally with `apply_patch`.

### Verification

- [ ] Run:

```bash
npm test -- src/app/api/agent/route.test.ts
```

- [ ] Run:

```bash
rg -n "createLocalDevAgentRuntime|local-dev-runtime" src tests
```

Expected: no hits. If a hit remains in app source, the phase is not complete.

---

## Phase 2: Remove Normal Pre-Model Answers

**Goal:** visible-card facts are context for Pip's model, not a reason to bypass the model.

**Files:**

- `src/lib/agent/ai-agent.test.ts`
- `src/lib/agent/ai-agent.ts`
- `src/lib/agent/visible-context-answer.ts`
- `src/lib/agent/visible-context-answer.test.ts`
- `src/lib/agent/visible-card-context.ts`
- `src/lib/agent/visible-card-context.test.ts`

### Tests First

- [ ] Add a regression test in `src/lib/agent/ai-agent.test.ts` proving visible facts go through the runtime:

```ts
it("sends visible card facts to the model for cardless follow-up answers", async () => {
  const visibleCardFacts = [
    {
      type: "recurring_activity" as const,
      title: "Recurring activity",
      facts: [
        "Visible recurring expense total: $18.99.",
        "Visible recurring income total: $0.00.",
      ],
      values: [
        {
          id: "recurring-expense-total",
          label: "Visible recurring expense total",
          amountCents: 1899,
          confidence: "high" as const,
        },
      ],
    },
  ];
  const runtime = {
    run: vi.fn(async () => ({
      message: "Those visible monthly bills add up to $18.99.",
      cards: [],
      promptChips: [],
      usedTools: [],
      responseMode: "chat_only" as const,
      audit: {
        toolNames: [],
        usedModel: true,
        model: "test-model",
        transport: "openai-direct" as const,
      },
    })),
  };

  const response = await runAIAgent(
    {
      message: "What do these monthly bills add up to?",
      history: [
        { role: "user", content: "What bills are coming up?" },
        { role: "assistant", content: "I found recurring activity." },
      ],
      conversationState: {
        visibleCardFacts,
      },
    },
    runtime,
  );

  expect(runtime.run).toHaveBeenCalledWith(
    expect.objectContaining({
      message: "What do these monthly bills add up to?",
      history: expect.arrayContaining([
        { role: "user", content: "What bills are coming up?" },
      ]),
      conversationState: expect.objectContaining({
        visibleCardFacts,
      }),
    }),
  );
  expect(response).toMatchObject({
    message: "Those visible monthly bills add up to $18.99.",
    cards: [],
    responseMode: "chat_only",
    audit: {
      usedModel: true,
    },
  });
});
```

- [ ] Add or keep a source-shape invariant test that prevents history from being dropped from model input:

```ts
it("keeps recent chat history and visible facts in the model input", () => {
  const source = readFileSync(new URL("./ai-agent.ts", import.meta.url), "utf8");
  const inputSource = source.slice(
    source.indexOf("function createAgentInput"),
    source.indexOf("function formatHistoryForModel"),
  );

  expect(inputSource).toContain("...formatHistoryForModel(input.history)");
  expect(inputSource).toContain("recent_visible_card_facts");
  expect(inputSource).toContain("recent_visible_card_context");
});
```

- [ ] Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts -t "visible card facts|recent chat history"
```

Expected before implementation: the visible-facts runtime test fails if the pre-model answer path still bypasses the runtime. If it already passes, inspect `ai-agent.ts` and continue only if the bypass is gone.

### Implementation

- [ ] In `src/lib/agent/ai-agent.ts`, remove the import from `@/lib/agent/visible-context-answer`.

- [ ] Remove this early return from `runAIAgent()`:

```ts
const visibleContextResponse = createDeterministicVisibleContextResponse(input);

if (visibleContextResponse) {
  return visibleContextResponse;
}
```

- [ ] Delete `createDeterministicVisibleContextResponse()`.

- [ ] Remove `createDeterministicVisibleContextResponse` from `__agentTestHooks`.

- [ ] Delete:

```text
src/lib/agent/visible-context-answer.ts
src/lib/agent/visible-context-answer.test.ts
```

- [ ] Keep:

```text
src/lib/agent/visible-card-context.ts
src/lib/agent/visible-card-context.test.ts
```

### Verification

- [ ] Run:

```bash
npm test -- src/lib/agent/ai-agent.test.ts src/lib/agent/visible-card-context.test.ts
```

- [ ] Run:

```bash
rg -n "visible-context-answer|createDeterministicVisibleContextResponse" src tests
```

Expected: no hits.

---

## Phase 3: Remove The Local Fake App Policy Exception

**Goal:** model-first policy cannot be bypassed just because the app is local.

**Files:**

- `src/lib/agent/model-first-policy.test.ts`
- `src/lib/agent/model-first-policy.ts`
- `src/lib/agent/ai-agent.ts`
- `src/lib/agent/ai-agent.test.ts`

### Tests First

- [ ] Add a regression test:

```ts
it("does not allow local fake app to bypass model-first visible response policy", () => {
  const response = createResponse({
    message: "I found what changed.",
    usedModel: false,
    usedTools: ["get_pip_cash_drivers"],
    responseMode: "show_card",
    cards: [
      {
        type: "pip_cash_explanation",
        title: "Spendable Cash Today",
        summary: "The number changed because spending changed.",
        drivers: [],
        warnings: [],
        dataStates: [],
      },
    ],
  });

  expect(getModelFirstViolation({
    requestKind: "chat",
    userMessage: "Show the pattern assumptions behind this number",
    response,
    deterministicException: "local_fake_app" as never,
  })).toMatchObject({
    code: "deterministic_visible_response",
  });
});
```

- [ ] Run:

```bash
npm test -- src/lib/agent/model-first-policy.test.ts -t "local fake app"
```

Expected before implementation: fails if `local_fake_app` is still accepted.

### Implementation

- [ ] In `src/lib/agent/model-first-policy.ts`, remove `local_fake_app` from `DeterministicVisibleException`.

- [ ] In `src/lib/agent/ai-agent.ts`, keep `deterministicVisibleException?: DeterministicVisibleException` only for explicit system/outage test runtimes. Do not add a replacement localhost exception.

### Verification

- [ ] Run:

```bash
npm test -- src/lib/agent/model-first-policy.test.ts src/lib/agent/ai-agent.test.ts
```

- [ ] Run:

```bash
rg -n "local_fake_app" src tests
```

Expected: no hits.

---

## Phase 4: Protect The Thinking Animation

**Goal:** after sending a normal message, the UI must show Pip thinking before the assistant answer appears.

**Files:**

- `tests/e2e/ai-agent.spec.ts`
- `src/components/PipHome.tsx`
- `src/components/AgentThread.tsx`

### Tests First

- [ ] Inspect existing thinking coverage:

```bash
rg -n "agent-thinking|waitForAgentResponse|Ask Pip" tests/e2e/ai-agent.spec.ts
```

- [ ] Add or strengthen an E2E test with a deliberately delayed `/api/agent` response. The test must assert this order:

```text
1. User sends "Show the pattern assumptions behind this number".
2. The user's message appears.
3. data-testid="agent-thinking" appears while /api/agent is pending.
4. The assistant response appears after the delay.
5. data-testid="agent-thinking" disappears after the response.
```

- [ ] The route mock must delay only chat responses. It should answer `prompt_chips` and `opening_bubble` requests immediately enough that the app can load.

- [ ] Run:

```bash
npx playwright test tests/e2e/ai-agent.spec.ts -g "thinking"
```

Expected: passes. If it fails because the bubble never appears, inspect `PipHome.tsx` send-state timing first. Edit `AgentThread.tsx` only if render logic is wrong.

### Implementation Guardrail

- [ ] Do not add artificial dwell time in this phase.

- [ ] Do not make chat feel slower with local-only timing.

- [ ] If real model responses are still visually imperceptible after parity is restored, write a separate local plan for a product-level minimum dwell and ask Tyler before implementing it.

---

## Phase 5: Preserve Chat Context From UI To Model

**Goal:** Pip always has recent chat context in its model window for ordinary chat.

**Files:**

- `src/components/pip-home/agent-session.test.ts`
- `src/components/pip-home/agent-session.ts`
- `src/app/api/agent/route.test.ts`
- `src/lib/agent/ai-agent.test.ts`
- `src/lib/agent/ai-agent.ts`

### Tests First

- [ ] Ensure `agent-session.test.ts` covers `getThreadHistory()`:

```text
Given multiple prior user/assistant turns,
getThreadHistory(thread) returns the last 8 role/content items.
```

- [ ] Ensure `fetchAgentResponse()` sends both:

```text
history: getThreadHistory(thread)
conversationState: getConversationState(...)
```

- [ ] Ensure the route test passes a sample `history` and asserts `runAIAgent` receives it unchanged after validation:

```ts
expect(routeMocks.runAIAgent).toHaveBeenCalledWith(
  expect.objectContaining({
    history: [
      { role: "user", content: "What bills are coming up?" },
      { role: "assistant", content: "I found recurring activity." },
    ],
  }),
);
```

- [ ] Ensure `ai-agent.test.ts` protects the model-input shape:

```text
createAgentInput includes ...formatHistoryForModel(input.history)
createAgentInput includes recent_visible_card_context
formatHistoryForGrounding slices to the last 8 messages and truncates content to 500 chars
```

If the existing code already satisfies these invariants, add tests only where coverage is missing. Do not refactor the history pipeline.

### Verification

- [ ] Run:

```bash
npm test -- src/components/pip-home/agent-session.test.ts src/app/api/agent/route.test.ts src/lib/agent/ai-agent.test.ts
```

---

## Phase 6: Preserve Settings And Prompt Chips

**Goal:** do not lose the already-improved Settings surface or chip behavior while repairing chat parity.

**Files:**

- `src/components/PipHome.tsx`
- `src/components/PipHome.test.tsx`
- `src/components/cards/CardRenderer.tsx`
- `src/components/cards/CardRenderer.test.tsx`
- `src/lib/agent/prompt-chip-planner.ts`
- `src/lib/agent/prompt-chip-planner.test.ts`
- `src/lib/agent/suggested-prompts.test.ts`

### Verification

- [ ] Run:

```bash
npm test -- src/components/PipHome.test.tsx src/components/cards/CardRenderer.test.tsx src/lib/agent/prompt-chip-planner.test.ts src/lib/agent/suggested-prompts.test.ts
```

- [ ] Confirm first-screen chips include Settings.

- [ ] Confirm Settings card remains action-first and includes:

```text
Account & data
Trust receipt
Support
Privacy & legal
```

- [ ] Confirm post-chat chips are not forced to include Settings every time.

- [ ] Confirm prompt chips still point users into varied, useful conversations, not only account/setup actions.

Do not redesign this area in this plan unless a preservation test fails.

---

## Phase 7: Local Model Configuration Clarity

**Goal:** make local parity requirements explicit for future workers.

**Files:**

- `.env.example`
- `src/app/api/agent/route.test.ts`

- [ ] In `.env.example`, add comments above model env vars:

```text
# Pip chat uses the same model-backed agent path locally and in production.
# For local fake-data dogfood, set PIP_SUPABASE_MODE=off and PIP_LOCAL_FAKE_APP_MODE=1,
# then configure one model transport below. Missing model config must fail visibly;
# do not add deterministic local agent fallbacks.
```

- [ ] Keep model env vars as the transport knobs:

```text
OPENAI_API_KEY=
OPENAI_BASE_URL=
NETLIFY_AI_GATEWAY_BASE_URL=
NETLIFY_AI_GATEWAY_KEY=
```

- [ ] Verify route tests cover both configured and missing model local fake app behavior.

---

## Phase 8: Focused API And Dogfood Verification

**Goal:** verify the exact user-reported conversation path without relying only on unit tests.

### Server Setup

- [ ] Inspect existing local servers:

```bash
pgrep -af "next dev|npm run dev|next-server"
```

- [ ] If port 3000 is already occupied by this exact worktree, stop that process by exact PID. If it belongs to another worktree or user process, use a different port such as 3001.

- [ ] Start local fake-data app with real model config:

```bash
PIP_SUPABASE_MODE=off PIP_LOCAL_FAKE_APP_MODE=1 npm run dev -- --webpack -p 3000
```

If the API returns `missing-openai-config`, stop verification and configure a real local model transport. Do not add a fallback runtime.

### API Checks

- [ ] Verify the pattern prompt:

```bash
curl -s http://127.0.0.1:3000/api/agent \
  -H 'content-type: application/json' \
  --data '{"message":"Show the pattern assumptions behind this number","conversationId":"parity-pattern","history":[],"conversationState":{"shownCards":[],"lastToolNames":[],"promptChips":[]}}'
```

Expected:

```text
status 200
audit.usedModel true
no model value like "local-dev-runtime"
no "I can't reach the answer service" message
```

- [ ] Verify recurring activity follow-up with visible context:

```bash
curl -s http://127.0.0.1:3000/api/agent \
  -H 'content-type: application/json' \
  --data '{"message":"What do those add up to?","conversationId":"parity-recurring","history":[{"role":"user","content":"What bills are coming up?"},{"role":"assistant","content":"I found recurring activity."}],"conversationState":{"shownCards":[{"type":"recurring_activity","title":"Recurring activity"}],"visibleCardFacts":[{"type":"recurring_activity","title":"Recurring activity","facts":["Visible recurring expense total: $18.99."],"values":[{"id":"recurring-expense-total","label":"Visible recurring expense total","amountCents":1899,"confidence":"high"}]}],"lastToolNames":["get_recurring_activity"],"promptChips":[]}}'
```

Expected:

```text
status 200
audit.usedModel true
responseMode may be "chat_only"
message answers the total or explains the visible-context scope
```

### Dogfood

- [ ] Run focused recurring-total dogfood:

```bash
PIP_AGENT_EVAL_CASE_IDS=major-multiturn-recurring-aggregate-followup npm run eval:agent -- --suite major-capabilities-multiturn
```

Expected: zero failures for `major-multiturn-recurring-aggregate-followup`.

- [ ] Run router dogfood:

```bash
npm run dogfood:router
```

Expected: zero failures. Do not hard-code a pass count; the fixture count can drift.

---

## Phase 9: In-App Browser Product Verification

**Goal:** prove localhost feels like Pip again, not just that APIs return JSON.

Use the Codex in-app Browser plugin with `iab`.

- [ ] Open:

```text
http://localhost:3000/app
```

- [ ] First-screen checks:

```text
Spendable Cash Today is visible.
Settings appears as a first-screen chip.
The page does not show "Pip access is temporarily unavailable".
The page does not show "I can't reach the answer service".
```

- [ ] Thinking-flow check:

```text
Send: Show the pattern assumptions behind this number
```

Expected:

```text
The user message appears.
Pip thinking appears before the assistant response.
The assistant response appears after thinking.
Pip thinking disappears after the assistant response.
The response is not instant deterministic filler.
The response network payload has audit.usedModel=true.
```

- [ ] Recurring follow-up check:

```text
Send: What bills are coming up?
Then send: What do those add up to?
```

Expected:

```text
The first response can show recurring activity.
The second response can be chat-only.
The second response uses chat history or visible facts.
The second response network payload has audit.usedModel=true.
```

- [ ] Settings check:

```text
Click Settings.
```

Expected:

```text
Settings card shows grouped actions.
Account & data appears.
Trust receipt appears.
Support appears.
Privacy & legal appears.
The old text-box-heavy layout is absent.
```

- [ ] Save browser evidence in the implementation notes: URL, prompt sequence, response result, and whether `agent-thinking` was observed.

---

## Phase 10: Full Verification Gate

- [ ] Run focused tests from changed areas:

```bash
npm test -- src/app/api/agent/route.test.ts src/lib/agent/ai-agent.test.ts src/lib/agent/model-first-policy.test.ts src/lib/agent/visible-card-context.test.ts src/components/pip-home/agent-session.test.ts src/components/PipHome.test.tsx src/components/cards/CardRenderer.test.tsx src/lib/agent/prompt-chip-planner.test.ts src/lib/agent/suggested-prompts.test.ts
```

- [ ] Run full unit suite:

```bash
npm test
```

Expected: zero failures, except any explicitly skipped tests that already exist.

- [ ] Run focused E2E:

```bash
npx playwright test tests/e2e/ai-agent.spec.ts -g "thinking"
```

- [ ] Run focused recurring-total eval:

```bash
PIP_AGENT_EVAL_CASE_IDS=major-multiturn-recurring-aggregate-followup npm run eval:agent -- --suite major-capabilities-multiturn
```

- [ ] Run router dogfood:

```bash
npm run dogfood:router
```

- [ ] Run production build:

```bash
npm run build
```

- [ ] Run diff hygiene:

```bash
git diff --check
git status --short
```

Expected:

```text
git diff --check exits 0.
No src/lib/agent/local-dev-runtime.ts remains.
No visible-context-answer source/test remains.
No app source imports local-dev-runtime.
No local_fake_app exception remains.
Only intentional files are changed.
```

---

## Subagent Execution Split

Use subagents only after Phase 0 inventory is complete.

- **Subagent A:** Phase 1 route/runtime parity.
  - Owns `src/app/api/agent/route.ts`, `src/app/api/agent/route.test.ts`, `tests/helpers/mock-agent-runtime.ts`, and deletion of `src/lib/agent/local-dev-runtime.ts`.

- **Subagent B:** Phases 2 and 3 model-first repair.
  - Owns `src/lib/agent/ai-agent.ts`, `src/lib/agent/ai-agent.test.ts`, `src/lib/agent/model-first-policy.ts`, `src/lib/agent/model-first-policy.test.ts`, and deletion of visible-answer files.

- **Subagent C:** Phases 4 and 9 thinking/browser verification.
  - Owns `tests/e2e/ai-agent.spec.ts` and browser evidence collection.
  - May inspect `PipHome.tsx` and `AgentThread.tsx`, but should not edit them unless the test proves a UI bug.

- **Main agent:** Phases 0, 5, 6, 7, 8, and 10.
  - Integrates changes, protects Settings/chips, runs dogfood/build, manages the dev server, and writes the final status.

Do not let two agents edit `src/lib/agent/ai-agent.ts` or `src/app/api/agent/route.ts` concurrently.

## Rollback Plan

If local `/api/agent` stops working:

1. Do not restore `createLocalDevAgentRuntime`.
2. Confirm real model env vars are configured.
3. Fix the model gate or error handling while keeping `runAIAgent(agentInput)` as the only route path.

If visible-card follow-up regresses:

1. Do not restore pre-model visible answers.
2. Keep visible facts and history in model context.
3. Strengthen model instructions or forced-tool/context routing.
4. Re-run the recurring-total eval and Browser follow-up check.

If thinking still feels instant after real model parity:

1. Capture in-app Browser evidence.
2. Compare network timing and render timing.
3. Ask Tyler before adding a global minimum thinking dwell.
4. If approved, implement dwell as a separate task with E2E coverage.

If Settings/chips regress:

1. Restore the intended Settings and chip behavior surgically from the current branch diff.
2. Do not change agent runtime behavior while fixing Settings.
3. Re-run the Settings/chip tests and Browser Settings check.

## Final Report Requirements

When implementation is complete, report:

- Which local runtime/pre-model bypass files were removed.
- Which tests/dogfood/build commands passed.
- Browser evidence for the thinking flow.
- Whether localhost used `audit.usedModel=true`.
- Any commands that could not run and why.

Do not claim parity without both automated verification and in-app Browser evidence.
