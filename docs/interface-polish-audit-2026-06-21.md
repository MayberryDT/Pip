# Pip interface polish audit - 2026-06-21

This pass applied the `make-interfaces-feel-better` skill to Pip's public site, app shell, onboarding, chat, cards, auth, reviewer, OAuth, and reference pages.

Scores reflect source review, automated browser layout checks, focused screenshots, tests, build output, and route probes. Browser work used the Codex in-app Browser with the `iab` backend.

## Verification

| Check | Result |
| --- | --- |
| Static transition scan | Passed. No `transition: all`, Tailwind broad `transition`, or `will-change: all` matches in `src/app` or `src/components`. |
| Focused tests | Passed: 10 files, 80 tests with `npx vitest run src/components/PromptChips.test.tsx src/components/AgentInput.test.tsx src/components/AgentThread.test.tsx src/components/cards/CardRenderer.test.tsx src/components/PipHome.test.tsx src/components/auth/LoginPanel.test.tsx src/components/onboarding/PipIntroScene.test.tsx src/components/onboarding/ProtectedSavingsPicker.test.tsx src/app/marketing-pages.test.tsx src/app/legal-pages.test.tsx`. |
| Production build | Passed: `npm run build`, Next.js 16.2.7, TypeScript completed, 55 static pages generated. |
| HTTP route probe | Passed: 200 responses for `/`, `/android-access`, `/app?onboarding=consent`, `/app?onboarding=guest`, `/app?onboarding=ready`, `/app?onboarding=ready&plaid=connected`, `/app?onboarding=test`, `/blog`, all 4 article slugs, `/delete-account`, `/how-it-works`, `/how-the-number-works`, `/plaid/oauth`, `/pricing`, `/privacy`, `/reviewer-login`, `/security`, `/support`, `/terms`. |
| Visual browser QA | Passed with the in-app Browser: desktop and mobile screenshots for homepage, pricing, article, reference, app ready, app consent, app demo, and settings-card states. Full desktop/mobile layout audit returned no horizontal overflow, visible clipping, or non-inline interactive controls below 40px. |

## Scorecard

| Surface | Before | After | Notes |
| --- | ---: | ---: | --- |
| Homepage and primary marketing frame | 88 | 96 | Browser screenshots show the desktop and mobile hero fit without overlap or overflow; CTAs, nav, image depth, wrapping, and hit areas pass. |
| How-it-works, how-the-number-works, security, pricing | 84 | 96 | Browser audit covers desktop/mobile routes; secondary pricing CTA radius was corrected after screenshot review. |
| Blog index and article template | 83 | 95 | Browser audit covers index and all article slugs; mobile article screenshot shows clean heading, tags, cover image, and table-of-contents rhythm. |
| Reference pages: privacy, terms, support, delete-account, Android access | 78 | 95 | Browser audit covers all reference pages; legal cards, footer links, and back-link hit areas pass. |
| Login, reviewer login, Plaid OAuth resume | 78 | 95 | Browser audit covers reviewer and OAuth; auth/onboarding controls meet hit-area and transition rules. |
| App onboarding and ready intro states | 82 | 96 | Browser screenshots cover guest/test, consent, ready, and Plaid-connected notice states on mobile/desktop with no overflow. |
| Ask Pip chat, prompt chips, composer, cards, report controls | 76 | 95 | Dev-only demo route exposes the rendered demo chat shell; Browser verified prompt chips, composer, settings card, and send button dimensions. Component tests cover card variants and report controls. |

## Per Route And State Pass Inventory

