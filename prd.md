# Free Cash PRD

Date: June 5, 2026
Status: Ready for implementation planning

## Problem Statement

People make everyday spending decisions from the wrong default number. A normal bank app foregrounds the user's total account balance, which can look deceptively large because it includes money already spoken for by rent, bills, credit-card purchases, transfers, savings goals, and the uneven timing of income. When the user sees a big balance, the app silently gives them permission to spend, even when their actual day-to-day cash position is fragile.

Tyler wants a product that replaces that misleading default with one behavior-shaping number: "Free Cash Today." The user should not have to learn a budget system, maintain categories, build a plan, or interpret charts. They should connect accounts and get a simple daily signal. If they want to know why the number changed, whether a purchase is a bad idea, or what their real balances are, they should ask the app.

The product must not become a traditional personal finance dashboard with an AI assistant attached. The assistant is the operating surface. The default product is one number and an input.

## Solution

Free Cash is a mobile-first, agent-first personal finance app that shows the user a single default financial signal: "Free Cash Today." The app calculates that number from normalized account and transaction data using a deterministic Free Cash engine. The engine uses a rolling calendar-month window, counts credit-card purchases as spending, dedupes credit-card payments, protects savings from spendable cash, handles refunds and transfers conservatively, and allows the number to go negative.

The first version will use fake data to prove the product loop before any real bank, database, or AI integration. Users will see a simple home screen with the Free Cash number, up to three prompt chips, an agent input, and temporary response cards. The mock agent will support a small set of high-value interactions: explaining the number, simulating a purchase, showing true balances on request, showing recent transactions, and nudging users about likely missing credit-card spend.

After the prototype proves the loop, the app will add Supabase Auth and Postgres with Row Level Security, then a financial data provider abstraction. The first real private beta provider should be TellerProvider, because Teller's real-data development environment and 100-enrollment limit fit Tyler/friends/family testing better than Plaid's current 10 Production Item trial cap. PlaidProvider should be added later if Teller coverage, mTLS complexity, public launch needs, or acquisition positioning becomes a blocker.

OpenAI should not be used in the first prototype. When AI is added, the app should use the official OpenAI SDK through Netlify AI Gateway, with Responses API tool/function calling and structured outputs. The model may route ambiguous intent and explain deterministic tool results, but it must never calculate money, move money, or see full raw transaction histories unnecessarily. OpenAI Agents SDK should be deferred until the product genuinely needs multi-step orchestration, handoffs, guardrails, sessions, or tracing beyond simple tool calling.

## User Stories

1. As a user, I want to open the app and immediately see Free Cash Today, so that I know the daily spending signal without interpreting my bank balance.

2. As a user, I want the default screen to avoid showing my full bank balance, so that I am not tempted by money that is already spoken for.

3. As a user, I want Free Cash Today to be a single prominent number, so that the app feels simple instead of like a budget dashboard.

4. As a user, I want the app to calculate Free Cash from my real income and spending patterns, so that I do not have to maintain a manual budget.

5. As a user, I want Free Cash to use a rolling calendar-month window, so that rent and other monthly obligations are handled more naturally than with a fixed 30-day window.

6. As a user, I want credit-card purchases to reduce Free Cash, so that spending on cards does not make me feel richer than I am.

7. As a user, I want credit-card payments to be deduped, so that paying the card does not count as a second spending event.

8. As a user, I want transfers between my own accounts to avoid counting as purchases, so that moving money does not distort Free Cash.

9. As a user, I want refunds to offset previous spend, so that returned purchases make the number more accurate.

10. As a user, I want protected savings to be excluded from spendable money, so that money I am trying not to spend does not inflate Free Cash.

11. As a user, I want Free Cash to be allowed to go negative, so that the app can clearly show when my current pattern is not sustainable.

12. As a user, I want the app to say "Free Cash" instead of "safe to spend," so that the app gives a useful signal without pretending to guarantee outcomes.

13. As a user, I want the app to avoid generic confidence badges and warnings, so that it feels decisive and not like a noisy finance tool.

