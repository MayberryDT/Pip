# Pip Mobile Chat And Cutback Polish Implementation Plan

## Status

Plan only. Do not implement until Tyler explicitly approves.

## Evidence From Investigation

- Production `agent_chat_turns` shows `What can I do to save more money?` at `2026-06-16 18:16:28Z` returned no tools, no cards, and an `openai-request-failed` / model-output validation error for `message` over the 260 character limit. The phone UI mapped that to `I can’t reach the answer service right now. Try again in a moment.`
- Production `agent_chat_turns` shows `How can I cut back?` at `2026-06-16 18:17:25Z` correctly used `get_spending_opportunity` and returned an `insight_card`, but the visible message started with `General_services:general_services_other_general_services`.
- Current cutback routing only matches phrases like `cut back`, `spend less`, `save money`, `overspending`, `waste`, and `trim`. It does not match `save more money`.
- `src/lib/pip-cash/spending-opportunities.ts` falls back to title-casing raw provider categories, so Plaid taxonomy strings can leak into user-facing labels.
- `src/lib/agent/tool-runner.ts` exposes internal reason codes in the cutback card footer.
- `src/components/AgentInput.tsx` calls `resetComposerViewport()` after submit and again after the submit promise settles; that function focuses the textarea, which keeps the mobile keyboard open after sending.
- `.pip-chat-shell` is fixed at `height: 100dvh; max-height: 100dvh; overflow: hidden;` and does not react to `window.visualViewport`, so mobile keyboards can overlay the composer.
- `CardRenderer` and chat bubbles do not apply a shared long-token wrapping class, so code-like strings can overflow the card/message width.

## Optimized Implementation Plan

### 1. Turn The Reported Conversation Into Regressions

Goal: make the exact phone failure impossible to reintroduce.

1. Add an agent eval case for `What can I do to save more money?`.
   - Expected tool: `get_spending_opportunity`.
   - Expected card: `insight_card`.
   - Expected response text: dollar amount plus a human category/merchant.
   - Forbidden: answer-service error, generic budget advice, no-card response, raw provider taxonomy.

2. Add an eval/unit fixture that mimics the production category:
   - Transaction category: `general_services:general_services_other_general_services`.
   - Optional variants: `FOOD_AND_DRINK_RESTAURANT`, `GENERAL_MERCHANDISE_OTHER`, `TRANSFER_OUT_ACCOUNT_TRANSFER`.
   - Assert the visible category becomes plain English, not provider code.

3. Add renderer tests for pathological long text:
   - Long card title.
   - Long insight summary.
   - Long row label/detail.
   - Long footer.
   - Assert rendered markup includes the wrapping class or style contract.

4. Add mobile composer tests around submit/focus behavior:
   - After submit, textarea value clears.
   - On coarse-pointer/mobile mode, textarea is not immediately refocused.
   - On desktop, decide whether focus retention remains useful; if retained, make it an explicit desktop-only behavior.

Exit condition: the current bugs fail under tests before implementation and pass afterward.

### 2. Route Money-Saving Prompts To Deterministic Cutback Logic

Goal: common money-saving phrasing should not depend on the model service.

1. Expand `isSpendingOpportunityPrompt()` in `src/lib/agent/ai-agent.ts`.
   - Include: `save more`, `save more money`, `save a little`, `save cash`, `save this week`, `spend less`, `lower expenses`, `reduce expenses`, `cut expenses`, `cut costs`, `trim costs`, `where can I save`.
   - Keep exclusions for setup/savings-cushion language, for example `protected savings`, `savings cushion`, `save my settings`, and account-management flows.

2. Mirror the classifier update in `tests/helpers/mock-agent-runtime.ts`.

3. Add tests in `src/lib/agent/ai-agent.test.ts`.
   - Positive: `What can I do to save more money?`, `Where can I save this week?`, `How do I reduce expenses?`, `What costs should I cut?`.
   - Negative: `Set my savings cushion`, `Use $200 savings cushion`, `Save my account settings`.

4. Adjust broad-chat fallback only as a backup.
   - If model output validation fails for a no-tool money-saving phrase, return a deterministic short answer that points to cutback prompts rather than surfacing an answer-service error.
   - Do not rely on this backup as the primary fix; primary route must be deterministic tool use.

Exit condition: `What can I do to save more money?` produces `get_spending_opportunity` in unit tests and `npm run eval:agent`.

### 3. Add A User-Facing Category Normalization Layer

Goal: no Plaid/Teller/provider taxonomy string should reach the user.

