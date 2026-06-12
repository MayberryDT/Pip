# Pip Marketing Website Polish PRD

Document status: Optimized PRD for implementation
Owner: Tyler Mayberry
Date: June 12, 2026
Source material: Pip marketing website polish implementation plan, current marketing website PRD, and current repository state

## Problem Statement

Pip already has a public marketing foundation: a root landing page, app surface behind the product route, blog index, article pages, waitlist capture, SEO metadata, structured data, sitemap, robots rules, `llms.txt`, and a Distribb draft-intake endpoint. The direction is right, but the public experience still feels like a clean scaffold instead of a polished consumer landing site and content foundation.

The current homepage explains Pip, but it does not yet create a strong enough behavioral hook around the spending moment. Sections are too evenly weighted, the Pip character can feel decorative instead of integrated, and the visual rhythm relies too much on similar cards and spacing. The blog foundation exists, but the published articles are thin and read like outlines. Article pages cannot yet support rich product-led storytelling blocks, and the content system does not enforce enough quality gates to stop shallow published posts from going live.

The user problem the site must communicate is simple: people check their bank balance before spending, but that number often includes money already spoken for by bills, savings, subscriptions, pending card spend, and recent spending pressure. Pip should replace that misleading default with one calm daily number: Spendable Cash Today. The website must make that idea emotionally obvious, trustworthy, and memorable without turning Pip into a generic budgeting app, dashboard, finance coach, or financial-advice brand.

## Solution

Polish the existing marketing website into a stronger consumer landing page and content base while preserving the current architecture. The root marketing site remains public, the app remains separate, waitlist capture continues to work, and the static Markdown article direction stays in place. The implementation should refine the homepage narrative, deepen the first published articles, add rich article rendering blocks, add content quality gates, improve blog and article layout hierarchy, preserve trust boundaries, and document Distribb as draft intake only.

The homepage should lead with the behavioral promise:

"Before you spend, check Pip."

Supporting message:

Pip gives you one calm daily number: Spendable Cash Today. It helps you stop guessing from your bank balance without building a budget, spreadsheet, or finance dashboard.

The final experience should feel like a polished consumer landing page for a cute daily money companion with a serious trust layer. A new visitor should understand in under 10 seconds that Pip is cute, Pip gives one useful number, Pip should be checked before spending, and Pip does not require becoming a budget person.

The content experience should shift from placeholder SEO scaffolding to real product-led articles. The three pillar articles must become 900-1,500 word pieces with quick answers, examples, rich blocks, FAQs, CTAs, related links, and Pip-specific language. Any other article that remains published must meet a lower but still meaningful quality gate, otherwise it should return to draft. Distribb may accelerate draft creation, but no external draft source may publish public pages automatically.

## User Stories

1. As a first-time visitor, I want the hero headline to tell me what habit Pip changes, so that I understand the product before I scroll.

2. As a first-time visitor, I want the homepage to say "Before you spend, check Pip," so that the product attaches to a concrete daily moment.

3. As a first-time visitor, I want to see "Spendable Cash Today" in the first viewport, so that I know the product's central number.

4. As a first-time visitor, I want the site to explain why my bank balance can mislead me, so that Pip's value feels obvious.

5. As a first-time visitor, I want to understand that Pip is not a budget app, so that I do not expect categories, charts, or spreadsheets.

6. As a first-time visitor, I want the hero visual to show the product number and Pip together, so that the mascot feels connected to the app.

7. As a first-time visitor, I want the product promise to be understandable in under 10 seconds, so that I can decide whether to keep reading.

8. As a first-time visitor, I want a clear primary CTA, so that I can join the beta without hunting for the form.

9. As a first-time visitor, I want a secondary how-it-works path, so that I can learn more before joining.

10. As a mobile visitor, I want the CTA above the fold on common phone sizes, so that signup is reachable quickly.

11. As a mobile visitor, I want the phone mockup and Pip character to fit cleanly, so that the first viewport does not feel cramped.

12. As a mobile visitor, I want buttons, inputs, article blocks, and cards to avoid text overflow, so that the site feels finished.

