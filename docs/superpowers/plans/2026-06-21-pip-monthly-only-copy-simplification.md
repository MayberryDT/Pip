# Pip Monthly-Only Copy Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Pip's public website, app handoff, trust answers, metadata, and content match the new strategy: one monthly price, one way to pay, decision-support language, and a shorter proof-forward marketing page.

**Architecture:** Treat pricing as centralized product policy, not a page-only edit. Update the pricing constants, pricing UI, trust-policy answers, public copy, content inventory, and tests in one compile-safe pricing checkpoint, then tighten language and visual rhythm in separate checkpoints. Keep the existing Next.js App Router structure and marketing component system.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Tailwind utility classes plus `src/app/globals.css`, local production build verification, Codex in-app Browser with `iab` backend for visual QA.

---

## Optimizer Rubric

Initial plan score: **82/100**.

Rubric:
- **Goal clarity and scope control (15):** High means the plan clearly separates monthly-only pricing, copy boundaries, app handoff, and visual polish without adding checkout or unrelated product work.
- **Completeness across source surfaces (20):** High means constants, pages, trust answers, metadata, articles, `llms.txt`, tests, and browser QA are all covered.
- **Sequencing and compile safety (20):** High means every implementation checkpoint can compile and run focused tests; failing-test steps are not committed as broken states.
- **Risk controls (15):** High means the plan calls out false-positive tests, Android pricing restrictions, auth/Supabase handoff behavior, browser verification, and rollback triggers.
- **Testability and evidence (15):** High means there are exact focused tests, full-suite/build gates, and browser acceptance criteria.
- **Frontend/copy quality (10):** High means the plan protects Pip's specific voice: one daily number, read-only trust, paid model, no approval/safety overclaiming.
- **Maintainability (5):** High means the plan keeps one source of truth and avoids new abstractions.

Optimization trajectory: **82 -> 90 -> 94 -> 95 -> 95 -> 95**.

Substantive improvements made during optimization:
- Reordered monthly-only pricing as one compile-safe checkpoint instead of deleting `pipPricing.weekly` before updating consumers.
- Replaced the broad copy-boundary test with a production-copy-only scanner so tests can still contain banned phrases as assertions.
- Added explicit preflight, rollback triggers, Android restrictions, and browser QA gates.

---

## Assumptions

- Keep the current monthly price: `$7.99/month`.
- Remove weekly as a public pricing option everywhere in marketing, trust-policy answers, content, metadata, and `llms.txt`.
- "One way to pay" means one public subscription option: monthly only.
- Do not build payment-provider checkout or subscription plumbing in this plan.
- Keep "monthly savings" product language. It is unrelated to subscription cadence.
- Avoid certainty-heavy copy such as "actually okay to use today", "okay to use today", "safe to spend", and purchase examples that approve spending with "Yes."
- Public `Get Pip` CTAs may continue to link to `/app`, but `/app` must not show a fake ready-state money screen for a new unauthenticated visitor.

## Success Criteria

- Public pricing shows exactly one plan: `$7.99/month`.
- Public marketing/trust copy contains no `$2.99/week`, `weekly plan`, `weekly pricing`, or `pipPricing.weekly`.
- Public marketing, app handoff, and agent policy copy do not use `actually okay to use today` or `okay to use today`.
- The Ask Pip purchase example describes purchase impact instead of approving the spend.
- Header navigation labels the mechanics route clearly.
- `/app` without auth or Supabase config presents setup/sign-in, not a fake money-ready state.
- Homepage remains visually polished but has less low-information scroll after the hero.
- Verification passes: focused Vitest files, full `npm run test`, `npm run build`, and in-app Browser QA at desktop and 390px.

## Non-Goals

- No checkout provider integration.
- No subscription entitlement implementation.
- No pricing A/B test.
- No redesign of the authenticated product UI beyond the unauthenticated handoff behavior.
- No changes to monthly savings, savings goals, or cash calculation logic.

## File Map

