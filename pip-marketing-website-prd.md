# Pip Marketing Website PRD

Document status: Optimized implementation PRD
Owner: Tyler Mayberry
Date: June 11, 2026
Source material: Starter marketing website PRD plus current Pip repository context
Recommended implementation: Same repository as the existing Pip app
Primary public domain: spendwithpip.com
App surface: /app first, app.spendwithpip.com when domain routing is ready

## Problem Statement

Pip has a focused product idea but does not yet have a public website that explains it, builds trust, and creates an organic acquisition base. The current app experience owns the root route and is built for signed-in or beta use. That makes sense for product iteration, but it leaves new visitors without a clear public story before they are asked to connect accounts, join a beta, or understand why Pip is different from a normal budgeting app.

The user problem is simple: people look at their bank balance and treat it like spending money. That number is often misleading because it includes money already claimed by bills, savings, card purchases, pending obligations, and the uneven timing of income. Most people who need help with this do not want a budget dashboard, spreadsheet, financial education course, or generic AI finance coach. They want a calm daily answer to one question: "What is actually okay to use today?"

Pip needs a website that makes that product thesis clear in seconds. The site must make Pip feel cute, useful, trustworthy, and serious enough for account connection without drifting into corporate fintech language. It must also support search and AI-answer visibility around Pip's core concepts: Spendable Cash Today, misleading bank balances, no-budget spending, and daily money habits.

The marketing website must not weaken the existing app. The current beta app, auth flows, Plaid OAuth return flow, PWA install behavior, privacy/terms/support pages, and Supabase-backed live-data behavior must continue working while the root route becomes public marketing.

## Solution

Build a public Pip marketing website in the existing Next.js repository. The marketing website will own the root route and explain Pip as a cute daily money companion that shows one useful number: Spendable Cash Today. The app experience will move behind /app and later be available from app.spendwithpip.com.

The website will combine five jobs:

- Explain the product instantly: "The number your bank won't show you."
- Build account-connection trust with plain-English security and privacy claims.
- Convert interested visitors into beta waitlist signups.
- Create a repo-native article system for SEO, AEO, and GEO content.
- Prepare Pip for future App Store and Play Store distribution without overpromising a launch date.

The first version will not add a full CMS. Content will live in version-controlled Markdown or MDX source files with validated frontmatter, static article pages, generated metadata, structured data, and human review before publishing. Distribb can be used manually for research, drafts, article ideas, FAQs, and content calendars. Direct Distribb webhook intake is optional after the site foundation is stable and must not auto-publish.

The homepage will lead with:

Pip
The number your bank won't show you.

Supporting copy:

Pip is a cute daily money companion that shows what's actually okay to use today. No budget. No dashboard. Just one number.

Primary CTA:

Join the beta

Secondary CTA:

See how Pip works

The product story should stay concrete:

Your bank balance shows what exists. Pip shows what is actually okay to use today.

Open Pip. See today's number. Spend around it. Move on.

The definition of done is a public site that a new visitor can understand in under 10 seconds, a beta waitlist that works without requiring authentication, an app route that still works after the root migration, a trustworthy security page, a blog foundation ready for polished article publishing, and verification coverage that protects product language, routing, metadata, and core conversion paths.

## User Stories

1. As a first-time visitor, I want the homepage to explain Pip in one clear sentence, so that I know whether the product is relevant before I scroll.

2. As a first-time visitor, I want to understand Spendable Cash Today, so that I know what Pip gives me that my bank app does not.

3. As a first-time visitor, I want the site to avoid budget jargon, so that Pip feels approachable instead of like financial homework.

4. As a first-time visitor, I want the site to show the daily number concept visually, so that I understand the app without installing it.

5. As a first-time visitor, I want the site to explain why my bank balance can be misleading, so that Pip's value feels obvious.

6. As a first-time visitor, I want the site to say Pip is not a budget dashboard, so that I know I will not have to maintain categories or charts.

7. As a first-time visitor, I want the site to feel calm and friendly, so that money does not feel stressful from the first page.

8. As a first-time visitor, I want to see Pip's mascot and product language together, so that the brand feels distinct and memorable.

9. As a first-time visitor, I want the homepage to show a phone-like app preview, so that I can imagine the daily use case.