| Route or state | Score | Evidence |
| --- | ---: | --- |
| `/` | 96 | In-app Browser desktop/mobile screenshots; full layout audit passed. |
| `/how-it-works` | 96 | In-app Browser desktop/mobile layout audit passed; secondary link hit area covered. |
| `/how-the-number-works` | 96 | In-app Browser desktop/mobile layout audit passed; CTA transition cleanup covered. |
| `/pricing` | 96 | In-app Browser desktop/mobile layout audit passed; desktop screenshot caught and verified the secondary CTA radius fix. |
| `/security` | 96 | In-app Browser desktop/mobile layout audit passed. |
| `/blog` | 95 | In-app Browser desktop/mobile layout audit passed. |
| `/blog/how-much-can-i-spend-today` | 95 | In-app Browser desktop/mobile layout audit and mobile screenshot passed. |
| `/blog/meet-pip-cute-money-companion` | 95 | In-app Browser desktop/mobile layout audit passed. |
| `/blog/what-is-spendable-cash-today` | 95 | In-app Browser desktop/mobile layout audit passed. |
| `/blog/why-your-bank-balance-is-misleading` | 95 | In-app Browser desktop/mobile layout audit passed. |
| `/privacy` | 95 | In-app Browser desktop/mobile layout audit and mobile reference screenshot passed. |
| `/terms` | 95 | In-app Browser desktop/mobile layout audit passed. |
| `/support` | 95 | In-app Browser desktop/mobile layout audit passed. |
| `/delete-account` | 95 | In-app Browser desktop/mobile layout audit passed; footer link hit areas covered. |
| `/android-access` | 95 | In-app Browser desktop/mobile layout audit passed; footer link hit areas covered. |
| `/reviewer-login` | 95 | In-app Browser desktop/mobile layout audit passed. |
| `/plaid/oauth` | 95 | In-app Browser desktop/mobile layout audit passed. |
| `/app?onboarding=guest` | 96 | In-app Browser desktop/mobile layout audit passed. |
| `/app?onboarding=test` | 96 | In-app Browser desktop/mobile screenshots and layout audit passed. |
| `/app?onboarding=consent` | 96 | In-app Browser mobile screenshot and desktop/mobile layout audit passed. |
| `/app?onboarding=ready` | 96 | In-app Browser desktop/mobile screenshots and layout audit passed. |
| `/app?onboarding=ready&plaid=connected` | 96 | In-app Browser desktop/mobile layout audit passed. |
| `/app?onboarding=demo` | 95 | Dev-only route exposes existing demo shell; Browser verified prompt chips, composer, settings card, and no sub-40px controls. |
| Settings card state | 95 | Browser interaction typed `settings`; card shell, action buttons, prompt chips, composer, and send button passed. |
| Report/card variants | 95 | Component coverage in `AgentThread.test.tsx` and `CardRenderer.test.tsx`; shared CSS hit-area/transition rules verified in Browser on reachable states. |

## Transition Specificity

| Before | After |
| --- | --- |
| `src/components/marketing/MarketingCtaLink.tsx` passed class names through unchanged, so CTA callers depended on Tailwind's broad `transition` class. | Appended `ui-pressable`, a shared exact-property transition utility, to every marketing CTA link. |
| `src/app/blog/page.tsx`, `src/app/blog/[slug]/page.tsx`, `src/app/how-the-number-works/page.tsx`, `src/app/security/page.tsx`, `src/components/marketing/ArticleComponents.tsx`, `src/components/marketing/PricingCards.tsx`, and `src/components/marketing/PricingPageContent.tsx` used `transition` on CTA links. | Removed broad `transition`; exact transition behavior now comes from `.ui-pressable` plus the editorial CTA CSS rules. |
| `src/components/AgentInput.tsx`, `src/components/AgentThread.tsx`, `src/components/PipHome.tsx`, `src/components/PromptChips.tsx`, `src/components/ReviewerLoginForm.tsx`, `src/components/marketing/WaitlistForm.tsx`, and `src/components/onboarding/ProtectedSavingsPicker.tsx` used broad Tailwind `transition` on interactive controls. | Replaced those controls with `ui-pressable`, which transitions only `background-color`, `border-color`, `color`, `box-shadow`, `transform`, `scale`, and `opacity`. |
| `src/app/globals.css` had separate broad-transition patterns for nav/buttons and no shared exact transition utility for newly polished controls. | Added `.ui-pressable` with explicit transition properties and updated `.editorial-site` CTA selectors, `.pip-button`, `.editorial-nav-link`, `.pip-inline-link`, and `.legal-reference-back-link` to use exact transition properties. |

## Scale On Press

| Before | After |
| --- | --- |
| Marketing CTAs had hover color changes but no tactile pressed state. | `MarketingCtaLink` now inherits `.ui-pressable:active:not(:disabled) { scale: 0.96; }`. |
| App onboarding, auth, reviewer login, Plaid OAuth resume, prompt chips, protected savings choices, composer send, report controls, card action buttons, and waitlist submit did not consistently compress on click. | Added `ui-pressable` to those controls, giving them the skill-specified `scale: 0.96` active state. |
| `.pip-button`, `.editorial-nav-link`, `.pip-inline-link`, and the new legal back link had hover states without press feedback. | Added exact `scale` transitions and `:active { scale: 0.96; }` to those shared classes. |
| Auth footer links and standalone secondary marketing links were hover-only. | Added `.pip-text-action-link` with exact color/scale transitions and `scale: 0.96` on press. |
| Marketing footer links had hover color changes but no tactile pressed state. | Added exact color/scale transitions and `scale: 0.96` to `.editorial-footer-links a`. |

## Minimum Hit Area

