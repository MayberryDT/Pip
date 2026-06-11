# Pip Conversation Quality PRD

Date: June 9, 2026
Status: Draft ready for implementation planning

## Problem Statement

Pip's MVP works at a basic functional level: the app shows Spendable Cash Today, accepts chat input, calls deterministic money tools, returns cards, and offers prompt chips. The core product shape is still correct: one number, ask Pip, no dashboard.

The current conversation experience is not good enough for the product to feel trustworthy or engaging. Pip often gives overly similar short answers, repeats the same kind of response, and can ask or imply the same next step multiple times. Prompt chips are supposed to guide users into useful follow-up questions, but today they can feel generic, repetitive, or stuck in the same narrow topic. A user who does not know exactly what to type has too little guided help branching into interesting money questions.

From the user's perspective, this makes Pip feel less like a responsive financial assistant and more like a thin wrapper around a few canned actions. The user can technically get answers, but the conversation does not reliably feel adaptive, specific, or alive.

From the product perspective, this is especially risky because Pip's main interface is the conversation. There is no dashboard to fall back on. If the conversation feels repetitive, the whole product feels repetitive.

The current implementation has several likely causes:

- Visible replies are tightly constrained by character count, word count, sentence count, reading level, tone restrictions, card restrictions, and banned wording.
- One agent prompt handles tone, financial safety policy, tool routing, card behavior, onboarding behavior, chip generation, loop avoidance, and output formatting.
- Ready-state deterministic financial prompt chips are intentionally empty, so the model must invent most financial next steps.
- The active context is a small client-sent window of recent chat text plus shown card types, last tool names, and recent prompt chips.
- Persisted chat turns are used for observability, not for active conversation memory.
- Existing evals cover routing, safety, cards, and UI contracts more than conversational progression, repetition, or chip quality.

The goal is not to make Pip long-winded, cute for its own sake, or motivational. The goal is to make short financial conversations feel specific, useful, and guided while preserving the serious money-product constraints.

## Solution

Build a conversation-quality layer for Pip that separates answer composition from next-step guidance.

Pip should still be compact. The assistant should still avoid financial advice, affordability guarantees, dashboards, hidden navigation, moralizing, and fake calculations. The deterministic money engine and deterministic tools remain the source of truth for financial facts.

The improved experience should make Pip feel more adaptive in four core jobs:

- Explain today's Spendable Cash Today number.
- Explain why the number changed or what is driving it.
- Test a purchase amount against today's number.
- Preview upcoming activity, recurring items, recent charges, or near-term changes.

For each job, Pip should provide a direct answer, optionally add one short supporting sentence when it adds value, and offer chips that move the user into a useful adjacent branch. The chips should not be generic model inventions. They should come primarily from deterministic chip families tied to the user's current state, the last tool/card, the user's latest intent, the Spendable Cash Today result, and prior chips shown in the conversation.

The first implementation should focus on deterministic conversation design before adding heavier stateful OpenAI memory. Better memory is useful, but it should not be the first dependency. Pip needs stronger conversation moves and stronger chip families even when only a short context window is available.

The improved system should:

- Keep the "one number and input" product thesis.
- Preserve the existing deterministic PIP cash engine and tool boundaries.
- Add a real financial chip catalog for ready users.
- Add a conversation state model that captures the user's current job, last answered job, recent chips, recent cards, recent tools, and last assistant message signal.
- Refactor prompt instructions so the model is not solely responsible for both answer quality and next-step ideation.
- Expand the response contract enough to support a short lead plus optional support without allowing long chat paragraphs.
- Add repetition guards for answer text, adjacent tool loops, repeated cards, and repeated chip sets.
- Add evals and tests that model multi-turn user journeys instead of only single-turn tool routing.

The expected user outcome is simple: after each answer, the user should have a clear next step that feels related but not trapped. A user can still type anything, but the chips should make the next good question obvious.

## User Stories

1. As a Pip user, I want Pip to answer my question directly, so that I do not feel like I am being pushed through a canned script.

2. As a Pip user, I want Pip's answers to sound specific to my current money state, so that I trust the response came from my data.