10. As a first-time visitor, I want a prominent Join the beta CTA, so that I can take action when the product clicks.

11. As a first-time visitor, I want a secondary how-it-works path, so that I can learn more before sharing my email.

12. As a skeptical visitor, I want to know whether Pip can move my money, so that I can assess account-connection risk.

13. As a skeptical visitor, I want to see plain-English security claims, so that I do not have to decode fintech compliance language.

14. As a skeptical visitor, I want to know that account connections are read-only, so that I understand the boundary before joining.

15. As a skeptical visitor, I want to know that provider tokens are handled server-side, so that browser exposure does not feel like a hidden risk.

16. As a skeptical visitor, I want to know how I can delete my data, so that I feel in control before joining the beta.

17. As a skeptical visitor, I want a visible privacy page, so that I can review what data Pip connects and stores.

18. As a skeptical visitor, I want a visible terms page, so that I understand the beta status and no-advice boundary.

19. As a skeptical visitor, I want a support page, so that I know where to go if connection or data issues happen.

20. As a skeptical visitor, I want a security page, so that trust details are easy to find without reading the full privacy policy.

21. As a beta prospect, I want to join the waitlist with only my email, so that the signup process is low friction.

22. As a beta prospect, I want confirmation after joining the waitlist, so that I know my signup was accepted.

23. As a beta prospect, I want duplicate waitlist submissions to behave gracefully, so that I am not punished for signing up twice.

24. As a beta prospect, I want the waitlist form to work on mobile, so that I can join from the device where I will use Pip.

25. As a beta prospect, I want the waitlist CTA to appear after trust content too, so that I can sign up once my concerns are answered.

26. As a mobile visitor, I want navigation that fits a small screen, so that I can reach How it works, Security, Blog, Support, and Join beta.

27. As a mobile visitor, I want text and buttons to fit without overlap, so that the site feels polished.

28. As a mobile visitor, I want fast page load, so that the website does not feel heavier than the product promise.

29. As a returning visitor, I want the app link to remain easy to find, so that I can get back to Pip after the marketing site takes the root route.

30. As a returning app user, I want installed PWA behavior to open the app surface, so that the marketing route does not interrupt daily use.

31. As a returning app user, I want auth callbacks to return me to the app, so that sign-in remains coherent after the root migration.

32. As a returning app user, I want Plaid OAuth returns to land in the right app flow, so that account connection still works.

33. As a reader from search, I want a direct answer near the top of each article, so that I quickly get the answer I searched for.

34. As a reader from search, I want short paragraphs and clear headings, so that finance content does not feel dense.

35. As a reader from search, I want examples that connect back to Pip, so that the article feels useful rather than generic.

36. As a reader from search, I want related internal links, so that I can continue learning without going back to Google.

37. As a reader from search, I want article CTAs to join the beta, so that I can try the product after learning the concept.

38. As a reader from search, I want FAQs on article pages, so that common follow-up questions are answered in one place.

39. As a reader from search, I want articles to avoid shame-based money language, so that the content feels supportive.

40. As a reader from search, I want Pip to avoid financial-advisor claims, so that the site does not overstate what the product does.

41. As an AI answer engine, I want concise page summaries and structured data, so that Pip's concepts can be represented accurately.

42. As an AI answer engine, I want llms.txt to identify the canonical product thesis and page map, so that public pages are easier to summarize.

43. As a search engine crawler, I want static article pages and canonical URLs, so that content can be indexed cleanly.

44. As a search engine crawler, I want sitemap and robots files, so that public content and private app surfaces are discoverable or excluded intentionally.

45. As a content editor, I want articles stored in version control, so that content changes can be reviewed before deploy.

46. As a content editor, I want required frontmatter validation, so that articles cannot publish without title, description, slug, dates, status, author, tags, and SEO fields.

47. As a content editor, I want draft and published statuses, so that unfinished content can exist without becoming public.

48. As a content editor, I want article slugs validated for uniqueness, so that content does not collide.

49. As a content editor, I want FAQ data in frontmatter or content metadata, so that visible FAQs and FAQ structured data stay aligned.

50. As a content editor, I want article quality rules, so that Pip's blog does not become generic finance filler.