14. As a user, I want to ask "Why this number?", so that I can understand what changed without opening a dashboard.

15. As a user, I want to ask "Can I spend $50?", so that I can see the consequence of a purchase before making it.

16. As a user, I want the app to say how a purchase would move Free Cash, so that the tradeoff is concrete.

17. As a user, I want purchase simulations to avoid overconfident advice, so that the product stays useful without making promises.

18. As a user, I want to ask for true balances only when I need them, so that the tempting balance number is not the default.

19. As a user, I want true balances to appear in a temporary card, so that I can inspect them without turning the app into a bank dashboard.

20. As a user, I want recent transactions to be shown only when I ask, so that transaction lists do not dominate the app.

21. As a user, I want the app to explain the biggest drivers of Free Cash, so that I can understand the number quickly.

22. As a user, I want the app to show entered-window and exited-window effects when relevant, so that I understand why the rolling window changed my number.

23. As a user, I want the app to tell me when rent or a major bill is affecting Free Cash, so that the number feels trustworthy.

24. As a user, I want the app to detect likely credit-card payments, so that it can tell when a connected bank account is paying an unconnected card.

25. As a user, I want the app to gently nudge me when a likely unconnected credit card exists, so that I can improve accuracy without feeling scolded.

26. As a user, I want to dismiss or suppress repeated missing-card nudges, so that intentional account omissions do not become annoying.

27. As a user, I want the app to preserve my choice not to connect a card, so that I remain in control of my financial data.

28. As a user, I want the app to tell me that Free Cash may be inaccurate if I spend on unconnected cards, so that I understand the consequence of incomplete data.

29. As a user, I want the onboarding to be short, so that I can connect accounts and get value quickly.

30. As a user, I want onboarding copy to say that connecting spending accounts makes Free Cash more accurate, so that I understand why card data matters.

31. As a user, I want to set a protected savings amount or choose a default, so that the app does not treat all savings as free cash.

32. As a user, I want the first prototype to behave realistically even with fake data, so that I can judge whether the product loop feels right.

33. As a user, I want the fake prototype to show a believable default Free Cash value around $43, so that it demonstrates the intended daily-decision experience.

34. As a user, I want a negative Free Cash fake-data scenario, so that I can see how the app handles financial stress without panic language.

35. As a user, I want the app to feel mobile-native even as a PWA, so that it feels like something I would actually open daily.

36. As a user, I want the app to avoid menus, tabs, and permanent dashboards, so that the experience stays radically simple.

37. As a user, I want prompt chips to suggest only a few useful questions, so that I am guided without being given a menu.

38. As a user, I want prompt chips to change based on context, so that they feel helpful rather than static.

39. As a user, I want no more than three visible prompt chips, so that the interface stays light.

40. As a user, I want agent responses to appear as short text plus structured cards, so that answers are easy to scan.

41. As a user, I want temporary cards to disappear or recede after the interaction, so that the home screen returns to the single-number state.

42. As a user, I want the agent to remember the current conversation enough to answer follow-ups, so that I do not have to restate the same context.

43. As a user, I want the agent to avoid pretending to know things it cannot know, so that trust is not destroyed.

44. As a user, I want the agent to avoid financial-advisor language, so that it remains a decision aid rather than a formal advisor.

45. As a user, I want the app to avoid money movement in the MVP, so that I can trust it as an insight layer before it ever gets action authority.

46. As a user, I want my financial data to stay private and protected, so that using the app does not create unnecessary risk.

47. As a user, I want the app to let me delete my data before any real beta, so that I can leave cleanly.

48. As a user, I want bank connection repair flows to be straightforward, so that a stale connection does not silently degrade Free Cash.

49. As a beta tester, I want invite-only access, so that the early version can stay controlled while sensitive financial logic is being validated.

50. As a beta tester, I want manual refresh before background sync, so that I can test the product without unexpected provider usage or costs.

51. As a beta tester, I want clear messaging when data is stale, so that I know when the Free Cash number was last refreshed.