3. As a Pip user, I want short answers that still contain enough detail, so that Pip feels useful without becoming a finance lecture.

4. As a Pip user, I want Pip to avoid repeating the same sentence shape every turn, so that the conversation does not feel robotic.

5. As a Pip user, I want Pip to remember what I just asked, so that I do not have to repeat myself.

6. As a Pip user, I want Pip to avoid asking the same follow-up again, so that the chat feels like it is moving forward.

7. As a Pip user, I want prompt chips to give me useful next questions, so that I can keep exploring without typing a perfect prompt.

8. As a Pip user, I want prompt chips to branch into different topics, so that I can explore why, purchases, bills, charges, balances, or trends.

9. As a Pip user, I want chips to avoid showing the same suggestions repeatedly, so that they stay useful after several turns.

10. As a Pip user, I want chips to change after I tap one, so that I am not sent back into the same loop.

11. As a Pip user, I want a "why this number" path, so that I can understand the current Spendable Cash Today signal.

12. As a Pip user, I want follow-up chips after a why answer, so that I can inspect drivers, recent charges, or upcoming activity.

13. As a Pip user, I want Pip to explain the biggest driver first when I ask why, so that I get the main reason quickly.

14. As a Pip user, I want Pip to avoid dumping all card details into chat, so that cards remain useful and chat stays readable.

15. As a Pip user, I want a purchase-testing path, so that I can ask what a specific purchase would do to today's number.

16. As a Pip user, I want purchase answers to say what would be left or how far over I would be, so that the answer is concrete.

17. As a Pip user, I want purchase follow-up chips like trying another amount, so that I can quickly compare choices.

18. As a Pip user, I want Pip to avoid saying a purchase is safe, affordable, or recommended, so that I get a signal rather than false certainty.

19. As a Pip user, I want a forecast path, so that I can preview near-term changes without opening a dashboard.

20. As a Pip user, I want forecast chips to branch into upcoming bills, recurring items, and daily changes, so that the forecast is explorable.

21. As a Pip user, I want a recurring activity path, so that I can see likely repeat charges and income.

22. As a Pip user, I want recurring activity chips to branch into forecast and recent charges, so that I understand what might hit soon.

23. As a Pip user, I want a recent charges path, so that I can see what spending is affecting today's number.

24. As a Pip user, I want recent charges chips to branch into biggest drivers or spending breakdown, so that I can move from item-level to summary-level context.

25. As a Pip user, I want a spending breakdown path, so that I can inspect categories, merchants, income, refunds, rent, and card payments when I ask.

26. As a Pip user, I want spending breakdown chips to branch into math, recent charges, and upcoming items, so that I can continue naturally.

27. As a Pip user, I want a math path, so that I can see how Spendable Cash Today is calculated.

28. As a Pip user, I want math chips to branch into drivers and definitions, so that calculation detail does not trap the conversation.

29. As a Pip user, I want a true balances path only when I ask for it, so that full balances do not become the default product surface.

30. As a Pip user, I want balance chips to branch back to Spendable Cash Today, so that the app does not turn into a bank balance viewer.

31. As a Pip user, I want missing-card or data-quality chips when relevant, so that I can improve accuracy when Pip sees a likely gap.

32. As a Pip user, I want missing-card chips to avoid nagging me if I have already dismissed the issue, so that intentional omissions are respected.

33. As a Pip user, I want Pip to gracefully handle "why?" or "what about that?" after a card, so that short follow-ups work.

34. As a Pip user, I want Pip to understand "what about $20 instead?" after a purchase test, so that I can compare amounts naturally.

35. As a Pip user, I want Pip to understand "yes, show me" after it offers a forecast or breakdown, so that I can accept an offered path.

36. As a Pip user, I want Pip to avoid repeating a card unless I ask for it again, so that the thread does not fill with duplicate cards.

37. As a Pip user, I want Pip to use a different response pattern if I ask the same thing again, so that duplicate questions still feel handled.

38. As a Pip user, I want Pip to acknowledge when the same answer still applies, so that repeated facts do not sound like a fresh discovery.

39. As a Pip user, I want Pip to say when it needs an amount, so that purchase simulations do not guess.