Modify:
- `src/lib/marketing/pricing.ts` - single monthly plan source of truth.
- `src/components/marketing/PricingCards.tsx` - one-card pricing UI.
- `src/components/marketing/PricingPageContent.tsx` - one-price page and FAQ.
- `src/app/page.tsx` - monthly-only metadata/copy, final CTA, safer Ask Pip example.
- `src/app/pricing/page.tsx` - monthly-only metadata.
- `src/lib/marketing/site.ts` - monthly-only site descriptions.
- `src/lib/trust/pip-trust-policy.ts` - monthly-only pricing policy and answer.
- `src/app/layout.tsx` - safer global metadata.
- `src/components/auth/LoginPanel.tsx` - safer setup headline and read-only trust copy.
- `src/app/app/page.tsx` - no-Supabase fallback renders guest setup state.
- `src/components/marketing/MarketingLayout.tsx` - clearer number-mechanics nav label.
- `src/app/how-it-works/page.tsx` - more concrete first-screen copy.
- `src/app/how-the-number-works/page.tsx` - clearer receipt/trust copy.
- `src/app/globals.css` - tightened marketing vertical rhythm and single-plan layout.
- `public/llms.txt` - monthly-only pricing.
- `content/articles/what-is-spendable-cash-today.md` - safer "spending room" wording.
- `content/articles/meet-pip-cute-money-companion.md` - safer FAQ wording.
- `content/articles/why-pip-is-paid.md` - monthly-only draft outline.
- `src/lib/marketing/pricing.test.ts` - one-plan assertions.
- `src/app/marketing-pages.test.tsx` - public page, pricing, `llms.txt`, nav, app handoff, and CSS assertions.
- `src/lib/trust/pip-trust-policy.test.ts` - monthly-only trust answer assertions.
- `src/lib/marketing/content.test.ts` - removed weekly draft expectation.

Create:
- `src/lib/marketing/copy-boundary.test.ts` - production-copy guard for monthly-only and decision-support language.

Delete:
- `content/articles/weekly-pricing-for-a-daily-spending-app.md` - obsolete draft.

---

### Task 0: Preflight and Execution Safety

**Files:**
- No source edits.

- [ ] **Step 1: Confirm workspace and branch state**

Run:

```bash
pwd
git status --short --branch
```

Expected:
- `pwd` is `/home/tyler/.codex/worktrees/8794/Pip`.
- Worktree contains this plan file and no unrelated source edits.

- [ ] **Step 2: Create a branch before implementation if needed**

If `git status --branch` shows `HEAD (no branch)`, create a branch:

```bash
git switch -c codex/pip-monthly-only-copy
```

Expected: branch switches successfully.

- [ ] **Step 3: Baseline focused tests**

Run:

```bash
npm run test -- src/lib/marketing/pricing.test.ts src/app/marketing-pages.test.tsx src/lib/trust/pip-trust-policy.test.ts src/lib/marketing/content.test.ts src/app/pip-language-boundary.test.ts
```

Expected: current baseline should pass before edits. If it does not, stop and classify whether the failure is pre-existing or caused by the plan file.

---

### Task 1: Add Red Tests for Monthly-Only and Copy Boundaries

**Files:**
- Modify: `src/lib/marketing/pricing.test.ts`
- Modify: `src/app/marketing-pages.test.tsx`
- Modify: `src/lib/trust/pip-trust-policy.test.ts`
- Modify: `src/lib/marketing/content.test.ts`
- Create: `src/lib/marketing/copy-boundary.test.ts`

Do not commit after this task. These tests are expected to fail until Task 2 and Task 3 are implemented.

- [ ] **Step 1: Update pricing constants test**

Replace `src/lib/marketing/pricing.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  pipPaidTrustLine,
  pipProductAccess,
  pipPricing,
  pipPricingPlans,
  pipSubscriptionCaveat,
} from "@/lib/marketing/pricing";

describe("marketing pricing constants", () => {
  it("defines one monthly paid product-access pricing model", () => {
    expect(pipProductAccess).toMatchObject({
      status: "available",
      primaryLabel: "Get Pip",
    });
    expect(pipPricing.monthly.displayPrice).toBe("$7.99/month");
    expect("weekly" in pipPricing).toBe(false);
    expect(pipPricingPlans.map((plan) => plan.id)).toEqual(["monthly"]);
    expect(pipPricingPlans).toHaveLength(1);
    expect(pipPaidTrustLine).toContain("money data should not be the product");
    expect(pipSubscriptionCaveat).toContain("monthly subscription");
  });
});
```

- [ ] **Step 2: Update public page tests**

In `src/app/marketing-pages.test.tsx`, update the homepage pricing assertions:

```ts
expect(html).not.toContain("$2.99/week");
expect(html).not.toContain("Weekly");
expect(html).not.toContain("Start small");
expect(html).not.toContain("Best value");
expect(html).toContain("$7.99/month");
expect(html).toContain("One monthly price");
```