51. As a content editor, I want the first content batch to be product-led, so that organic traffic reinforces the core product positioning.

52. As a content editor, I want a manual Distribb workflow first, so that generated drafts are reviewed before publishing.

53. As a content editor, I want optional webhook draft intake later, so that Distribb can accelerate content without becoming the publishing authority.

54. As a developer, I want the marketing site to live in the existing repository, so that brand, deployment, and app routing remain coordinated.

55. As a developer, I want the app surface isolated behind /app, so that the marketing root can launch without deleting product functionality.

56. As a developer, I want host-based routing for app.spendwithpip.com to be optional and reversible, so that domain setup does not block the v1 launch.

57. As a developer, I want public marketing routes to avoid requiring Supabase auth, so that anonymous visitors can browse and join the waitlist.

58. As a developer, I want waitlist writes to happen through a server route, so that public clients never write directly to Supabase tables.

59. As a developer, I want marketing analytics separated from authenticated product events, so that anonymous website traffic does not pollute app telemetry.

60. As a developer, I want a content-loading module with a small interface, so that article rendering, metadata, sitemap, and related links use the same source of truth.

61. As a developer, I want a metadata module with a small interface, so that canonical URLs and Open Graph tags are consistent across pages.

62. As a developer, I want a structured-data module with a small interface, so that Organization, WebSite, Article, FAQPage, and later SoftwareApplication JSON-LD are testable.

63. As a developer, I want a waitlist service module, so that email validation, dedupe, rate limiting, UTM capture, and Supabase persistence are tested outside UI.

64. As a developer, I want a marketing-event service module, so that event validation and privacy rules are centralized.

65. As a developer, I want a UTM attribution helper, so that all CTAs capture source page and campaign fields consistently.

66. As a developer, I want the public site to reuse existing Pip brand tokens and assets, so that it does not create a second design system.

67. As a developer, I want public copy guardrails tested, so that legacy product names and overclaiming language do not slip into pages.

68. As a developer, I want the existing app smoke tests to still pass, so that the root migration does not hide a product regression.

69. As a developer, I want public route tests for homepage, security, blog, article, sitemap, robots, and llms.txt, so that the website foundation is guarded.

70. As a developer, I want article tests to check rendered HTML instead of implementation internals, so that tests protect behavior without blocking refactors.

71. As a designer, I want the marketing pages to use warm cream, sage, moss, porcelain, taupe, river, coral, and gold accents, so that the site matches Pip.

72. As a designer, I want the hero to show the actual product idea, so that the first viewport is not just decorative brand copy.

73. As a designer, I want the mascot to be prominent on the homepage and restrained in article templates, so that charm does not distract from reading.

74. As a designer, I want cards to be used only for repeated items or framed tools, so that the site does not become a stack of decorative panels.

75. As an accessibility reviewer, I want semantic headings and landmarks, so that assistive technology can navigate the site.

76. As an accessibility reviewer, I want meaningful images to have alt text and decorative images to be hidden, so that screen reader output is useful.

77. As an accessibility reviewer, I want visible focus states and keyboard-accessible menus, so that navigation works without a mouse.

78. As an accessibility reviewer, I want color contrast verified, so that the soft palette remains readable.

79. As an accessibility reviewer, I want reduced-motion handling, so that animations do not make the site uncomfortable.

80. As a performance reviewer, I want static article generation, so that blog pages are fast and reliable.

81. As a performance reviewer, I want optimized images and no heavy animation libraries, so that the site remains lightweight.

82. As a performance reviewer, I want mobile Lighthouse targets, so that the public site is not slow on the devices Pip targets.

83. As a security reviewer, I want public waitlist endpoints rate limited, so that the site is not easy to spam.

84. As a security reviewer, I want webhook endpoints protected by a shared secret, so that outside systems cannot inject drafts.

85. As a security reviewer, I want no service-role secrets exposed to the browser, so that Supabase access remains server-only.

86. As a security reviewer, I want no raw IP address stored for marketing analytics unless explicitly required, so that data collection stays minimal.

87. As a legal reviewer, I want the site to avoid "safe to spend" guarantee language, so that Pip does not imply certainty.