52. As a beta tester, I want the app to behave well when pending transactions exist, so that Free Cash does not swing unpredictably.

53. As a beta tester, I want the app to handle missing merchant names and messy transaction descriptions, so that real-world bank data does not break the experience.

54. As a beta tester, I want the app to detect refunds and transfers conservatively, so that unusual transactions do not create obviously wrong numbers.

55. As a beta tester, I want to connect checking, savings, and credit-card accounts under one institution when available, so that the app captures the complete spending picture.

56. As a beta tester, I want the app to continue working if one connected institution temporarily fails, so that the whole product does not collapse because of one provider issue.

57. As a developer, I want the Free Cash engine to be a pure deterministic module, so that the money math can be tested independently from UI, bank providers, and AI.

58. As a developer, I want transaction normalization to be separated from provider integration, so that Teller and Plaid can both feed the same engine.

59. As a developer, I want a FinancialDataProvider abstraction, so that MockProvider, TellerProvider, and PlaidProvider can be swapped without rewriting product logic.

60. As a developer, I want MockProvider to exist before real providers, so that the prototype can be built and tested without bank API friction.

61. As a developer, I want TellerProvider isolated behind the provider abstraction, so that mTLS and Teller-specific enrollment concepts do not leak into the Free Cash engine.

62. As a developer, I want PlaidProvider added later behind the same abstraction, so that a switch or dual-provider future is possible without a rewrite.

63. As a developer, I want provider tokens and certificates handled server-side only, so that sensitive credentials never reach the browser.

64. As a developer, I want Supabase RLS on user financial tables, so that row-level access rules protect data even if a client query is imperfect.

65. As a developer, I want Netlify route handlers or functions to own server-side financial operations, so that browser code cannot call provider APIs directly.

66. As a developer, I want manual sync and rate limiting before scheduled sync, so that early provider costs and errors are controlled.

67. As a developer, I want sync logs to capture provider, duration, counts, and failures, so that beta issues are diagnosable.

68. As a developer, I want the mock agent to be deterministic in phase 1, so that the UX can be validated without model variability.

69. As a developer, I want OpenAI tool/function calling only after the deterministic loop works, so that AI adds value rather than masking unclear product logic.

70. As a developer, I want model prompts to use bounded summaries rather than raw transaction dumps, so that cost and privacy risk stay low.

71. As a developer, I want structured agent card outputs, so that the UI can render consistent temporary cards instead of arbitrary chat prose.

72. As a developer, I want prompt chip generation to be deterministic at first, so that the product does not depend on AI for basic navigation.

73. As a developer, I want the app to avoid OpenAI Agents SDK in v1, so that the implementation stays smaller until orchestration complexity justifies it.

74. As a developer, I want Netlify AI Gateway added only when AI is needed, so that the first prototype has no model-cost surface area.

75. As a developer, I want cost counters for AI and provider sync, so that beta usage cannot quietly become expensive.

76. As an operator, I want to know which users have stale connections, so that beta support can focus on real data quality issues.

77. As an operator, I want to know how often users view Free Cash and ask follow-up questions, so that we can measure whether the daily decision layer is working.

78. As an operator, I want to track purchase simulation usage, so that we can see whether users rely on the app before spending.

79. As an operator, I want to track negative Free Cash follow-up behavior, so that we can learn whether the product changes spending decisions.

80. As an operator, I want to track missing-card nudge outcomes, so that we know whether the nudge improves accuracy or annoys users.

81. As an operator, I want to keep acquisition optional, so that the product can grow independently while preserving a clean future partner story.

82. As a future partner or acquirer, I want the app to have clear provider boundaries and deterministic financial logic, so that the product is understandable and auditable.

83. As a future partner or acquirer, I want the app to support Plaid later, so that standard fintech integration is possible if the product moves beyond private beta.

84. As a security reviewer, I want a clear rule that the app never stores bank credentials, so that the risk profile is limited to provider tokens and normalized financial data.