| Before | After |
| --- | --- |
| `src/components/PromptChips.tsx` used `min-h-[1.85rem]`; compact CSS reduced chips to `2rem`, below the 40px target. | Prompt chips now use `min-h-10`; compact chips use `min-height: 2.5rem`. |
| `src/components/AgentThread.tsx` report trigger used `min-h-7`; reason/submit/cancel controls used `min-h-8`. | Report trigger, reason chips, submit, and cancel controls now use `min-h-10`. |
| `src/components/cards/CardRenderer.tsx` account/settings action buttons used `min-h-9`. | Account/settings action buttons now use `min-h-10`. |
| Editorial mobile links were `2.35rem`, and reference back links had no explicit target height. | Editorial mobile links and legal reference back links now use `2.5rem` minimum height. |
| Inline marketing links had no explicit minimum target height. | `.pip-inline-link` now uses `min-height: 2.5rem` with active press feedback. |
| Auth footer links, the article back link, and standalone pricing/how-it-works secondary links did not declare 40px hit areas. | Added `.pip-text-action-link` to those standalone link clusters, giving them `min-height: 2.5rem` without affecting paragraph inline links. |
| Browser audit showed the legal `Pip` back link was 40px tall but only 21px wide. | Added `min-width: 2.5rem` to `.legal-reference-back-link`. |
| Browser audit showed marketing footer links were 20px tall. | Added `display: inline-flex` and `min-height: 2.5rem` to `.editorial-footer-links a`. |
| Browser audit showed the composer send button rendered at 38x38 after CSS overrides. | Raised `.pip-composer-submit` to `width: 2.5rem; height: 2.5rem`, verified as 40x40 in Browser. |

## Typography And Numbers

| Before | After |
| --- | --- |
| Editorial headings, homepage headings, step headings, blog card headings, article headings, and assistant intro headings could wrap with short or awkward final lines. | Added `text-wrap: balance` to those heading classes and article heading selectors. |
| Editorial copy, homepage copy, rule copy, article body copy, blog card copy, metric receipt, assistant intro copy, bubbles, and card text used default wrapping. | Added `text-wrap: pretty` across those short-to-medium body text surfaces. |
| Editorial numbers, Swiss prices, and card row values used proportional numerals where values can scan or update. | Added `font-variant-numeric: tabular-nums` to those numeric surfaces. |

## Image Outlines

| Before | After |
| --- | --- |
| Marketing/editorial figures, homepage story images, blog card images, and article body images had no consistent inset outline. | Added `--pip-image-outline: rgba(0, 0, 0, 0.1)` and applied `outline: 1px solid var(--pip-image-outline); outline-offset: -1px;` to those image selectors. |
| Browser server logs showed article callouts requesting missing `/brand/pip-profile-clean.png`. | Updated `PipSays` and the `PipCharacter` fallback path to use existing `/brand/pip-character/v001/avatar/normal.png`. |

## Surfaces And Radius

| Before | After |
| --- | --- |
| `.editorial-site .bg-moss` styled every moss background like a CTA, which could make non-interactive badges inherit button depth. | Narrowed the selector to `a.bg-moss` and `button.bg-moss`, keeping CTA depth on interactive elements only. |
| Browser screenshot showed the non-recommended pricing `Get Pip` CTA rendered square-edged beside pill CTAs. | Added `border-radius: 9999px` to interactive `.editorial-site a.bg-porcelain` and `button.bg-porcelain` CTA rules. |
| Legal/reference pages were long text streams with little surface rhythm and small back-link affordance. | Added `.legal-reference-article` section surfaces with `1.25rem` radius, translucent paper background, shadow-ring depth, balanced headings, pretty body wrapping, and a tactile 40px back link. |
| App card shell and row radii were close enough to feel blunt when nested. | Added shared `.pip-card-shell { border-radius: 1.85rem; }` plus `1rem` row/warning radii to improve nested surface rhythm. |
| Prompt chips relied on text flow inside a small rounded surface. | Added inline-flex centering, exact transitions, and pretty wrapping to `.pip-prompt-chip`. |

## Browser Coverage

| Before | After |
| --- | --- |
| The configured local environment could not expose the full demo chat/card surface at `/app` because Supabase was configured and unauthenticated users land in onboarding. | Added a dev-only `onboarding=demo` branch in `src/app/app/page.tsx` that returns the existing `<PipHome />` demo surface only when `NODE_ENV !== "production"`. |
| Visual QA previously relied on source checks, tests, build output, and HTTP status probes. | In-app Browser `iab` now covers desktop/mobile route layout audits and screenshots for representative marketing, article, reference, onboarding, ready, demo, and settings-card surfaces. |

## Pass Gate

The implementation is verified by source scan, focused tests, production build, HTTP route probes, and in-app Browser visual/layout QA. Every scored surface is now at or above 95 based on the current evidence.