13. As a skeptical visitor, I want to see that Pip uses read-only account data, so that account connection feels less risky.

14. As a skeptical visitor, I want to see that Pip cannot move my money, so that I understand the trust boundary.

15. As a skeptical visitor, I want provider credential handling described plainly, so that I know sensitive access is server-side.

16. As a skeptical visitor, I want to know I can delete stored financial data, so that I feel in control before joining.

17. As a skeptical visitor, I want cute brand moments separated from legal and security claims, so that Pip still feels financially serious.

18. As a beta prospect, I want the waitlist copy to be consistent across pages, so that every CTA feels like the same action.

19. As a beta prospect, I want a low-friction email form, so that joining does not require account creation.

20. As a beta prospect, I want clear success copy after signup, so that I know the submission worked.

21. As a beta prospect, I want duplicate submissions to fail gracefully or be accepted idempotently, so that I am not punished for trying again.

22. As a beta prospect, I want App Store and Google Play language to be accurate, so that planned native releases are not mistaken for live availability.

23. As a returning user, I want the app surface to remain accessible, so that the marketing polish does not break daily Pip usage.

24. As a returning user, I want OAuth and app callbacks to remain coherent, so that account connection is not disrupted by marketing changes.

25. As a visitor comparing tools, I want a bank-app-vs-Pip comparison, so that I understand the difference between a balance and a spending number.

26. As a visitor comparing tools, I want the bank app to be shown as incomplete rather than villainous, so that the explanation feels credible.

27. As a visitor comparing tools, I want a simple example number, so that "Spendable Cash Today" feels concrete.

28. As a visitor who dislikes budgeting, I want copy that avoids finance jargon, so that Pip feels approachable.

29. As a visitor who dislikes budgeting, I want the site to say no budget, no dashboard, and no spreadsheet, so that the product boundary is clear.

30. As a visitor who feels stressed about money, I want the tone to be calm and nonjudgmental, so that the site does not shame me.

31. As a visitor drawn to Pip's character, I want Pip to feel central to the product, so that the brand is memorable.

32. As a visitor drawn to Pip's character, I want Pip to feel soft without childishness, so that I can trust the product with money data.

33. As a visitor who wants detail, I want the homepage to show examples of questions Pip can answer, so that I understand the agent's supporting role.

34. As a visitor who wants detail, I want the number to come first and explanations second, so that Pip does not look like a generic chatbot.

35. As a reader from search, I want article introductions to include a quick answer, so that my question is answered without digging.

36. As a reader from search, I want articles to use short paragraphs and clear headings, so that finance content stays readable.

37. As a reader from search, I want concrete examples, so that abstract money concepts become easier to understand.

38. As a reader from search, I want Pip-specific framing, so that articles do not feel like generic personal finance filler.

39. As a reader from search, I want articles to avoid financial-advice claims, so that the product boundary stays clear.

40. As a reader from search, I want FAQs on article pages, so that common follow-up questions are answered in one place.

41. As a reader from search, I want internal links between pillar articles, so that I can continue through the product story naturally.

42. As a reader from search, I want an inline CTA inside long articles, so that I can join the beta when the concept clicks.

43. As a reader from search, I want a bottom CTA after each article, so that I have a clear next step after reading.

44. As a reader from search, I want related articles, so that the blog feels connected rather than isolated posts.

45. As a reader on mobile, I want rich article blocks to stack cleanly, so that examples and comparisons do not overflow.

46. As a reader of a long article, I want an "In this article" summary when there are enough sections, so that I can scan before reading.

47. As a content editor, I want rich article blocks for callouts, Pip says notes, money examples, comparisons, inline CTAs, pull quotes, and figures, so that articles can carry product-led storytelling.

48. As a content editor, I want malformed custom blocks to fail tests for published articles, so that broken content does not ship.

49. As a content editor, I want unknown custom blocks to fail loudly or degrade safely, so that unsupported syntax is not silently misrendered.

50. As a content editor, I want arbitrary HTML and scripts blocked, so that article content does not create injection risk.