Update the `/app` test so it checks for fake-ready absence instead of banning the product noun:

```ts
const page = await AppPage({
  searchParams: Promise.resolve({}),
});
const html = renderToStaticMarkup(page);

expect(html).toContain("Hi,");
expect(html).toContain("Continue with Google");
expect(html).toContain("read-only account connection");
expect(html).not.toContain("$104");
expect(html).not.toContain("I see a payment to Capital One");
```

Update the `llms.txt` assertions:

```ts
expect(llms).toContain("$7.99/month");
expect(llms).toContain("One monthly subscription");
expect(llms).not.toContain("$2.99/week");
expect(llms).not.toMatch(/\bweekly plan\b/i);
expect(llms).not.toMatch(/\bweekly pricing\b/i);
```

Inside the public marketing HTML stale-copy test, add:

```ts
expect(publicHtml).not.toMatch(/\bactually okay to use today\b/i);
expect(publicHtml).not.toMatch(/\bokay to use today\b/i);
expect(publicHtml).not.toMatch(/\bsafe to spend\b/i);
expect(publicHtml).not.toContain("Yes. You still have");
```

- [ ] **Step 3: Add monthly-only trust answer test**

Add to `src/lib/trust/pip-trust-policy.test.ts`:

```ts
it("answers public pricing questions with the single monthly price", () => {
  const answer = composeTrustPolicyAnswer("How much does Pip cost?");

  expect(answer).toMatchObject({
    category: "pricing",
    href: "/pricing",
  });
  expect(answer.message).toContain("$7.99/month");
  expect(answer.message).toContain("monthly subscription");
  expect(answer.message).not.toContain("$2.99/week");
  expect(answer.message).not.toMatch(/\bweekly\b/i);
});
```

In the Android pricing test, keep the no-price assertion monthly-only:

```ts
expect(answer.message).not.toMatch(/\$7\.99|pricing/i);
```

- [ ] **Step 4: Update content inventory test**

In `src/lib/marketing/content.test.ts`, update the draft expectation:

```ts
expect(draftSlugs).toEqual(
  expect.arrayContaining([
    "why-pip-is-paid",
    "why-your-money-app-should-not-be-free",
    "bank-balance-vs-spending-number",
  ]),
);
expect(draftSlugs).not.toContain("weekly-pricing-for-a-daily-spending-app");
```

- [ ] **Step 5: Add production-copy boundary test**

Create `src/lib/marketing/copy-boundary.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const copyTargets = [
  "content/articles",
  "public/llms.txt",
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/pricing/page.tsx",
  "src/components/auth/LoginPanel.tsx",
  "src/components/marketing/PricingCards.tsx",
  "src/components/marketing/PricingPageContent.tsx",
  "src/lib/agent/ai-agent.ts",
  "src/lib/marketing/pricing.ts",
  "src/lib/marketing/site.ts",
  "src/lib/trust/pip-trust-policy.ts",
];

const bannedPatterns = [
  /\bactually okay to use today\b/i,
  /\bokay to use today\b/i,
  /\bsafe to spend\b/i,
  /\bwhat is safe\b/i,
  /\bsafely spend\b/i,
  /\$2\.99\/week\b/i,
  /\bweekly pricing\b/i,
  /\bweekly plan\b/i,
  /\bYes\. You still have\b/i,
  /\bpipPricing\.weekly\b/,
];

describe("marketing copy boundary", () => {
  it("keeps production copy monthly-only and decision-support oriented", () => {
    const matches = copyTargets.flatMap((target) =>
      findReadableFiles(join(process.cwd(), target)).flatMap((filePath) => {
        const source = readFileSync(filePath, "utf8");

        return bannedPatterns.flatMap((pattern) => {
          const match = source.match(pattern);

          return match ? [`${filePath}: ${match[0]}`] : [];
        });
      }),
    );

    expect(matches).toEqual([]);
  });
});

function findReadableFiles(path: string): string[] {
  const stat = statSync(path);

  if (stat.isFile()) {
    return isReadableCopyFile(path) ? [path] : [];
  }

  return readdirSync(path).flatMap((entry) => findReadableFiles(join(path, entry)));
}

function isReadableCopyFile(path: string): boolean {
  return /\.(md|mdx|txt|ts|tsx)$/.test(path) && !path.endsWith(".test.ts") && !path.endsWith(".test.tsx");
}
```