40. As a Pip user, I want Pip to guide setup without mixing setup chips into money answers after I have financial data, so that the conversation stays relevant.

41. As a Pip user, I want onboarding chips to stay practical, so that setup remains simple.

42. As a Pip user, I want ready-state chips to be financial and contextual, so that the app immediately feels useful after setup.

43. As a Pip user, I want Pip to avoid generic "discuss this" chips when a real Pip card exists, so that chips feel actionable.

44. As a Pip user, I want Pip to avoid promising to show data unless the app can show the matching card, so that I do not hit dead ends.

45. As a Pip user, I want chips to use plain labels, so that I can scan them quickly on mobile.

46. As a Pip user, I want chips to remain short enough for the mobile UI, so that they do not crowd the screen.

47. As a Pip user, I want chips to use natural prompt text under the hood, so that tapping one feels like I asked a normal question.

48. As a Pip user, I want the conversation to feel calm and serious, so that the app does not trivialize money stress.

49. As a Pip user, I want Pip to avoid praise, shame, and motivational language, so that it stays focused on the math.

50. As a Pip user, I want Pip to use common words, so that financial explanations are easy to understand.

51. As a Pip user, I want Pip to avoid repeating product terms unnecessarily, so that answers feel conversational.

52. As a Pip user, I want Pip to use Spendable Cash Today consistently, so that the product vocabulary remains clear.

53. As a Pip user, I want Pip to avoid "PIP Cash" in visible replies, so that old internal vocabulary does not leak.

54. As a Pip user, I want Pip to avoid dashboard references, so that the single-screen product model stays intact.

55. As a Pip user, I want Pip to handle negative Spendable Cash Today without panic language, so that I understand the warning without feeling judged.

56. As a Pip user, I want negative-state chips to include why, upcoming activity, and recent charges, so that I can diagnose the problem.

57. As a Pip user, I want positive-state chips to include purchase testing and upcoming changes, so that I can make day-to-day decisions.

58. As a Pip user, I want chips to reflect missing data warnings, so that I know when the number might be incomplete.

59. As a Pip user, I want chips to reflect pending transaction warnings, so that I understand temporary uncertainty.

60. As a Pip user, I want chips to reflect stale sync state, so that I can refresh before relying on the number.

61. As a beta tester, I want the conversation to feel useful with fake data, so that product quality can be judged before relying on live bank data.

62. As a beta tester, I want conversation failures to be logged, so that repeated bad paths can become regression cases.

63. As a beta tester, I want the app to improve from real bad transcripts, so that the chat quality reflects actual usage instead of imagined prompts.

64. As an operator, I want to see when the same tool is used repeatedly, so that I can identify tool loops.

65. As an operator, I want to see when prompt chips repeat, so that I can identify weak chip generation.

66. As an operator, I want to see when assistant messages are too similar, so that I can identify robotic answer patterns.

67. As an operator, I want eval reports for multi-turn journeys, so that conversation quality can be tracked before release.

68. As an operator, I want failed conversation evals to show the message, tools, cards, and chips, so that debugging is fast.

69. As a developer, I want deterministic chip families, so that common next steps are reliable and testable.

70. As a developer, I want chip generation separated from answer composition, so that improving one does not destabilize the other.

71. As a developer, I want a conversation state module, so that recent jobs, chips, cards, tools, and assistant text can be reasoned about consistently.

72. As a developer, I want an intent or job classifier, so that Pip can choose between explanation, purchase test, forecast, transactions, recurring activity, balances, math, setup, and broad chat.

73. As a developer, I want answer variants tied to conversation jobs, so that variety comes from state-aware patterns rather than random model creativity.

74. As a developer, I want a repetition guard, so that repeated text or repeated tool/card paths can be detected before the response reaches the user.

75. As a developer, I want prompt instructions to be shorter and more structured, so that model behavior is easier to reason about.

76. As a developer, I want output schema changes to be minimal and explicit, so that the UI remains stable.

77. As a developer, I want the model to continue using deterministic tools for money facts, so that conversation improvements do not compromise correctness.

78. As a developer, I want chip labels and prompts sanitized through a single contract, so that unsafe or unsupported chips cannot leak.