51. As a content editor, I want published articles to have minimum word count, FAQ, related links, headings, and CTAs, so that placeholder posts cannot go live.

52. As a content editor, I want pillar articles to have a stricter 900-word minimum, so that the core search/content assets are substantial.

53. As a content editor, I want draft articles to be allowed to remain short, so that ideas can be stored without becoming public.

54. As a content editor, I want all published non-pillar posts to meet a meaningful minimum or return to draft, so that the blog does not mix polished pillars with thin published stubs.

55. As a content editor, I want article metadata to stay validated, so that titles, descriptions, slugs, dates, tags, SEO fields, FAQ, and related content remain complete.

56. As a content editor, I want the first three pillar articles rewritten around Pip's core product thesis, so that the blog supports the brand instead of just SEO.

57. As a content editor, I want the "Meet Pip" article to explain the companion as a behavior wrapper, so that the mascot has product meaning.

58. As a content editor, I want the bank balance article to show a simple money example, so that the problem is easy to remember.

59. As a content editor, I want the Spendable Cash Today article to define the number carefully, so that it is framed as decision support, not a guarantee.

60. As a content editor, I want draft articles from Distribb to be reviewed manually, so that generated content never becomes public without owner judgment.

61. As a content editor, I want the Distribb workflow documented, so that future contributors understand draft-only intake.

62. As a developer, I want article parsing to stay a small testable module, so that metadata, reading time, headings, custom blocks, and CTA detection can be verified outside React rendering.

63. As a developer, I want article rendering to stay a small component layer, so that custom blocks can evolve without a full CMS migration.

64. As a developer, I want a reusable Pip Says marketing component, so that homepage and article uses share one treatment.

65. As a developer, I want custom article blocks represented as structured data before rendering, so that validation and UI behavior are not tangled together.

66. As a developer, I want marketing metadata helpers to remain centralized, so that titles, canonical URLs, Open Graph tags, and descriptions stay consistent.

67. As a developer, I want structured data builders to remain centralized, so that Article, FAQ, Breadcrumb, WebSite, Organization, and future SoftwareApplication JSON-LD are testable.

68. As a developer, I want waitlist writes to stay behind server routes, so that public clients never write directly to database tables.

69. As a developer, I want CTA click events tracked separately from waitlist submission events, so that funnel analysis is possible.

70. As a developer, I want marketing analytics to avoid collecting unnecessary sensitive data, so that the public site remains privacy-conscious.

71. As a developer, I want the existing app route and public routes tested together, so that marketing work does not regress the product.

72. As a developer, I want old product names blocked in marketing tests, so that Free Cash, PIP Cash Today, and My Margin do not reappear.

73. As a developer, I want sitemap and robots behavior tested, so that published articles are discoverable and drafts/app routes are excluded as intended.

74. As a developer, I want the root marketing page to remain server-rendered except for necessary interactive pieces, so that performance stays strong.

75. As a designer, I want the homepage to vary section rhythm, so that it does not feel like repeated heading-card blocks.

76. As a designer, I want major sections to have distinct layouts, so that scrolling creates narrative momentum.

77. As a designer, I want cards reserved for repeated items or framed tools, so that the page does not become a stack of decorative panels.

78. As a designer, I want the hero to feel taller and more premium than supporting sections, so that the first impression has enough weight.

79. As a designer, I want the Pip character integrated in at least three intentional places, so that Pip is present without being overused.

80. As a designer, I want security and legal pages to remain restrained, so that trust language is not diluted by mascot-heavy treatment.

81. As an accessibility reviewer, I want semantic headings and landmarks, so that assistive technologies can navigate the site.

82. As an accessibility reviewer, I want meaningful images to have useful alt text and decorative images hidden, so that screen reader output is clean.

83. As an accessibility reviewer, I want visible focus states on links, buttons, forms, and article navigation, so that keyboard use works.

84. As an accessibility reviewer, I want soft palette colors checked for contrast, so that visual warmth does not reduce readability.

85. As an accessibility reviewer, I want article rich blocks to carry text labels instead of relying only on color, so that meaning remains accessible.