Why this scanner is narrow: tests intentionally mention banned language as assertions; `sitemap.ts` can legitimately use `weekly` as a change frequency.

- [ ] **Step 6: Verify red tests**

Run:

```bash
npm run test -- src/lib/marketing/pricing.test.ts src/app/marketing-pages.test.tsx src/lib/trust/pip-trust-policy.test.ts src/lib/marketing/content.test.ts src/lib/marketing/copy-boundary.test.ts
```

Expected: FAIL because weekly pricing and old "actually okay" copy still exist. Do not commit yet.

---

### Task 2: Implement Monthly-Only Pricing End to End

**Files:**
- Modify: `src/lib/marketing/pricing.ts`
- Modify: `src/components/marketing/PricingCards.tsx`
- Modify: `src/components/marketing/PricingPageContent.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/pricing/page.tsx`
- Modify: `src/lib/marketing/site.ts`
- Modify: `src/lib/trust/pip-trust-policy.ts`
- Modify: `public/llms.txt`
- Modify: `content/articles/why-pip-is-paid.md`
- Delete: `content/articles/weekly-pricing-for-a-daily-spending-app.md`

This task updates the pricing source of truth and every direct consumer in one checkpoint so TypeScript does not break halfway through.

- [ ] **Step 1: Replace pricing constants**

Replace `src/lib/marketing/pricing.ts` with:

```ts
import { productAccess } from "@/lib/marketing/product-access";

export const pipProductAccess = productAccess;

export const pipPricing = {
  monthly: {
    id: "monthly",
    label: "Monthly",
    price: "$7.99",
    period: "month",
    displayPrice: "$7.99/month",
    tagline: "One monthly price",
    description:
      "One subscription for Spendable Cash Today, read-only account connection, and Ask Pip context.",
  },
} as const;

export const pipPricingPlans = [pipPricing.monthly] as const;

export const pipPricingIncludedFeatures = [
  "Spendable Cash Today",
  "Read-only account connection",
  "Monthly savings",
  "Ask Pip why the number changed",
  "Purchase checks",
  "Account management",
  "Financial reads",
  "Daily number updates",
] as const;

export const pipPaidTrustLine =
  "Pip is paid because your money data should not be the product.";

export const pipSubscriptionCaveat =
  "One monthly subscription. Cancel where you subscribed.";
```

- [ ] **Step 2: Render one pricing card**

In `src/components/marketing/PricingCards.tsx`:

- Remove the `CheckCircle2` import only if `showIncluded` is also removed. If `showIncluded` stays, keep it.
- Remove `plan.recommended`, `plan.annualizedLabel`, and "Best value" rendering.
- Change the cards grid from `md:grid-cols-2` to one column.

The card loop should read:

```tsx
<div className="grid gap-4">
  {pipPricingPlans.map((plan) => (
    <article
      className="pricing-plan-card relative flex min-h-[17rem] max-w-xl flex-col p-6 text-ink"
      key={plan.id}
    >
      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-moss">{plan.label}</p>
      <div aria-label={plan.displayPrice} className="mt-5 flex items-end gap-2">
        <p className="swiss-price text-ink">{plan.price}</p>
        <p className="pb-1 text-base font-bold text-ink/58">/{plan.period}</p>
      </div>
      <h3 className="mt-5 text-xl font-bold text-ink">{plan.tagline}</h3>
      <p className="mt-2 text-sm leading-6 text-ink/66">{plan.description}</p>
      <MarketingCtaLink
        className="focus-ring mt-auto inline-flex min-h-11 w-fit items-center justify-center bg-ink px-5 text-sm font-bold text-porcelain transition hover:bg-moss"
        eventLabel={`${eventSource}_${plan.id}`}
        eventProperties={{
          intent: "get_pip",
          selected_plan: plan.id,
          price: plan.price,
          period: plan.period,
        }}
        href={ctaHref}
      >
        {productAccess.shortLabel}
      </MarketingCtaLink>
    </article>
  ))}
</div>
```

Update the trust panel:

```tsx
<p className="text-sm font-semibold leading-6 text-ink/62">
  {pipPaidTrustLine} One monthly price. No ads. No selling your financial data.
  Read-only account connection.
</p>
<p className="mt-2 text-xs font-semibold leading-5 text-ink/50">{pipSubscriptionCaveat}</p>
```

- [ ] **Step 3: Simplify pricing page**

In `src/components/marketing/PricingPageContent.tsx`, replace `pricingFaq`:

```ts
const pricingFaq = [
  {
    title: "What does Pip cost?",
    copy: `${pipPricing.monthly.displayPrice}. One monthly subscription for the daily number, read-only account connection, and Ask Pip context.`,
  },
  {
    title: "Why is Pip paid?",
    copy: "Pip uses sensitive money context. The paid model keeps incentives direct: no ads and no selling your financial data.",
  },
  {
    title: "What is included?",
    copy: "Every subscription includes Spendable Cash Today, read-only account connection, monthly savings, purchase checks, and Ask Pip explanations.",
  },
  {
    title: "How are subscriptions managed?",
    copy: pipSubscriptionCaveat,
  },
  {
    title: "Is there a trial or refund policy?",
    copy: "Trials, refunds, grace periods, and billing recovery depend on the platform and offer shown when you start the subscription.",
  },
];
```

Update hero body:

```tsx
<SwissText className="mt-6 text-lg leading-8">
  Pip helps you stop guessing from your bank balance before the next purchase.
  One monthly subscription is {pipPricing.monthly.displayPrice}.
</SwissText>
```

Update "Why paid" body:

```tsx
<SwissText className="mt-5">
  A money app should not need your attention for ads, offers, or data resale.
  Pip has one monthly price so the core job can stay simple: one number before you spend.
</SwissText>
```

- [ ] **Step 4: Update homepage and pricing metadata**

In `src/app/page.tsx`, update metadata description:

```ts
description:
  "Pip is a paid daily money companion that shows Spendable Cash Today: one calm number before you spend. One monthly subscription is $7.99/month.",
```

Update final CTA price copy:

```tsx
<p className="pip-home-lede">
  Pip gives you one calm number before the next purchase. One monthly subscription is{" "}
  {pipPricing.monthly.displayPrice}.
</p>
```

```tsx
<p className="pip-final-proof">One monthly subscription: {pipPricing.monthly.displayPrice}.</p>
```

In `src/app/pricing/page.tsx`, update description:

```ts
description:
  "Pip is $7.99/month for one daily spending number, read-only account connection, and Ask Pip context.",
```

- [ ] **Step 5: Update marketing site metadata**

In `src/lib/marketing/site.ts`:

```ts
defaultDescription:
  "Pip is a paid daily money companion that shows Spendable Cash Today, one calm number before you spend. One monthly subscription is $7.99/month.",
```

```ts
{
  path: "/pricing",
  label: "Pricing",
  description: "See Pip monthly pricing.",
},
```

- [ ] **Step 6: Update trust policy**

In `src/lib/trust/pip-trust-policy.ts`, replace the pricing object:

```ts
pricing: {
  monthly: pipPricing.monthly.displayPrice,
  annualized: "$95.88/year",
},
```

Keep the pricing regex recognizing old user terms:

```ts
if (/\b(price|pricing|cost|subscription|weekly|monthly|refund|trial|cancel)\b/.test(normalized)) {
```

Replace the public pricing answer:

```ts
return {
  category: "pricing",
  message:
    `Pip is ${pipTrustPolicy.pricing.monthly}. One monthly subscription. Subscriptions are managed where they start or install.`,
  linkLabel: "Pricing details",
  href: pipTrustPolicy.publicLinks.pricing,
};
```

- [ ] **Step 7: Update `llms.txt`**

Replace the pricing section in `public/llms.txt`:

```txt
Pricing:
- One monthly subscription: $7.99/month.
- Pip is paid because money data should not be the product.
- Pip does not position itself as a permanent free product.
```

- [ ] **Step 8: Update paid-pricing draft and remove obsolete weekly draft**

In `content/articles/why-pip-is-paid.md`, update SEO description:

```md
description: "Why Pip uses one monthly subscription instead of an ad-supported or data-selling model."
```

Update the quick answer:

```md
Pip is paid because money data should not be the product. The pricing model keeps the relationship direct: users pay one monthly subscription for one daily spending number, read-only account connection, and Ask Pip context.
```

Update outline:

```md
- Explain the incentive problem in free money apps.
- State the monthly price clearly.
- Connect paid pricing to no ads and no selling financial data.
- Link to security, privacy, and pricing.
```

Delete `content/articles/weekly-pricing-for-a-daily-spending-app.md` with `apply_patch` delete or `git rm`:

```bash
git rm content/articles/weekly-pricing-for-a-daily-spending-app.md
```

- [ ] **Step 9: Run focused monthly-only tests**