85. As a security reviewer, I want Teller mTLS certs and provider tokens to be isolated from frontend code, so that user data access cannot be compromised through the browser.

86. As a security reviewer, I want the agent to be blocked from money movement, so that model behavior cannot create financial harm.

87. As a compliance reviewer, I want the app to avoid "safe to spend" language, so that the product does not imply certainty or formal financial advice.

88. As a compliance reviewer, I want user consent and data deletion flows before real bank beta, so that the app has a minimum viable privacy posture.

## Implementation Decisions

- The product will be built first as a mobile-first web/PWA experience, not a native app.

- The deployment target is Netlify, not Vercel.

- The recommended framework is Next.js with TypeScript, deployed on Netlify through Netlify's current Next.js/OpenNext support.

- The first product milestone uses fake data only. It does not include Plaid, Teller, Supabase, OpenAI, Netlify AI Gateway, or OpenAI Agents SDK.

- The prototype's visible surface is one number, up to three prompt chips, an agent input, and temporary response cards.

- "Free Cash Today" is the only default financial number.

- True balances are available only through an explicit user request or a required legal/security flow.

- The app uses "Free Cash" language and avoids "safe to spend" language.

- The app uses consequence phrasing for purchase simulations. Example: "That would move Free Cash from $43 to -$7."

- The Free Cash engine is a deep module. It encapsulates rolling-window date logic, transaction classification, credit-card payment dedupe, savings protection, refund handling, transfer handling, negative values, and explanation primitives behind a small deterministic interface.

- The Free Cash engine must not call bank providers, database clients, or AI models.

- The rolling period is a calendar-month-relative window, not a fixed 30-day lookback.

- The default MVP interpretation of Free Cash is a daily cash-flow signal derived from normalized transaction and balance data, protected savings, and the current rolling window.

- Credit-card purchases count as spend when they appear as card transactions.

- Credit-card payments are deduped so the payment from checking to the card does not count as an additional purchase.

- Transfers between user accounts are excluded from spend when they can be confidently detected.

- Refunds offset prior spending.

- Pending transactions require an explicit MVP convention. The default should be conservative: include pending card purchases in the user-facing explanation when they materially affect the number, but label the data state so tests can enforce consistent behavior.

- Free Cash can be negative. Negative values are not an error state.

- The date-window module is a deep module. It should make calendar-month behavior explicit and testable without involving the rest of the app.

- The transaction classifier is a deep module. It receives normalized transactions and returns internal transaction kinds such as income, purchase, credit-card payment, transfer, refund, fee, and unknown.

- The credit-card payment dedupe module is a deep module. It should match likely bank-account payments to credit-card payment events without requiring an LLM.

- The explanation module is a deep module. It turns engine results into bounded explanation primitives that can be rendered directly or passed to a model later.

- The prompt chip generator is a deep module. It deterministically produces no more than three contextual prompt chips.

- The temporary card renderer is a reusable UI module. It renders typed response cards for explanation, purchase simulation, true balances, recent transactions, missing-card nudges, math breakdowns, and account connection prompts.

- The agent command router starts as a deterministic mock router. It recognizes a small set of supported intents and returns typed cards.

- The phase 1 agent should support at least: why this number, can I spend a specific amount, show true balances, show recent transactions, show math, and connect another account.

- Agent output must be structured. Free-form prose may accompany a card, but the UI should not depend on arbitrary text parsing.

- The model never calculates Free Cash. When AI is added, it can only call approved tools and explain deterministic results.

- AI integration will use the official OpenAI SDK through Netlify AI Gateway after the fake-data product loop is proven.

- AI integration will use Responses API tool/function calling and structured outputs.

- OpenAI Agents SDK is not part of v1. It is reserved for future agent loops, handoffs, guardrails, tracing, sessions, or complex orchestration.

- Vercel AI SDK is not part of the plan because the app is Netlify-based and does not need Vercel-specific chat UI patterns.

- Supabase Auth and Postgres will be added after the fake prototype, not before.

- Supabase Row Level Security is required for any user-scoped financial tables.