86. As a performance reviewer, I want images sized and lazy-loaded appropriately, so that the polished site does not become heavy.

87. As a performance reviewer, I want no unnecessary animation runtime added, so that the marketing pages stay lightweight.

88. As a performance reviewer, I want below-fold media lazy-loaded, so that first render remains fast.

89. As an SEO reviewer, I want updated homepage metadata aligned to the new headline, so that search previews carry the behavioral promise.

90. As an SEO reviewer, I want breadcrumb structured data on article pages, so that article hierarchy is explicit.

91. As an AI-answer reviewer, I want public pages and `llms.txt` to describe Pip consistently, so that answer engines summarize the product accurately.

92. As an operator, I want a launch checklist with unit tests, marketing render tests, smoke checks, visual QA, waitlist checks, and rollback criteria, so that the site does not ship on copy alone.

93. As an operator, I want rollback instructions for the homepage/app route boundary, so that beta usage can be restored quickly if marketing changes break a critical path.

94. As an operator, I want published-content quality checks to run before deploy, so that thin content cannot slip out under deadline pressure.

95. As Tyler, I want the site to make people think "I do not need to learn finance; I just need Pip," so that the marketing story matches the product vision.

## Implementation Decisions

- Preserve the current architecture: public marketing root, separate product app route, static version-controlled article content, server-side waitlist routes, sitemap/robots support, and structured metadata helpers.

- Use the current plan as a polish pass, not a rebuild. The implementation should refine the existing marketing modules, not introduce a CMS, new design system, app-store landing pages, pricing page, or full mascot animation system.

- Make the new homepage narrative order: hero, bank app vs Pip comparison, daily number explanation, companion psychology, how it works, what Pip can answer, trust boundaries, blog/content teaser, and final waitlist CTA.

- Use "Before you spend, check Pip." as the default hero headline. Use "Meet Pip" as the eyebrow, "Join the beta" as the primary CTA, "See how Pip works" as the secondary CTA, and "Read-only account data. Pip cannot move your money." as the trust line.

- Keep "Spendable Cash Today" as the public metric name. Avoid old or rejected language including Free Cash, PIP Cash Today, My Margin, safe-to-spend guarantees, finance command center, dashboard positioning, AI finance coach, wealth management, and financial advice claims.

- Treat Pip as a behavioral companion, not just a logo. Pip should visually interact with the hero mockup, appear in the companion psychology section, and power a recurring "Pip says" motif. Pip should not dominate trust, privacy, terms, or security surfaces.

- Build a reusable Pip Says presentation component with a compact option. Use it in homepage sections and rich article block rendering so the same pattern is not duplicated.

- Extend the article content system with a structured custom-block parser before rendering. Supported block types are callout, pip-says, money-example, comparison, inline CTA, pull quote, and figure.

- Keep custom article blocks intentionally constrained. The system should not execute arbitrary HTML, script tags, untrusted JSX, or full MDX runtime behavior in this polish pass.

- Custom block validation belongs in the content layer. Rendering should receive normalized block structures where possible, rather than parsing ad hoc syntax inside every visual component.

- Add article helper outputs for word count, H2 headings, inline CTA presence, and custom block validation status. Use those helpers for table-of-contents generation, article QA, and tests.

- For long articles with at least four H2 sections, generate a simple "In this article" block from H2 headings near the top of the article page.

- Add inline CTA rendering for authored CTA blocks. If a published article has no authored inline CTA, the page may insert one automatically around the midpoint, but authored CTA blocks are preferred for pillar articles.

- Preserve bottom CTAs on article pages, but align CTA copy around "Join the beta" and "Want the daily number?" instead of adding many competing CTA variants.

- Define three hard pillar articles: "Meet Pip: the cute money companion that gives you one daily number," "Why your bank balance is misleading," and "What is Spendable Cash Today?"

- Rewrite each pillar article to 900-1,500 words with a quick answer, relatable scenario, simple example or comparison, Pip-specific point of view, at least one rich block, FAQ, CTA, related links, and no regulated advice claims.

- Treat currently published non-pillar articles as launch-support articles. They may stay published only if they meet the minimum published-article quality gate. Otherwise, move them back to draft until expanded.