1. Create a small formatter near spending classification, likely `src/lib/pip-cash/category-labels.ts`.
   - Input: raw transaction category and transaction haystack.
   - Output: `{ key, label, source }`.
   - Normalize separators: `:`, `_`, `/`, `>`, repeated spaces.
   - Strip repeated provider prefixes.
   - Map known provider categories to plain English:
     - `general_services:*` -> `Services`.
     - `general_services_other_general_services` -> `Services`.
     - `food_and_drink:*restaurant*` -> `Dining`.
     - `food_and_drink:*coffee*` -> `Coffee`.
     - `general_merchandise:*` -> `Shopping`.
     - `transportation:*` -> `Transport`.
     - `travel:*` -> `Travel`.
     - `transfer:*`, `bank_transfer`, `account_transfer` -> excluded before opportunity creation.

2. Update `getOpportunityCategory()` to use the formatter.
   - Prefer merchant/category mappings already known from `mapKnownCategory`.
   - Fall back to readable parent category, not the deepest raw code, when the deepest code is `other`, `general`, `misc`, or duplicates the parent.
   - If still weak, use a merchant-driven label such as `Spending at Walmart` or `Recent services`, not raw taxonomy.

3. Rewrite `buildCutbackOpportunityCard()` copy.
   - Summary: `Services is up $95 over the last 14 days.` or `Dining is $200 in the last 14 days, up $132 from the prior 14 days.`
   - Row detail should use merchant examples first.
   - Footer should be user-facing: `Based on recent repeat spending and merchant concentration.`
   - Remove visible reason codes like `discretionary_category`.

4. Add tests for readable output.
   - No underscores.
   - No colon taxonomy.
   - No all-lower snake case.
   - No word longer than a reasonable UI threshold in category labels.

Exit condition: the production category becomes a plain label such as `Services`, and all reason-code leakage is removed from card text.

### 4. Add A Text-Wrapping Safety Net Across Chat And Cards

Goal: even unexpected long tokens cannot break the phone layout.

1. Add a global utility class, for example `.pip-wrap-anywhere`.
   - `overflow-wrap: anywhere;`
   - `word-break: break-word;`
   - `min-width: 0;`

2. Apply it to:
   - Assistant message paragraph in `AgentThread`.
   - User chat bubble.
   - Card title.
   - Insight summary.
   - Insight row label/detail/value container.
   - Guidance row detail.
   - Card footer.

3. Keep normal truncation only where intentional.
   - Account names can stay truncated.
   - Financial values should not wrap unless truly forced.

4. Add mobile-width render tests or snapshots for long labels.
   - Prefer component tests that assert class application plus browser verification at 390px width.

Exit condition: a 70-character unbroken label cannot horizontally scroll or leave the card boundary.

### 5. Fix Mobile Keyboard And Composer Behavior

Goal: sending feels native on phone; keyboard hides after send, and the composer is visible when the user taps it again.

1. Split textarea resizing from focus management in `AgentInput`.
   - Rename `resetComposerViewport` to a pure resize helper.
   - Stop calling `input.focus()` unconditionally after submit.
   - On submit, blur the textarea for touch/coarse-pointer users.
   - Optionally keep desktop focus if `matchMedia("(pointer: fine)")` is true.

2. Add mobile keyboard viewport handling in the app shell.
   - Create a small hook in `PipHome` or a local utility:
     - Listen to `window.visualViewport.resize` and `window.visualViewport.scroll`.
     - Set CSS variables such as `--pip-visual-viewport-height` and `--pip-keyboard-inset`.
     - Clean up listeners on unmount.
   - Use the variables in `.pip-chat-shell`:
     - Height should track visual viewport when available.
     - Bottom padding should include keyboard inset and safe-area inset.

3. Keep composer visible on focus.
   - On textarea focus, schedule `form.scrollIntoView({ block: "end", behavior: "smooth" })`.
   - Avoid `preventScroll: true` on mobile focus paths.
   - Respect reduced motion.

4. Recheck chat-thread scrolling.
   - Current `AgentThread` scrolls the latest item into its own scroll container.
   - Ensure this does not fight composer `scrollIntoView` when the keyboard opens.
   - If needed, delay thread auto-scroll until after the visual viewport resize event.

5. Add mobile tests where possible.
   - Unit: focus/blur behavior can be tested with `matchMedia` mocks.
   - Browser: use in-app Browser at 390x844 for layout smoke.
   - Manual device acceptance remains required for true soft-keyboard behavior because desktop browser automation cannot fully emulate iOS/Android keyboard overlay.

Exit condition:
- First send hides the keyboard on a real phone.
- Tapping the composer again brings up the keyboard and keeps the composer above it.
- Sending a second message does not leave the composer hidden behind the keyboard.

### 6. Improve Error Semantics For Model-Output Failures

Goal: users should not see infrastructure-sounding errors for recoverable model formatting failures.