88. As a legal reviewer, I want the site to say Pip is not financial, tax, investment, credit, or legal advice, so that the product boundary is clear.

89. As a legal reviewer, I want read-only account connection language to be accurate, so that trust claims match implementation.

90. As an operator, I want waitlist signup counts by source page and UTM, so that I can tell which pages convert.

91. As an operator, I want CTA click and article view events, so that I can evaluate the marketing funnel.

92. As an operator, I want failed waitlist submissions counted without exposing sensitive data, so that form issues are diagnosable.

93. As an operator, I want broken links and missing metadata caught before deploy, so that launch quality is controlled.

94. As an operator, I want a rollback path for the root migration, so that the app can be restored quickly if launch breaks beta use.

95. As an operator, I want launch readiness checks that include app, auth, Plaid callback, waitlist, and public pages, so that the website does not ship in isolation.

96. As a future App Store visitor, I want the site to say mobile app versions are coming without a date, so that expectations are set without overpromising.

97. As a future press or investor visitor, I want Pip's thesis to be clear and defensible, so that the product feels focused rather than like another finance app.

98. As a future partner, I want trust, provider, and data boundaries described plainly, so that Pip's risk profile is understandable.

99. As a future developer, I want the PRD to define what is out of scope, so that implementation does not accidentally become a CMS, advice portal, or dashboard.

100. As Tyler, I want the website to make people think "I do not need to learn finance; I just need Pip," so that the public brand matches the product vision.

## Implementation Decisions

- Pip will be positioned publicly as a cute daily money companion that gives one daily number: Spendable Cash Today.

- The primary homepage headline will be "The number your bank won't show you." The page must also use the phrase "Spendable Cash Today" prominently enough that visitors connect the tagline to the product metric.

- Public copy must avoid positioning Pip as a budgeting dashboard, bank replacement, investment app, debt payoff optimizer, credit marketplace, financial advisor, generic AI coach, or full financial planning product.

- Public copy must avoid guarantee language such as "safe to spend." The approved phrase is "what is actually okay to use today," with legal and trust pages clarifying that Pip is not advice and cannot guarantee outcomes.

- The marketing website will live in the existing Next.js repository and reuse the current Netlify deployment path, TypeScript setup, Tailwind configuration, security headers, brand tokens, and Pip brand assets.

- The root route will become the marketing homepage. The app will move to /app. This is the preferred v1 architecture because it gives spendwithpip.com a real public home while preserving a stable direct app route.

- app.spendwithpip.com will route to the app surface when DNS and host-based routing are ready. This is a launch enhancement, not a blocker for the v1 marketing site if /app works.

- The implementation must review all auth, sign-out, consent, Plaid OAuth, manual sync, delete-data, and PWA entry flows after the app surface moves. Any redirect or start URL that assumes root equals app must be updated.

- The PWA manifest must be revisited. If the installed beta should open the app, its start URL and scope should target the app surface or otherwise preserve the daily-use path after the marketing homepage takes root.

- The existing privacy, terms, and support content should be preserved and visually integrated into the marketing site. The security page is a required new trust page.

- The required v1 public routes are /, /how-it-works, /security, /support, /privacy, /terms, /blog, and /blog/[slug].

- Optional later public routes are /beta, /press, /app-store, /contact, /delete-data, and provider-specific education pages. These are not required for v1.

- The global marketing header will include How it works, Security, Blog, Support, Join beta, and a secondary App link when the app route is live.

- The global marketing footer will include Privacy, Terms, Support, Security, Blog, app link, and support contact information.

- The homepage will include a hero, problem section, how-it-works steps, companion/mascot section, not-a-budget-app section, trust/security section, FAQ, app-store-prep note, and final CTA.

- The hero visual will show a product-like phone mockup with Pip branding and a Spendable Cash Today example. The visual must communicate the real product state rather than generic finance imagery.

- The initial how-it-works steps are: connect your accounts, pick a savings cushion, check your daily number.

- The trust section must explicitly say that Pip uses read-only account data, cannot move money, stores provider access credentials server-side only, provides a delete-data path, and is in beta.

- The initial homepage FAQ must answer what Spendable Cash Today is, whether Pip is a budget app, whether Pip moves money, why Pip differs from a bank balance, what accounts users connect, what the savings cushion is, whether app store versions are available, and whether users need to understand finance.