79. As a developer, I want deterministic fallbacks when generated chips are unusable, so that the UI does not go empty or stale.

80. As a developer, I want tests that assert behavior rather than internal implementation details, so that refactors do not break tests unnecessarily.

81. As a developer, I want journey tests for common conversation paths, so that multi-turn regressions are caught.

82. As a developer, I want tests for repeated chip suppression, so that old chip loops do not return.

83. As a developer, I want tests for answer similarity thresholds, so that the anti-repeat guard has a clear contract.

84. As a developer, I want tests for card repetition rules, so that useful repeated asks still work but accidental duplicate cards do not.

85. As a developer, I want tests for chip capability safety, so that chips do not promise unsupported cards or screens.

86. As a developer, I want the existing routing and safety evals preserved, so that conversation quality does not regress core guardrails.

87. As a founder, I want Pip to feel more useful without adding dashboard complexity, so that the product thesis stays sharp.

88. As a founder, I want the first improvement pass to be shippable quickly, so that conversation quality improves before a large memory architecture change.

89. As a founder, I want later stateful memory to be evaluated as an upgrade, so that the team does not overbuild before fixing deterministic conversation design.

90. As a founder, I want a clear rollout path, so that improvements can be implemented, tested, and judged in phases.

## Implementation Decisions

- Preserve the product model: Pip remains a single-screen, mobile-first app centered on Spendable Cash Today, prompt chips, chat input, and temporary cards. This work must not introduce dashboards, tabs, budget pages, or permanent finance views.

- Treat conversation quality as a product layer, not only a prompt tweak. The implementation should add explicit conversation modules that can be tested independently from the model provider.

- Build a deep conversation state module. It should accept the latest user message, short chat history, recent cards, recent tool names, recent prompt chips, current onboarding state, sync status, and current Spendable Cash Today result. It should return a compact state summary with the current conversation job, last answered job, repeated-job flags, recent topic coverage, and repetition risk.

- Build a deep prompt chip planner module. It should expose a stable interface such as "given the conversation state and financial result, return up to three candidate chips." The planner should own deterministic chip families, prioritization, dedupe, rotation, and fallbacks.

- Add deterministic ready-state chip families. These should include at minimum: explain today's number, biggest drivers, recent charges, upcoming bills, next few days, recurring items, purchase test, try another amount, true balances, spending breakdown, show math, data quality, refresh data, and missing card when relevant.

- Tie chip families to conversation jobs. For example, after an explanation card, chips should branch to recent charges, biggest drivers, upcoming bills, or math. After a purchase simulation, chips should branch to trying another amount, upcoming activity, or why today's number is what it is. After a forecast, chips should branch to recurring items, upcoming bills, recent charges, or the current number's drivers.

- Prioritize contextual chip variety over randomness. Chips should be different because the user's current state and last interaction changed, not because the model invents arbitrary labels.

- Keep no more than three visible chips. The planner may evaluate more candidates internally, but the UI contract stays compact.

- Keep onboarding chips separate from ready-state financial chips. Setup chips remain deterministic and action-oriented. Ready-state chips should not regress into setup unless financial data is absent, stale, or repair is needed.

- Continue sanitizing chips for capability safety. If a chip uses show, list, forecast, view, or breakdown language, the app must be able to route it to a supported deterministic card or action.

- Replace empty ready-state deterministic suggestions with the new planner. The old behavior where financial tool results provide no deterministic suggested prompts should be retired.

- Separate answer composition from chip planning. The model may still produce a structured answer, but chip generation should not depend primarily on free-form model invention.

- Refactor the response contract to support a compact two-layer answer. The final visible chat message can still be rendered as a single string, but the internal contract should distinguish a lead sentence from optional support. This allows answers to stay short while adding specificity when needed.

- Keep chat concise but loosen the effective answer space. The new answer contract should allow a direct lead plus one optional supporting sentence when it materially improves clarity. It should not allow paragraphs.

- Preserve financial safety rules. Pip must not say a purchase is safe, affordable, recommended, guaranteed, or financial advice. Purchase simulations should describe the consequence to Spendable Cash Today.