1. Update server error mapping.
   - Model validation failures should return a code like `invalid-agent-output` with 502 when the upstream API responded but the model output was unusable.
   - True service failures should remain 503.

2. Update client copy.
   - 503: `I can’t reach the answer service right now. Try again in a moment.`
   - 502/model validation: `I couldn’t answer that cleanly. Try again, or ask for the math.`
   - For money-saving prompts, avoid this path by deterministic routing.

3. Add route tests around `toAgentErrorPayload` and `getSafeAgentFailureMessage`.

Exit condition: the reported `too_big` model-output failure cannot be mislabeled as answer-service reachability.

### 7. Verification And Dogfood Gate

Run this after implementation, in this order:

1. Targeted tests:
   - `npm test -- src/lib/agent/ai-agent.test.ts src/lib/pip-cash/spending-opportunities.test.ts src/lib/agent/tool-runner.test.ts src/components/AgentInput.test.tsx src/components/cards/CardRenderer.test.tsx`

2. Full repo checks:
   - `npm test`
   - `npm run build`
   - `npm run eval:agent`
   - `npm run check:netlify-bundle`
   - `git diff --check`

3. Production-like conversation checks:
   - Ask `What can I do to save more money?`
   - Ask `How can I cut back?`
   - Ask `Where can I save this week?`
   - Confirm each uses `get_spending_opportunity` and returns a plain-English card.

4. Mobile browser checks:
   - In-app Browser at 390x844: layout stays within width.
   - Long synthetic provider label does not overflow.
   - Composer is visible at bottom before and after a send.

5. Real phone acceptance check:
   - Open the deployed app on phone.
   - Type and send the three prompts above.
   - Confirm keyboard dismisses after send.
   - Tap composer again and confirm it stays above keyboard.
   - Send a second message without manually hiding the keyboard.

6. Production log check:
   - Query recent `agent_chat_turns`.
   - Confirm no raw category labels with `_`/`:` in assistant cutback messages.
   - Confirm money-saving prompts use `get_spending_opportunity`.
   - Confirm no new `openai-request-failed` rows for ordinary cutback/save prompts.

Exit condition: all automated checks pass, and the real phone acceptance check passes.

## Risks And Mitigations

- Risk: broader save/cutback classifier hijacks savings-cushion setup.
  - Mitigation: add negative tests for protected savings and settings phrases.

- Risk: category normalization hides useful specificity.
  - Mitigation: prefer merchant examples in row detail while keeping the category label broad and readable.

- Risk: visualViewport behavior differs across iOS Safari, Android Chrome, and WebView.
  - Mitigation: keep the CSS fallback to `100dvh`, test on a real phone, and avoid brittle user-agent detection.

- Risk: blur-after-submit hurts desktop speed.
  - Mitigation: make blur mobile/coarse-pointer only; preserve desktop focus if desired.

- Risk: card text wrapping makes money rows look cramped.
  - Mitigation: apply wrapping to text containers, not fixed money values unless forced.

## Definition Of Done

- `What can I do to save more money?` deterministically returns a cutback card.
- `How can I cut back?` never shows raw provider taxonomy or reason-code strings.
- Long labels/messages/card text cannot overflow the mobile viewport.
- Mobile keyboard dismisses after send.
- Composer remains visible when the keyboard opens for the next message.
- Full tests, build, evals, bundle check, and real phone dogfood pass.

## Plan Optimizer Results

Rubric:

- Root-cause fidelity, 20 points: high quality means the plan is anchored to production logs and source-level causes.
- UX/product fit, 20 points: high quality means fixes preserve Pip’s simple consumer language and phone-first chat feel.
- Implementation specificity, 20 points: high quality means files, functions, tests, and exit conditions are named.
- Mobile rigor, 15 points: high quality means soft-keyboard behavior is handled with real viewport mechanics and real-device acceptance.
- Verification strength, 15 points: high quality means automated, browser, production-log, and phone checks are included.
- Risk control, 10 points: high quality means false positives, provider taxonomy, and cross-device pitfalls have mitigations.

Score trajectory:

- Draft 1: 78/100. Covered the bugs but under-specified live-log confirmation and mobile keyboard mechanics.
- Draft 2: 89/100. Added production-log evidence, classifier exclusions, and category taxonomy tests.
- Draft 3: 94/100. Added visualViewport plan, wrapping safety net, and real-phone acceptance gate.
- Draft 4: 95/100. Tightened error semantics and production-log closeout checks.
- Draft 5: 95/100. Plateau; further changes were wording, not substance.

Final score: 95/100.

The substantive improvements from optimization were: anchoring the plan to the actual production chat rows, treating keyboard behavior as a visualViewport/mobile-focus problem instead of a generic CSS issue, and adding provider-taxonomy regression tests so raw category code cannot leak back into cards.