- The site will include a beta signup form. The only required visible field is email. Hidden or derived fields may include source page, referrer, UTM fields, consent copy version, and timestamp.

- Waitlist signup will use a server route, not direct browser writes to Supabase. The route will validate email format, normalize email for dedupe, apply basic rate limiting, capture attribution, return generic success for duplicate signups, and avoid leaking whether an email is already stored.

- A Supabase-backed marketing_waitlist table is recommended for v1. It should store normalized email, display email, source page, UTM fields, referrer if available, consent text version, timestamps, and status. It should not store raw financial data or app user data.

- Anonymous marketing analytics should not reuse the authenticated product_events table as the primary store. The existing product_events model is user-scoped and authenticated. Marketing telemetry should use a separate marketing_events table or a server-side event sink that supports anonymous traffic with minimal data collection.

- Marketing event names for v1 are marketing_page_view, marketing_cta_clicked, waitlist_signup_submitted, waitlist_signup_succeeded, waitlist_signup_failed, blog_article_viewed, blog_cta_clicked, and outbound_app_link_clicked.

- Marketing event properties should be limited to page, slug, referrer, UTM fields, CTA label, article tags, status code class, and anonymous session identifier if needed. Raw IP addresses should not be stored as analytics data. If rate limiting needs an IP-derived value, use a short-lived hash or infrastructure-level control.

- Public Supabase tables must have RLS enabled. Public clients must not receive service-role credentials. Server routes own any privileged writes. Current Supabase documentation and changelog should be checked before implementation work begins because Supabase conventions change.

- Content will be repo-native for v1. Use Markdown or MDX files with frontmatter validation. MDX is preferred if custom article components are needed; plain Markdown is acceptable for the first article renderer if it reduces build risk and still supports the required content model.

- Article source records require title, description, slug, published date, updated date, author, status, tags, SEO title, and SEO description.

- Optional article fields are featured, FAQ, canonical URL, Open Graph image, excerpt, related article slugs, and draft notes.

- Article statuses are draft, scheduled, and published. Only published articles are included in public indexes, sitemap, related links, and static params.

- The content loader is a deep module. It should expose a small interface for listing published articles, fetching one article by slug, validating frontmatter, calculating reading time, finding featured articles, and deriving related articles.

- The content loader should fail builds or tests on duplicate slugs, missing required metadata, invalid dates, invalid status values, invalid canonical URLs, or FAQ entries without question and answer text.

- The article renderer should render H1, description, published date, updated date when different, author, reading time, visible body content, FAQ block when present, related articles, and beta CTA.

- Article pages must generate canonical URLs, Open Graph metadata, Twitter card metadata, Article structured data, and FAQPage structured data when FAQ exists.

- The metadata builder is a deep module. It should create page titles, descriptions, canonicals, Open Graph fields, and Twitter card fields from one typed input.

- The structured-data builder is a deep module. It should create Organization, WebSite, Article, FAQPage, and later SoftwareApplication JSON-LD from typed inputs.

- The public site will include sitemap.xml, robots.txt, and llms.txt. The sitemap should include public marketing pages and published articles. Robots should avoid indexing private app/auth/API surfaces unless there is a clear reason to expose them.

- llms.txt will summarize Pip, define Spendable Cash Today, identify the public canonical pages, explain the product thesis, and note that Pip is not a financial advisor or money-movement product.

- The first content batch will launch with five polished published articles and keep the remaining seven as draft or scheduled candidates unless quality is already high.

- The first five launch articles are: Meet Pip: the cute money companion that gives you one daily number; Why your bank balance is misleading; What is Spendable Cash Today?; Budgeting is hard. Pip uses one number instead.; How much can I spend today?

- The next seven article candidates are: How to stop overspending without tracking every purchase; Why checking your bank balance can backfire; Daily spending allowance vs budget; What is a savings cushion?; Why cute finance apps are not a gimmick; What does it mean when Pip says $0 today?; How Pip helps you spend less without feeling like a budget app.

- Content pillars are cute money companion, bank balance replacement, no-budget spending, behavioral spending, and Pip product education.