- Netlify Identity is not the default auth choice because this product needs database-level user isolation around financial data.

- Netlify Database is not the default database choice for MVP because Supabase Auth plus Postgres plus RLS is the clearer financial-data posture.

- The financial data provider layer is a deep module. It defines app-level operations for creating a connect session, handling connect callbacks, syncing accounts, syncing transactions, and syncing balances.

- MockProvider is the first provider implementation.

- TellerProvider is the first real provider candidate for Tyler/private beta.

- PlaidProvider is deferred until Teller coverage, mTLS complexity, public launch needs, or acquisition positioning justifies it.

- Both real providers should not be implemented immediately. The abstraction should support both, but only one real provider should be built after the fake prototype.

- Teller integration requires server-side mTLS handling. Teller certificates and private keys must never reach browser code.

- TellerProvider must isolate Teller-specific concepts such as enrollments, access tokens, and mTLS client behavior from the Free Cash engine.

- Before building full TellerProvider, the team should run a Teller feasibility spike from Netlify server-side code to confirm mTLS, local development, production deploy behavior, institution coverage, and credit-card transaction quality.

- If Teller mTLS or coverage fails, PlaidProvider becomes the first real provider.

- PlaidProvider should use Plaid Link on the frontend and Plaid backend APIs through server-side code when it is added.

- Provider tokens must be stored server-side and protected. The browser should never directly handle long-lived provider secrets.

- Manual sync comes before background or scheduled sync.

- The first real-data beta should be invite-only.

- Sync should be rate-limited per user and per provider.

- Sync logs should capture enough information to diagnose data freshness and provider failures.

- Teller balance calls should be minimized because production Balance is per API call.

- Free Cash snapshots should be cached or stored so the app does not recompute or resync unnecessarily.

- Netlify Scheduled Functions are acceptable for later regular jobs, but their execution limit means longer syncs should use background functions or another queue pattern.

- The MVP does not initiate payments, move money, automate transfers, or pay credit cards.

- The app must provide a delete-data flow before any real bank beta.

- Legal, privacy, and support affordances must exist, but they should not become a visible dashboard or standard settings-heavy product.

- Analytics should focus on product proof: Free Cash views, prompt-chip usage, agent questions, purchase simulations, true-balance reveals, missing-card nudge outcomes, sync failures, and negative Free Cash follow-up behavior.

- Monetization is not part of the first prototype. The product should be built cleanly enough to support future consumer, paid tier, B2B2C, white-label, or acquisition paths.

## Testing Decisions

- Tests should verify external behavior and user-visible outcomes, not implementation details.

- The Free Cash engine requires focused unit tests because it is the highest-risk deep module and owns the money math.

- Date-window tests should cover 28-day, 29-day, 30-day, and 31-day month behavior.

- Date-window tests should cover month-boundary cases where rent or major bills enter or leave the rolling calendar-month window.

- Engine tests should verify that Free Cash can be positive, zero, and negative.

- Engine tests should verify that credit-card purchases reduce Free Cash.

- Engine tests should verify that credit-card payments are not double-counted.

- Engine tests should verify that transfers between user accounts are not treated as spend.

- Engine tests should verify that refunds offset spend.

- Engine tests should verify that protected savings reduce spendable cash.

- Engine tests should verify that income and spending signs are interpreted consistently from normalized transaction data.

- Classifier tests should use representative messy transaction examples from fake data and later beta data, while avoiding provider-specific logic in the engine.

- Dedupe tests should cover likely credit-card payment pairs, partial payments, multiple card payments close together, and false positives.

- Explanation tests should verify that the engine returns bounded drivers and warnings that explain the number without requiring raw transaction dumps.

- Prompt chip tests should verify that no more than three chips are visible and that chips correspond to current state.

- Mock agent tests should verify supported intents return the correct card types and preserve the one-number product model.

- Card rendering tests should verify that each card type can render required data without layout-breaking missing fields.