- Keep short future idea posts as drafts. Drafts may be thin; published content may not be thin unless a deliberate short-post content type is introduced later.

- Add published article quality gates: minimum 700 body words for published articles, minimum 900 body words for pillars, valid metadata, at least one tag, at least two FAQ entries, at least one related article, reading time of at least three minutes, at least one CTA path, and at least one substantive H2 after the quick answer.

- Do not add a short-post exception yet. A future content type for intentionally short notes can be introduced only when there is a real editorial need and a distinct quality standard.

- Improve the blog index hierarchy with a stronger product-led subhead, visual category pills, a more premium featured article treatment, and published-only rendering.

- Update article page layout with lighter tag treatment, improved title spacing, optional Pip avatar in author/meta treatment, generated table of contents for long articles, richer body blocks, compact related article cards, and clear CTAs.

- Preserve and verify existing SEO foundations: metadata helper, canonical URLs, Open Graph and Twitter metadata, sitemap, robots rules, Article JSON-LD, FAQ JSON-LD, and `llms.txt`.

- Add BreadcrumbList structured data for article pages. SoftwareApplication structured data is optional and should only be added if it does not imply iOS or Android availability before those releases exist.

- Update homepage metadata to align with the behavioral headline. Recommended title direction: "Pip - Before you spend, check one number." Recommended description direction: "Pip is a cute daily money companion that shows Spendable Cash Today, one calm number for what's actually okay to use today. No budget. No dashboard."

- Ensure pillar articles link naturally to the homepage, how-it-works, security, and the other pillar articles. Internal links should be useful, not keyword-stuffed.

- Keep Distribb as draft intake only. Distribb payloads may be stored as drafts for review, but must never create public article pages automatically.

- Document the marketing content workflow: external drafts are received, reviewed by a human, rewritten into Pip voice, converted into version-controlled article content, checked by quality tests, and only then published.

- Add marketing CTA click tracking where practical for hero, final CTA, blog/article CTA links, and inline article CTA blocks. Keep waitlist submission events separate.

- Preserve waitlist form behavior, source-page capture, UTM/referrer capture, success messaging, validation, and graceful failure handling.

- Use visual rhythm deliberately. The hero should have the largest vertical rhythm, major visual sections should feel more spacious, compact explanatory sections should use less space, and repeated card grids should not dominate the page.

- Do visual QA at phone, tablet, and desktop viewports, including 375x812, 390x844, 430x932, 768x1024, 1024x768, and 1440x900.

- Treat launch rollback as part of implementation. If the root polish breaks app access, auth callback behavior, Plaid/OAuth return behavior, waitlist submission, or public page rendering, implementation should stop and restore the previous working route/content behavior before continuing.

## Testing Decisions

- Tests should verify externally visible behavior: rendered copy, routes, published/draft visibility, metadata, structured data, CTA presence, waitlist behavior, article quality, sitemap entries, and old-name absence. Avoid tests that lock implementation details such as internal component names or parser-private intermediate shapes unless those shapes are intentionally exported as module contracts.

- Extend existing marketing page render tests to assert the new hero headline, Spendable Cash Today, Join the beta CTA, read-only trust line, app route availability, support page availability, blog rendering, article rendering, and absence of old product names.

- Extend existing content loader tests to cover published article quality gates, pillar article minimums, draft exclusion, slug uniqueness, related article validity, FAQ requirements, reading time minimums, and custom block validation.

- Add custom block parser tests for valid callout, pip-says, money-example, comparison, inline CTA, pull quote, and figure blocks.

- Add malformed custom block tests. Published articles with malformed blocks should fail tests. Drafts may contain malformed experimental syntax only if the loader can keep public builds stable, but published content must be clean.

- Add renderer tests that assert rich article blocks produce accessible, semantic output without requiring snapshots of every class name.

- Add article page tests for title, description, tags, body content, FAQ, CTA, related articles, Article JSON-LD, FAQ JSON-LD, and BreadcrumbList JSON-LD.