- Every article should include a direct answer near the top, clear H2/H3 structure, short paragraphs, concrete examples, internal links, product CTA, and visible FAQ when FAQ schema is emitted.

- Articles must cite external sources only when making factual external claims. Product-thesis claims can be written from Pip's own point of view without padding the article with generic citations.

- Content quality rules are strict: no generic finance filler, no "10 budgeting tips" without a Pip-specific angle, no investment advice, no loan recommendations, no credit-card recommendations, no tax advice, no guaranteed outcomes, and no shame-based language.

- Distribb is a content growth input, not the website architecture. For v1, use it manually for keyword ideas, content calendars, outlines, FAQ ideas, title variants, and draft starting points.

- The optional v1.5 Distribb webhook will accept drafts only. It must validate a shared secret, store a received payload with source, slug, title, status, and timestamp, and never publish directly.

- A future marketing_content_drafts table may use statuses received, reviewed, accepted, rejected, and published. GitHub PR automation is out of scope for v1 unless it becomes trivial after the draft store exists.

- Design will reuse the current Pip palette and brand direction: warm cream background, porcelain surfaces, ink text, sage/moss accents, soft taupe lines, selective coral/gold emphasis, elegant serif display type, readable sans body, and existing Pip wordmark and mascot assets.

- The marketing site should feel cute, calm, soft, trustworthy, consumer-friendly, and non-technical. It must not feel like stock fintech, a chart-heavy dashboard, a corporate blue finance site, or a compliance brochure.

- The marketing experience should use visual assets. It should use the existing Pip wordmark and raster mascot assets for brand continuity, plus product-like UI mockups that show the actual Spendable Cash Today concept.

- Buttons should include clear labels and icons where useful. The Join beta CTA should remain text-forward because it is a primary command.

- Cards should be used for repeated content such as article cards, FAQ blocks, trust facts, and phone mockup panels. Do not wrap page sections in decorative nested cards.

- Text must fit on mobile and desktop without overlap. Components with fixed-format surfaces such as phone mockups, CTA buttons, article cards, and navigation controls need stable dimensions and responsive constraints.

- Accessibility requirements include semantic landmarks, heading order, keyboard navigation, visible focus states, alt text for meaningful images, hidden decorative images, color contrast checks, reduced-motion handling, and no critical text baked only into images.

- Performance requirements include static article rendering, optimized image usage, no heavy animation libraries, lazy loading non-critical visuals, avoiding unnecessary third-party scripts, and mobile Lighthouse targets of Performance 90+, Accessibility 95+, Best Practices 95+, and SEO 95+.

- Legal and trust page requirements include beta status, account data types, transaction data types, AI chat data, analytics, Plaid usage, no bank username/password storage, server-side provider token handling, deletion path, support contact, no money movement, no advice, and user responsibility.

- Launch should be phased. Phase 1 is route and app isolation. Phase 2 is marketing shell and homepage. Phase 3 is core trust pages. Phase 4 is content engine and SEO plumbing. Phase 5 is seed content. Phase 6 is waitlist and marketing events. Phase 7 is optional Distribb draft intake. Phase 8 is launch QA and rollback readiness.

- Phase 1 exit criteria: root marketing route exists in development, app route renders the existing app experience, auth callback path works, Plaid OAuth return path works, and PWA start behavior has an explicit decision.

- Phase 2 exit criteria: homepage renders on mobile and desktop, header/footer links work, primary and secondary CTAs are visible, and product copy explains Pip in under 10 seconds.

- Phase 3 exit criteria: how-it-works, security, support, privacy, and terms pages render; existing legal claims remain covered; and no trust page contradicts the current app implementation.

- Phase 4 exit criteria: article loader validates content, blog index renders, article pages render, metadata generates, structured data generates, sitemap/robots/llms files exist, and draft articles are not public.

- Phase 5 exit criteria: at least five polished articles are published, related links work, visible FAQ matches FAQ schema, and content passes the quality rules.

- Phase 6 exit criteria: waitlist submission validates input, dedupes email, stores attribution, handles success/failure states, and records privacy-safe marketing events.

- Phase 7 exit criteria: optional webhook validates its secret, stores draft payloads as drafts only, and has tests proving it cannot publish content.