- Provider abstraction contract tests should verify that MockProvider, TellerProvider, and PlaidProvider normalize accounts and transactions into the same internal shape.

- TellerProvider tests should mock mTLS/provider responses and verify normalization, token handling boundaries, and error mapping without hitting live Teller in normal CI.

- PlaidProvider tests, when added, should mock Link/token exchange and transaction sync responses and verify the same provider contract.

- API route tests should verify authentication boundaries, request validation, structured responses, and failure states.

- Security tests should verify that service keys, provider tokens, Teller certs, and private keys are not exposed to client bundles or logs.

- RLS tests should verify that users cannot read or mutate other users' financial rows.

- Sync tests should verify stale-data handling, manual refresh behavior, rate limiting, provider failure handling, and idempotency.

- AI tests, when AI is added, should verify tool schemas, structured output validation, refusal/fallback behavior, and that raw transaction histories are not passed to the model by default.

- End-to-end prototype tests should cover the core loop: open app, see Free Cash Today, ask why, simulate a purchase, show true balances, and return to the one-number home state.

- Mobile viewport tests should verify that the number, prompt chips, input, and cards do not overlap or overflow.

- Good tests for this product assert outcomes like "a card payment does not reduce Free Cash twice," not implementation details like "a helper function was called."

- There is no existing app test prior art in this workspace. The prior art is the planning documents: the investigation report and architecture decision report. The app should establish its own testing conventions around pure modules first, UI behavior second, provider contracts third, and real integrations last.

## Out of Scope

- Native iOS app.

- Native Android app.

- Push notifications.

- Public launch.

- Monetization.

- Paid subscriptions.

- B2B sales.

- White-label product.

- Affiliate revenue.

- PlaidProvider in the first fake-data prototype.

- TellerProvider in the first fake-data prototype.

- Building both TellerProvider and PlaidProvider immediately.

- OpenAI integration in the first fake-data prototype.

- OpenAI Agents SDK in v1.

- Vercel AI SDK.

- Netlify AI Gateway integration before the deterministic prototype works.

- Real bank connection before the fake prototype proves the interaction loop.

- Money movement.

- Payment initiation.

- Automatic credit-card payment.

- ACH transfers.

- Zelle payments.

- Investment advice.

- Formal financial planning.

- Tax advice.

- Credit underwriting.

- Full transaction dashboard.

- Budget category management.

- Charts as a primary UI.

- Permanent account detail screens.

- Full settings dashboard.

- User-customizable formulas in the MVP.

- Multi-user households.

- Business accounts.

- International bank coverage.

- Complex recurring bill prediction.

- Expected future income in the default Free Cash formula, unless validated later.

- Full legal/compliance program beyond minimum privacy, consent, and delete-data requirements for private beta.

## Further Notes

The product's center of gravity is behavioral, not analytical. The user should feel that the app answers "what can I do today?" without making them become a budgeting person.

The original north star remains:

```text
$43

Ask.
```

The biggest implementation risk is accidentally building the product that finance apps usually become: balances, tabs, charts, category management, and permanent account screens. Every technical module should defend the one-number interface.

The second biggest implementation risk is letting AI own financial truth. The LLM can explain, route, and format. It cannot calculate Free Cash or decide whether money moved.

The third biggest implementation risk is integrating bank providers too early. Bank integration is important, but the first proof is whether Tyler actually wants to live in this interaction model. Fake data can prove or disprove that faster.

The provider decision is deliberately stage-specific. Teller-first is the best current answer for Tyler/private beta because its development environment supports real bank data and has a larger early testing envelope. Plaid remains the likely later standard-provider path if the product moves toward public launch, broader coverage, or acquisition-readiness.

The app should be designed so acquisition remains optional. Provider abstraction, deterministic logic, clean tests, privacy discipline, and simple product metrics all preserve future options without forcing the product into an acquisition-only plan.

Provider pricing, model pricing, financial data rights rules, and Netlify AI Gateway model availability are drift-prone. Recheck them before implementing real bank integration, launching a beta, or committing to production AI costs.