- Add blog index tests for featured article prominence, category pills, published-only rendering, and draft exclusion.

- Add sitemap tests to ensure published articles are included and drafts remain excluded.

- Add `llms.txt` tests or checks to ensure Spendable Cash Today, the security page, and "Pip does not move money" remain present after copy changes.

- Add copy boundary tests that fail if Free Cash, PIP Cash Today, My Margin, safe-to-spend guarantee language, finance command center, or financial advice positioning appears in public marketing surfaces.

- Add waitlist tests or route-level assertions covering valid email submission, duplicate behavior if supported by the API, invalid email rejection, configured and unconfigured Supabase states, and source-page/UTM capture.

- Add Distribb webhook tests covering missing secret, wrong secret, invalid payload, successful draft storage, skipped storage when Supabase is unconfigured, and the invariant that webhook intake cannot publish article content.

- Run the normal unit test suite after implementation. Run marketing page tests and content tests before any visual QA. Run a browser smoke pass after visual changes to verify mobile and desktop rendering.

- Visual QA should check hero CTA visibility, phone mockup sizing, Pip placement, sticky header spacing, mobile navigation, blog card rhythm, article title wrapping, rich block overflow, waitlist input/button stacking, footer wrapping, and color contrast.

## Out of Scope

- Full CMS migration.

- WordPress, Webflow, Ghost, Sanity, or other external content platform integration.

- Automatic publishing from Distribb.

- Distribb admin review UI or draft-to-PR automation.

- Native App Store or Google Play landing pages.

- Pricing page.

- Public account settings or login expansion from marketing pages.

- Financial advice content library.

- Dozens of SEO articles or an aggressive content program.

- Full Rive, animation, or 3D Pip character system.

- Reworking app onboarding, the Pip cash engine, financial provider integrations, auth architecture, or account deletion flows beyond keeping public trust claims accurate.

- Introducing a full MDX runtime or arbitrary embedded components.

## Further Notes

### Optimized Execution Plan

1. Add article quality gates and custom block validation first, so thin published content and malformed syntax cannot pass unnoticed.

2. Add the rich article parser and renderers, including reusable Pip Says treatment.

3. Rewrite the three pillar articles to the new standards and decide whether current non-pillar published posts stay published or return to draft.

4. Polish the homepage hero and section narrative, including the bank-vs-Pip comparison, daily number section, companion section, agent-support section, blog teaser, trust section, and final CTA.

5. Improve blog index and article page hierarchy after content structure is ready.

6. Update SEO/AEO/GEO details including metadata, breadcrumbs, internal links, and `llms.txt` alignment.

7. Document Distribb draft-only workflow and article quality rules.

8. Run unit tests, marketing/content tests, browser smoke checks, and visual QA across target viewports before implementation is considered done.

### Optimizer Summary

The supplied plan scored highly for specificity and product fit, but it needed PRD-level tightening around success metrics, rollback criteria, content quality enforcement, current-state reconciliation, and module boundaries.

Rubric used:

- Goal clarity and user value: 15
- Product positioning fidelity: 15
- Completeness of workstreams: 15
- Sequencing and dependencies: 10
- Feasibility with current codebase: 10
- Risk, trust, and rollback coverage: 10
- Content quality and SEO/AEO rigor: 10
- Testing and verification: 10
- Implementation specificity without path fragility: 5

Score trajectory: 78 -> 87 -> 92 -> 94 -> 94.

Final score: 94/100.

Substantive improvements made:

- Reconciled the plan's "three pillar articles" goal with the current site having five published launch articles by defining three strict pillars and a minimum quality gate for any other published post.

- Converted file-by-file implementation notes into stable module-level PRD decisions so the document remains useful even if code is reorganized.

- Added launch-risk controls around route/app preservation, Distribb draft-only behavior, waitlist integrity, content publishing gates, visual QA, and rollback criteria.

### Definition of Done

This PRD is complete when the marketing site feels like a polished consumer landing page for a cute money companion, has a serious enough trust layer, explains one daily number clearly, includes real product-led articles worth reading, prevents thin content from publishing, and preserves the existing app and waitlist behavior.