- Phase 8 exit criteria: app route smoke passes, marketing route smoke passes, auth and provider callback flows are verified, mobile screenshots are reviewed, Lighthouse targets are checked, metadata is checked, broken links are checked, and rollback instructions are written.

- Root migration rollback path: keep the app route implementation isolated enough that root can temporarily redirect or render the app again if the marketing launch breaks beta-critical flows. The rollback should not require deleting the marketing components or content source.

- Final acceptance criteria: public root explains Pip, app route still works, beta signup works, security page exists, blog index and article pages render, metadata and structured data work, sitemap/robots/llms exist, no legacy public product names appear, no financial-advice claims appear, and verification commands pass.

## Testing Decisions

- Good tests will verify externally visible behavior, not implementation details. Tests should assert rendered copy, route responses, metadata, schema output, validation behavior, event payload boundaries, and navigation outcomes.

- Existing testing patterns should be reused: Vitest for route/module/component behavior, React static rendering tests for public pages, Playwright for end-to-end app and marketing smoke paths, and existing deployment/security/rebrand guardrail tests as examples.

- The public product-language guardrail should be extended so marketing pages and content cannot accidentally expose legacy product names, old metric labels, "safe to spend" guarantees, or financial-advisor positioning.

- Route tests should verify that the root route renders the marketing homepage and /app renders the existing app surface after migration.

- Callback tests should verify that sign-in, consent, Plaid OAuth return, sign-out, and delete-data flows still route to the app surface when appropriate.

- Manifest tests should verify the chosen PWA start URL, scope, name, icons, and display behavior after root is no longer the app.

- Content loader tests should cover valid articles, drafts excluded from public lists, duplicate slugs, missing frontmatter, invalid dates, invalid status, reading-time calculation, featured article selection, related article fallback, and FAQ validation.

- Article renderer tests should verify H1, description, author, dates, reading time, body content, CTA, FAQ block, and related links.

- Metadata tests should verify canonical URLs, titles, descriptions, Open Graph fields, Twitter fields, Article structured data, FAQPage structured data, Organization structured data, and WebSite structured data.

- Sitemap tests should verify required public pages, published article URLs, no draft article URLs, and no private app/auth/API surfaces.

- Robots tests should verify public content is crawlable and private or app-like surfaces are intentionally disallowed where appropriate.

- llms.txt tests should verify that it names Pip, Spendable Cash Today, canonical public pages, the product thesis, and the no-advice/no-money-movement boundaries.

- Waitlist service tests should cover valid email, invalid email, normalized duplicate email, attribution capture, generic duplicate success, rate-limit behavior, Supabase unavailable behavior, and redaction of sensitive error details.

- Waitlist UI tests should cover empty input, invalid input, submitting state, success state, failure state, duplicate success state, keyboard submission, and mobile layout.

- Marketing event tests should cover allowed event names, rejected event names, property allowlist, anonymous session handling, no raw IP storage, and skipped behavior when the event sink is unavailable.

- Distribb webhook tests should cover missing secret, wrong secret, valid payload, invalid payload, draft-only storage, duplicate slug behavior, and proof that no public article is created directly from webhook intake.

- Accessibility tests should include semantic heading checks, keyboard navigation, focus visibility, form label coverage, image alt behavior, and color contrast review.

- Visual QA should use desktop and mobile screenshots of homepage, how-it-works, security, blog index, article page, waitlist states, and app route after migration.

- E2E smoke should cover a visitor landing on the homepage, opening how-it-works, opening security, joining the waitlist, reading an article, navigating to the app, and confirming the app still shows the expected Pip experience.

- Existing app tests must still pass. The marketing implementation is not complete if it breaks Spendable Cash Today rendering, auth, consent, Plaid connection, sync, agent chat, privacy, terms, support, deployment checks, or rebrand checks.

- Manual QA should include mobile browser review, keyboard-only navigation, reduced-motion setting, preview deploy metadata, link checking, and Lighthouse targets.

- The final verification command set should include unit tests, E2E tests that are feasible in the local environment, build, deployment checks, Netlify bundle checks, and a focused marketing smoke path. Live authenticated smoke remains required only when the implementation touches production-authenticated flows.

## Out of Scope

- Building a full CMS in v1.