Run:

```bash
npm run test -- src/lib/marketing/pricing.test.ts src/app/marketing-pages.test.tsx src/lib/trust/pip-trust-policy.test.ts src/lib/marketing/content.test.ts
```

Expected: PASS, except copy-boundary may still fail until Task 3 if old "actually okay" language remains.

- [ ] **Step 10: Commit monthly-only pricing checkpoint**

Only commit if the focused tests from Step 9 pass or fail solely on Task 3 copy-boundary work:

```bash
git add src/lib/marketing/pricing.ts src/components/marketing/PricingCards.tsx src/components/marketing/PricingPageContent.tsx src/app/page.tsx src/app/pricing/page.tsx src/lib/marketing/site.ts src/lib/trust/pip-trust-policy.ts public/llms.txt content/articles/why-pip-is-paid.md content/articles/weekly-pricing-for-a-daily-spending-app.md src/lib/marketing/pricing.test.ts src/app/marketing-pages.test.tsx src/lib/trust/pip-trust-policy.test.ts src/lib/marketing/content.test.ts
git commit -m "feat: make pip pricing monthly only"
```

Rollback trigger: if TypeScript errors mention `pipPricing.weekly`, search and fix those references before committing:

```bash
rg -n "pipPricing\.weekly|weeklyAnnualized|weekly:" src content public/llms.txt
```

---

### Task 3: Tighten Decision-Support Language

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/components/auth/LoginPanel.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/agent/ai-agent.ts`
- Modify: `content/articles/what-is-spendable-cash-today.md`
- Modify: `content/articles/meet-pip-cute-money-companion.md`
- Modify: `src/lib/marketing/copy-boundary.test.ts`

- [ ] **Step 1: Update global metadata**

In `src/app/layout.tsx`, replace both description values with:

```ts
"Pip is a cute daily money companion that shows today's spending room before you spend."
```

- [ ] **Step 2: Update login/onboarding headline**

In `src/components/auth/LoginPanel.tsx`, update the `PipIntroScene` title:

```tsx
title="Hi, I'm Pip. I'll help you find today's spending room before you spend."
```

Update the first paragraph:

```tsx
<p>
  Connect checking and cards through a read-only account connection so I can show Spendable Cash
  Today without making balances the default number.
</p>
```

- [ ] **Step 3: Rewrite homepage Ask Pip example**

In `src/app/page.tsx`, replace:

```ts
body: "Yes. You still have $84 for today.",
```

with:

```ts
body: "A $50 purchase would leave about $84 in today's number.",
```

- [ ] **Step 4: Update agent policy wording**

In `src/lib/agent/ai-agent.ts`, replace the old "okay to use" policy sentence with:

```ts
"Spendable Cash Today is the spending-room estimate I calculate from your normal money pattern, recurring obligations, monthly savings, recent spending pace, and available cash.",
```

- [ ] **Step 5: Update Spendable Cash Today article**

In `content/articles/what-is-spendable-cash-today.md`, replace frontmatter description:

```md
description: "Spendable Cash Today is Pip's daily spending-room number before the next purchase."
```

Replace the first quick-answer paragraph:

```md
Spendable Cash Today is Pip's daily spending-room number after bills, Monthly Savings, Savings Goals, and recent spending pressure are considered. It is decision support, not a guarantee, not a full budget, and not the same as your bank balance.
```

Replace:

```md
"What can I use today without ignoring what this money still needs to do?"
```

with:

```md
"How much spending room do I have today, based on what Pip can see?"
```

- [ ] **Step 6: Update Meet Pip article FAQ**

In `content/articles/meet-pip-cute-money-companion.md`, replace the `What is Pip?` FAQ answer:

```md
answer: "Pip is a cute daily money companion that shows Spendable Cash Today, one decision-support number for today's spending room."
```

- [ ] **Step 7: Run copy-boundary tests**

Run:

```bash
npm run test -- src/lib/marketing/copy-boundary.test.ts src/app/pip-language-boundary.test.ts
```

Expected: PASS.

If it fails on a test file path, narrow `copyTargets`; do not weaken the banned patterns.

- [ ] **Step 8: Commit copy-boundary checkpoint**

```bash
git add src/app/layout.tsx src/components/auth/LoginPanel.tsx src/app/page.tsx src/lib/agent/ai-agent.ts content/articles/what-is-spendable-cash-today.md content/articles/meet-pip-cute-money-companion.md src/lib/marketing/copy-boundary.test.ts
git commit -m "copy: tighten pip decision support language"
```

---

### Task 4: Fix `Get Pip` Handoff and Header Navigation

**Files:**
- Modify: `src/app/app/page.tsx`
- Modify: `src/components/marketing/MarketingLayout.tsx`
- Modify: `src/app/marketing-pages.test.tsx`

- [ ] **Step 1: Render guest setup for unconfigured `/app`**

In `src/app/app/page.tsx`, change:

```tsx
if (!isSupabaseConfigured()) {
  return <PipHome />;
}
```

to:

```tsx
if (!isSupabaseConfigured()) {
  return <PipHome authState={{ status: "guest" }} authNotice={authNotice} />;
}
```

- [ ] **Step 2: Rename the mechanics nav label**

In `src/components/marketing/MarketingLayout.tsx`, change:

```ts
{ href: "/how-the-number-works", label: "Number" },
```

to:

```ts
{ href: "/how-the-number-works", label: "How the number works" },
```

- [ ] **Step 3: Add route/nav assertions**

In `src/app/marketing-pages.test.tsx`, add to the homepage test:

```ts
expect(html).toContain("How the number works");
expect(html).not.toContain(">Number<");
```

Keep the `/app` assertions from Task 1:

```ts
expect(html).toContain("Continue with Google");
expect(html).not.toContain("$104");
expect(html).not.toContain("I see a payment to Capital One");
```

- [ ] **Step 4: Run route tests**

Run:

```bash
npm run test -- src/app/marketing-pages.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit handoff/nav checkpoint**

