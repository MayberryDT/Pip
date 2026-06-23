# Restore Pip Local Chat Parity Verification Notes

Generated: 2026-06-23T00:53:32Z
Updated: 2026-06-23T01:11:00Z

## Current Completion Status

Implementation and verification are complete for the local parity repair. The local dev server was verified with a transient model transport configuration supplied outside the repository. No model key was written to this worktree.

## Current Evidence

- `rg -n "createLocalDevAgentRuntime|local-dev-runtime|visible-context-answer|createDeterministicVisibleContextResponse|local_fake_app" src tests`
  - Result: no matches.
- Local API check:
  - Request: `POST http://127.0.0.1:3000/api/agent`
  - Message: `Show the pattern assumptions behind this number`
  - Result: HTTP 200.
  - Audit: `usedModel=true`, `transport=openai-direct`, `model=gpt-5-nano`, `usedTools=["get_pattern_assumptions"]`.
  - Interpretation: localhost is using the normal model-backed agent path, not the removed fake local runtime.

## Verified Automated Gates

- Focused route/model/context tests: `npm test -- src/lib/agent/ai-agent.test.ts src/lib/agent/model-first-policy.test.ts src/lib/agent/visible-card-context.test.ts src/app/api/agent/route.test.ts`
  - Result: 4 files passed, 162 tests passed.
- Focused live eval: `PIP_AGENT_EVAL_CASE_IDS=major-multiturn-recurring-aggregate-followup npm run eval:agent -- --suite major-capabilities-multiturn`
  - Result: `PASS major-multiturn-recurring-aggregate-followup`.
  - Note: the first sandboxed run could not reach localhost (`HTTP 0; fetch failed`), so the same command was rerun unsandboxed for local API access and passed.
- `npm test`: passed, 187 files passed, 4,769 tests passed, 1 skipped.
- `npm run dogfood:router`: passed, 3,428 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.

## In-App Browser Evidence

Observed with Codex in-app Browser (`iab`) against `http://localhost:3000/app`:

- First screen showed `Spendable Cash Today`, `$104`, `Accounts`, `Settings`, and `What pattern are you using?`.
- First screen did not show `Pip access is temporarily unavailable`.
- First screen did not show the answer-service error before chat.
- Clicking `Settings` rendered the grouped Settings card with:
  - `Account & data`
  - `Trust receipt`
  - `Support`
  - `Privacy & legal`
- Sending `Show the pattern assumptions behind this number` rendered the user message, showed `data-testid="agent-thinking"`, then rendered a model-backed pattern-assumptions answer.
- The pattern prompt did not show the answer-service error or `missing-openai-config`.
- Sending `What bills are coming up?` showed `data-testid="agent-thinking"` and rendered a recurring-bills response/card from the local fake data set.
- Sending `What's the total of these monthly bills?` showed `data-testid="agent-thinking"` and rendered a chat answer: `$0.00` across 0 items for this local fake data set.
- The recurring follow-up did not refuse, did not show the answer-service error, and did not show `missing-openai-config`.
- Browser body did not include `Mock model response` or `local-dev-runtime`.

## Follow-Up Dogfood Repair

2026-06-23T01:40:00Z:

- Local chat logs are available in Supabase-off local mode at `/tmp/pip-agent-chat-turns.jsonl`.
- The dogfood chat log captured:
  - `What bills are coming up?` returned internal/meta wording plus a literal `null`.
  - `What stands out here?` hit `invalid-agent-output` with `card promised without card`, which the client surfaced as fallback copy.
- Added visible-response guard regressions for:
  - trailing `null` and `{}` artifacts,
  - generic `Here’s the card:` promises without a card,
  - internal missing-data/card self-talk,
  - off-topic pattern-assumptions bridge text when a recurring-activity card is shown.
- Replaced visible fallback copy that said `I couldn’t answer that cleanly` with `I need another pass at that. Please ask again.`
- Replayed the chip sequence in the in-app Browser:
  - `What pattern are you using?`
  - `What bills are coming up?`
  - `What stands out here?`
- Result: no answer-service error, no refusal copy, no internal missing-data/card self-talk, no literal `null`/`{}` artifacts. The recurring turn rendered `I do not see a clear repeat item yet.` before the recurring-activity card.