- Preserve deterministic money-tool boundaries. The model must not calculate financial facts directly. Current balances, transactions, Spendable Cash Today, drivers, forecasts, purchase simulations, recurring activity, and data-quality statuses must come from deterministic tools.

- Reduce the monolithic prompt's responsibilities. The agent prompt should have shorter sections for identity, product boundaries, tool requirements, visible answer style, financial safety, card behavior, and output contract. Chip planning should move mostly into deterministic code.

- Keep forced-tool routing for high-confidence prompts. Existing forced routes for obvious why, forecast, recurring, spending breakdown, purchase simulation, recent transactions, true balances, math, data quality, and setup actions should remain, with tests updated as needed.

- Add a repetition guard for visible answer text. The guard should compare the candidate visible message against recent assistant messages and flag high similarity, especially when the same tool or card was just used.

- Add a tool-loop guard. The system should detect when the same tool is being used on adjacent turns without new user information. In those cases it should either avoid the tool, suppress a duplicate card, or answer that the same result still applies.

- Add a chip-loop guard. The planner should avoid returning the same chip set, same labels, or same prompts in adjacent turns unless the user state genuinely requires it.

- Keep a controlled escape hatch for repeated user asks. If the user explicitly asks to see a card again, show the relevant card again. If the user repeats a vague follow-up, acknowledge that the same answer still applies and offer a different adjacent path.

- Use persisted chat turn logs as observability first. The first implementation does not need to load server-side conversation history into every request. The existing logged turns should become a source for eval cases and operator analysis.

- Do not make OpenAI Sessions or previous-response chaining a prerequisite for the first pass. Stateful model memory can be a later phase after deterministic conversation moves and chips are improved.

- Design the later memory path now. The conversation state module should be compatible with future server-side compaction or stateful OpenAI conversation mechanisms. The app should be able to add longer memory without rewriting chip planning.

- Extend request metadata and chat logging enough to debug conversation quality. Logged turns should make it easy to inspect message similarity, selected chip id, returned chip ids, used tools, card types, response mode, and conversation job.

- Add optional response-quality metadata for internal use. This metadata may include current job, chosen chip family ids, repetition-risk flags, and fallback reasons. It should not be exposed as visible UI.

- Preserve the existing card UI. This PRD is about conversation progression and chip quality, not card redesign.

- Preserve the existing mobile-first layout. New chips and slightly richer answers must not cause text overflow or layout instability.

- Keep model choice configurable. The first pass should work with the current model configuration, but model, reasoning effort, and verbosity should be treated as evaluation variables once deterministic improvements are in place.

- Add a practical rollout sequence. Phase one should implement deterministic chip families and planner tests. Phase two should adjust response contract and prompt structure. Phase three should add repetition guards and multi-turn evals. Phase four should evaluate stateful memory and model-setting experiments.

## Testing Decisions

- Tests should focus on external behavior: user message in, returned message/cards/chips/tools out. Avoid tests that lock down private function internals unless the module is deliberately designed as a deep pure module.

- Keep existing routing and safety tests. The current coverage around tool selection, banned language, card promises, onboarding actions, and response schema remains valuable and should not be removed.

- Add pure unit tests for the prompt chip planner. These tests should verify the chips returned for different conversation jobs, financial states, warning states, recent chip histories, and repeated-card scenarios.

- Add pure unit tests for conversation state classification. These tests should verify that common user messages and follow-ups classify into jobs such as explain number, purchase test, forecast, recurring activity, recent charges, balances, math, setup, data quality, broad chat, and duplicate follow-up.

- Add pure unit tests for chip dedupe and rotation. These tests should verify that repeated labels, repeated prompts, retired chips, unsupported display promises, and recently shown chip sets are handled correctly.

- Add pure unit tests for answer repetition checks. These tests should use visible assistant messages and assert whether the system flags high similarity, allows legitimately repeated facts, or requires a different response pattern.

- Add integration tests for multi-turn journeys. A good journey test should simulate at least three turns and inspect returned tools, cards, messages, and chips after each turn.

- Add a "why path" journey. Example shape: user asks why, sees explanation card, gets chips that branch to recent charges or upcoming activity, taps one, then receives a different card and new chips.