```bash
git add src/app/app/page.tsx src/components/marketing/MarketingLayout.tsx src/app/marketing-pages.test.tsx
git commit -m "fix: make get pip handoff explicit"
```

---

### Task 5: Tighten Supporting Pages and Homepage Rhythm

**Files:**
- Modify: `src/app/how-it-works/page.tsx`
- Modify: `src/app/how-the-number-works/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/marketing-pages.test.tsx`

- [ ] **Step 1: Make How It Works more concrete**

In `src/app/how-it-works/page.tsx`, replace the H1:

```tsx
Pip turns your bank balance into today's spending room.
```

Update first `SwissText`:

```tsx
Your bank balance shows the pile. Pip holds back the money already spoken for and gives you Spendable Cash Today before the next purchase.
```

- [ ] **Step 2: Make How The Number Works receipt language clearer**

In `src/app/how-the-number-works/page.tsx`, replace the receipt note:

```tsx
The receipt should make three things obvious: when the data refreshed, which accounts counted, and what limits could make the number incomplete.
```

Update the final H2:

```tsx
Use the number with its receipt.
```

- [ ] **Step 3: Compress homepage section spacing**

In `src/app/globals.css`, change:

```css
.pip-home-section {
  padding: 7.5rem 0;
}
```

to:

```css
.pip-home-section {
  padding: 5.75rem 0;
}
```

Change hero bottom padding:

```css
.pip-hero-section {
  position: relative;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(252, 249, 248, 0.98), rgba(246, 243, 242, 0.82));
  padding-top: 4.5rem;
  padding-bottom: 5.5rem;
}
```

Change mobile section padding:

```css
.pip-home-section {
  padding: 3.25rem 0;
}
```

- [ ] **Step 4: Shorten poster sections without cropping key subjects**

Change:

```css
.pip-story-poster-anti,
.pip-story-poster-final {
  aspect-ratio: 1672 / 941;
}
```

to:

```css
.pip-story-poster-anti,
.pip-story-poster-final {
  aspect-ratio: 16 / 8.5;
}
```

Use `16 / 8.5` rather than `16 / 8` as the first implementation because it is still shorter than the current poster while reducing crop risk for the phone and Pip character.

- [ ] **Step 5: Update marketing-page tests**

In `src/app/marketing-pages.test.tsx`, update the support pages test:

```ts
expect(renderToStaticMarkup(<HowItWorksPage />)).toContain("today's spending room");
expect(renderToStaticMarkup(<HowTheNumberWorksPage />)).toContain("when the data refreshed");
```

Inside `keeps redesigned homepage sections scoped and responsive`, add:

```ts
expect(css).toContain(".pip-home-section {\n  padding: 5.75rem 0;");
expect(css).toContain("padding-bottom: 5.5rem;");
expect(css).toContain("aspect-ratio: 16 / 8.5;");
expect(mobileCss).toContain(".pip-home-section {\n    padding: 3.25rem 0;");
```