- Building WordPress, Webflow, Ghost, Sanity, or another external CMS in v1.

- Autopublishing Distribb output.

- Building GitHub PR automation for content drafts in v1.

- Publishing more than the first high-quality article batch if quality is not ready.

- Turning Pip into a generic personal finance blog.

- Adding investment, tax, debt payoff, credit card, loan, or financial-advice content.

- Adding money movement, payment initiation, transfers, or automated account actions.

- Rebuilding the existing app experience as part of the marketing site.

- Adding a dashboard, tabbed finance portal, or permanent balance/transaction marketing demo that contradicts the product thesis.

- Building native iOS or Android apps.

- Showing App Store or Google Play badges as live download links before the apps exist.

- Adding a separate design system.

- Adding heavy animation libraries or third-party marketing scripts that threaten performance.

- Adding public community features, comments, forums, calculators, quizzes, or lead magnets unless a later PRD approves them.

- Changing the deterministic Spendable Cash Today engine.

- Changing Plaid provider behavior except where routing/callback preservation is required by the app route move.

- Publishing legal claims that have not been checked against the current implementation.

## Further Notes

### Optimizer Rubric

- Positioning and goal clarity: 12 points. High quality means the PRD can be evaluated against a measurable public promise, not just a vibe.

- Scope, IA, and user journeys: 12 points. High quality means all required visitor, app-user, content-reader, and operator flows are represented.

- Content, SEO, AEO, and GEO completeness: 14 points. High quality means content model, metadata, schema, sitemap, robots, llms.txt, article quality, and launch content are defined.

- Technical architecture and module depth: 16 points. High quality means route ownership, app isolation, content modules, SEO modules, waitlist services, and event services are decomposed into testable boundaries.

- Data, analytics, and conversion safety: 10 points. High quality means anonymous marketing data, waitlist storage, rate limiting, privacy, and event capture are specified without abusing authenticated app tables.

- Sequencing, dependencies, and rollout: 12 points. High quality means phases have exit criteria, app-route migration has a rollback path, and callback/PWA consequences are explicit.

- Trust, legal, accessibility, and performance: 12 points. High quality means user trust claims, no-advice boundaries, accessibility, and Lighthouse-level performance are first-class requirements.

- Testing and acceptance rigor: 12 points. High quality means the plan says exactly what should be tested and names prior repo patterns to reuse.

### Final Score

Final optimized score: 96/100.

- Positioning and goal clarity: 12/12
- Scope, IA, and user journeys: 12/12
- Content, SEO, AEO, and GEO completeness: 14/14
- Technical architecture and module depth: 15/16
- Data, analytics, and conversion safety: 9/10
- Sequencing, dependencies, and rollout: 12/12
- Trust, legal, accessibility, and performance: 12/12
- Testing and acceptance rigor: 10/12

Score trajectory after the to-prd expansion: 84 -> 91 -> 95 -> 96 -> 96 -> 96.

The score plateaued at 96 because the remaining uncertainty is implementation-dependent: exact MDX package choice, final domain routing mechanics, production analytics sink, and live callback behavior need to be proven in code and preview deploys.

### Substantive Optimization Changes

- Resolved the biggest open routing decision: root becomes marketing, the app moves to /app, and app.spendwithpip.com is a domain-routing enhancement rather than a v1 blocker.

- Split anonymous marketing telemetry and waitlist data away from authenticated product_events, which better fits the existing Supabase model and lowers privacy/security risk.

- Added phase exit criteria, rollback requirements, PWA/auth/Plaid callback checks, and explicit tests so the plan can be implemented without breaking the current beta app.

### Launch Assumptions

- spendwithpip.com will be configured as the canonical public domain before public launch. Preview deploys may exist, but canonical metadata should point at the production domain when available.

- App-store versions are future-facing. The website may say they are coming, but it must not show live store badges or dates until those assets are real.

- Distribb starts as a draft/research tool. Direct webhook intake is optional and draft-only.

- Supabase schema and RLS details should be verified against current Supabase documentation before implementation, especially if adding public tables, server-only writes, or rate-limiting helpers.

- The existing app PRD remains the source of truth for the product itself. This PRD governs the public marketing website, blog/AEO foundation, waitlist, and route migration around the app.