- Add a purchase journey. Example shape: user asks about a purchase amount, sees purchase simulation, gets chips for trying another amount and checking upcoming activity, then asks "what about $20 instead" and receives a new simulation without stale chips.

- Add a forecast journey. Example shape: user asks about next few days, sees forecast, receives chips for recurring items and recent charges, then taps recurring items and receives a recurring activity card.

- Add a duplicate-follow-up journey. Example shape: user asks why, then asks "why?" again. Pip should not repeat the same card by default and should respond that the same drivers still apply or offer a deeper adjacent path.

- Add a negative Spendable Cash Today journey. The test should verify calm language, no hard permission language, useful diagnostic chips, and no purchase simulation unless an amount is provided.

- Add a stale or missing data journey when sync status or data quality indicates a problem. The test should verify chips that guide refresh, repair, or missing-card context without nagging when suppressed.

- Add chip-refresh tests. Silent prompt-chip refreshes should return exactly three chips when required, avoid repeats when possible, and fall back deterministically when generated chips are unusable.

- Add eval metrics for conversation quality. At minimum, eval reports should include repeated answer similarity, repeated chip set detection, adjacent same-tool detection, forbidden wording, unsupported display promises, expected cards, expected tools, and response length.

- Extend the existing agent eval script rather than building a separate test runner first. The current eval structure already checks routing, cards, and visible text; it should be expanded to multi-turn cases and repetition checks.

- Add operator-facing analysis for logged turns later. A lightweight script can scan local or persisted chat turns for repeated assistant messages, repeated chip labels, repeated tool sequences, and low chip variety.

- Keep e2e coverage focused. Browser tests should confirm that chips render, can be tapped, update after responses, and do not overflow on mobile. They should not try to validate every chip planner rule through the browser.

- Test with both fake default and negative scenarios. Conversation behavior should be validated against positive and negative Spendable Cash Today states.

- Tests should preserve product vocabulary. Visible text should continue using Spendable Cash Today and should avoid PIP Cash, dashboard, safe to spend, financial advice, and similar banned language.

## Out of Scope

- Building a traditional dashboard, tabbed navigation, budget page, or transaction page.

- Redesigning the entire Pip visual system, mascot, card styling, onboarding layout, or PWA shell.

- Changing the core Spendable Cash Today formula, rolling window behavior, transaction classification, credit-card payment dedupe logic, or protected savings math.

- Adding money movement, payments, account transfers, bill pay, or automated financial actions.

- Turning Pip into a financial advisor or recommendation engine.

- Guaranteeing that a purchase is affordable or safe.

- Replacing deterministic tools with model-generated financial calculations.

- Adding a large long-term memory system before deterministic conversation design is improved.

- Requiring OpenAI Sessions, Conversations, or previous-response chaining for the first implementation pass.

- Building a full analytics dashboard for conversation quality in the first pass.

- Publishing this PRD to an issue tracker.

- Reworking provider integrations, OAuth flows, Plaid Link, Teller support, Supabase auth, RLS, or sync scheduling except where conversation state needs existing sync/data-quality signals.

## Further Notes

The most important product decision is that "engaging" means adaptive, specific, and useful, not chatty. Pip should stay brief and serious. The current answer constraints are valuable guardrails, but they have compressed the response space too far when combined with an empty financial chip catalog and a monolithic prompt.

The fastest useful improvement is deterministic chip planning. It directly addresses the user's stated pain: chips go down the same hole and do not guide people into interesting branches. This is also the safest improvement because chip families can be tested without relying on model creativity.

The second most useful improvement is a better answer contract. A direct lead plus optional support gives Pip enough room to answer specifically while preserving the compact mobile chat feel.

The third most useful improvement is evaluation. The current tests prove that the MVP routes tools and preserves safety boundaries, but they do not prove that a conversation progresses. Multi-turn evals should become the protection against future prompt or model changes bringing back the same repetitive behavior.

Stateful model memory may still become important. It should be considered after the deterministic planner, answer contract, and repetition guards are in place. If added later, it should preserve the same product contract: deterministic tools own money facts, Pip stays short, and chips remain guided by product-defined conversation moves.
