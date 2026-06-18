# Play Store Production Access Notes

Status: production-access worksheet. Keep this updated during internal and closed testing so the final Play Console answers use evidence instead of guesses.

## Current Submission Stance

Pip should not apply for production access until:

- Internal testing upload succeeds.
- Closed testing requirements are met, if applicable.
- Reviewer access works without Tyler intervention.
- Data Safety, privacy, deletion, and financial declaration answers are consistent.
- Pre-launch report blockers are fixed or explicitly documented.
- Tester feedback and bug fixes are summarized with dates and versions.

## Production Access Draft Answers

Use these as conservative starting points. Replace bracketed evidence before submission.

### How did you recruit testers?

```txt
We recruited a small group of testers from people familiar with budgeting, personal finance tracking, and early consumer app testing. Testers were invited to the Google Play closed testing track and asked to use the Android build on their own devices for the full closed-test period.
```

Add evidence:

- Tester count:
- Opt-in start date:
- Opt-in end date:
- Tester source:
- Devices covered:

### How did testers use the app?

```txt
Testers were asked to complete a structured checklist covering first launch, sign-in, Spendable Cash Today, Ask Pip questions, account controls, privacy/terms/support pages, AI response reporting, feedback, logout, reopen, offline behavior, and Android back-button behavior.
```

Add evidence:

- Checklist completion count:
- Most-tested features:
- Least-tested features:
- Screenshots or issue links:

### What feedback did testers provide?

```txt
Tester feedback focused on clarity of the Spendable Cash Today number, usefulness of Ask Pip explanations, confidence in read-only connected account data, account/settings discoverability, and any confusion around financial disclaimers or deletion.
```

Replace with actual themes:

- Theme 1:
- Theme 2:
- Theme 3:
- Representative non-sensitive quote:

### What bugs did you find and fix?

```txt
During closed testing we tracked tester-reported bugs, pre-launch report findings, and policy-readiness issues. Fixes were verified in later version codes before production access.
```

Replace with actual fixes:

| Issue | Source | Fixed in versionCode | Verification |
| --- | --- | ---: | --- |
| [example] | Tester/pre-launch/manual QA | 0 | [check] |

### What is the app value and intended audience?

```txt
Pip is for people who want a calm, simple daily spending signal instead of another financial dashboard. It uses read-only connected account activity, upcoming bills, and a user-controlled cushion to show Spendable Cash Today and answer plain-language questions about day-to-day spending context.

Pip does not move money, hold funds, issue loans, make credit decisions, or provide investment, tax, legal, or formal financial advice.
```

### Expected first-year installs

Recommended conservative answer unless actual distribution plans differ:

```txt
We expect a limited early production rollout, approximately 100 to 500 installs in the first year, while we validate reliability, connected-data behavior, and user trust.
```

Update this if marketing or launch plans change.

### Why is the app ready for production?

```txt
The Android build has completed internal and closed testing with reusable reviewer access, demo data for review, no Android payment path, public privacy/terms/support/deletion pages, in-app account deletion, AI response reporting, tester feedback, and resolved pre-launch report blockers. The app is read-only and uses connected account data only to provide spending clarity and plain-language explanations.
```

Only use this answer after every claim is verified.

## Release Evidence Checklist

- [ ] Internal test AAB uploaded.
- [ ] Package identity confirmed: `com.spendwithpip.app`.
- [ ] Version code incremented for each upload.
- [ ] Reviewer account verified: `play-review@animasai.co`.
- [ ] Deletion-test account verified: `play-delete-test@animasai.co`.
- [ ] Data deletion URL live: `https://spendwithpip.com/delete-account`.
- [ ] Privacy URL live.
- [ ] Terms URL live.
- [ ] Support URL live and includes `tyler@animasai.co`.
- [ ] Financial features declaration completed.
- [ ] Data Safety completed.
- [ ] Content rating completed.
- [ ] Target audience completed.
- [ ] Ads declaration completed.
- [ ] App access instructions completed.
- [ ] Pre-launch report reviewed.
- [ ] Crashes fixed or explained.
- [ ] ANRs fixed or explained.
- [ ] Login failures fixed.
- [ ] Blocked screens fixed.
- [ ] Policy warnings fixed or explained.
- [ ] Store listing has no regulated-finance promises.
- [ ] Screenshots use demo data only.
- [ ] Screenshots show no payment CTA.
- [ ] Closed testing evidence log completed.

## Store Listing Notes

Short description:

```txt
A calm daily spending signal from your connected account activity.
```

Long-description anchor:

```txt
Pip shows Spendable Cash Today: one simple number that helps you understand today's spending room based on connected account activity, upcoming bills, and your savings cushion.
```

Required listing claims:

- Read-only connected account data.
- No money movement.
- Not a bank.
- No loans or credit decisions.
- No investment, tax, legal, or formal financial advice.
- No real financial data in screenshots.
- No Android payment CTA in screenshots.

## Screenshot Checklist

Required screenshots should show demo data only:

- [ ] Onboarding or reviewer-ready state.
- [ ] Spendable Cash Today.
- [ ] Ask Pip question.
- [ ] Explanation card.
- [ ] Account controls.
- [ ] Settings/legal/support.
- [ ] Pip character or emotion state, if it helps explain product value.

Do not show:

- Real balances or transactions.
- Real institution/customer names.
- Pricing.
- Checkout.
- Subscribe, upgrade, trial, premium, or Stripe language.
- Any external payment instruction.