- [ ] **Step 6: Run page/CSS tests**

Run:

```bash
npm run test -- src/app/marketing-pages.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit page rhythm checkpoint**

```bash
git add src/app/how-it-works/page.tsx src/app/how-the-number-works/page.tsx src/app/globals.css src/app/marketing-pages.test.tsx
git commit -m "copy: sharpen pip marketing proof pages"
```

---

### Task 6: Final Verification and Browser QA

**Files:**
- No planned source edits.

- [ ] **Step 1: Search for forbidden leftovers**

Run:

```bash
rg -n "\$2\.99|weekly pricing|weekly plan|pipPricing\.weekly|actually okay|okay to use today|Yes\. You still|safe to spend" src content public/llms.txt
```

Expected: no matches except intentional banned-language tests outside the scanned production surfaces. If matches appear in production copy, fix them before proceeding.

- [ ] **Step 2: Run focused tests**

Run:

```bash
npm run test -- src/lib/marketing/pricing.test.ts src/lib/marketing/copy-boundary.test.ts src/lib/trust/pip-trust-policy.test.ts src/lib/marketing/content.test.ts src/app/marketing-pages.test.tsx src/app/pip-language-boundary.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full unit suite**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 4: Build production site**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Start production server**

Run:

```bash
npm run start -- -p 3002
```

Expected: server listens at `http://localhost:3002`. If sandbox blocks binding, rerun with approved escalation.

- [ ] **Step 6: In-app Browser QA**

Use the Codex in-app Browser plugin with the `iab` backend. Do not use standalone Playwright, shell-launched browsers, external browser-control servers, or Computer Use unless Tyler explicitly approves.

Check:
- `http://localhost:3002/` at desktop default viewport.
- `http://localhost:3002/` at `390x844`.
- `http://localhost:3002/pricing` at desktop default viewport.
- `http://localhost:3002/app` at desktop default viewport.
- `http://localhost:3002/blog` at desktop default viewport.

Acceptance:
- Homepage first viewport still communicates "Before you spend, check Pip."
- Pricing shows exactly one public price: `$7.99/month`.
- No weekly card, weekly annualized comparison, or "Best value" badge remains.
- Ask Pip example describes purchase impact, not approval.
- `/app` opens with sign-in/setup copy when unauthenticated or unconfigured.
- Mobile header has `Get Pip` and menu without overlap.
- Hero-to-balance transition no longer has an obvious blank dead zone.
- No text overlap or clipped primary subject in desktop or mobile screenshots.

- [ ] **Step 7: Stop local server**

Stop the `next start -p 3002` process before finishing.

- [ ] **Step 8: Check git status**

Run:

```bash
git status --short
```

Expected: only intended files changed, or clean if committed task-by-task.

- [ ] **Step 9: Final commit if task commits were skipped**

If earlier task commits were skipped, commit the verified change now:

```bash
git add src content public docs
git commit -m "feat: simplify pip pricing and marketing copy"
```

---

## Rollback and Risk Notes

- If a focused test fails because the boundary scanner catches test assertions, narrow `copyTargets`; do not weaken the production banned patterns.
- If Android pricing tests fail, preserve the Android behavior: no prices and no `/pricing` link inside Android WebView.
- If `/app` no-Supabase fallback reveals authenticated-product assumptions, gate only the unconfigured unauthenticated path; do not change ready-state behavior for real users.
- If homepage poster compression crops the phone or Pip character, use `aspect-ratio: 16 / 8.5` or revert that specific ratio while keeping reduced section padding.
- If `npm run dev` hits watcher `ENOSPC`, use `npm run build` plus `npm run start -- -p 3002` for browser QA.

## Self-Review

- Spec coverage: monthly-only pricing, no weekly public copy, safer decision-support language, Ask Pip purchase example, `Get Pip` app handoff, nav clarity, supporting page concreteness, homepage rhythm, tests, build, and browser QA are covered.
- Sequencing: monthly pricing constants and all direct consumers are updated in the same implementation task, avoiding a broken intermediate TypeScript state.
- Risk controls: scanner false positives, Android restrictions, app-handoff behavior, browser QA, and visual crop fallbacks are explicit.
- Type consistency: `pipPricing.monthly` remains the single plan source; `pipPricingPlans` remains an array for component compatibility; trust policy reads `pricing.monthly`; tests assert no `weekly` key.

