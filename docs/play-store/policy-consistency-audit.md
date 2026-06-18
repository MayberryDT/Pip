# Play Store Policy Consistency Audit

Status: final pre-submission audit checklist. This should be the last documentation pass before each Play upload or production-access application.

## Audit Rule

Every claim must match across:

- Android app behavior.
- Public privacy policy.
- Public terms.
- Public support page.
- Public delete-account page.
- In-app settings/account controls.
- Data Safety worksheet.
- Financial features declaration.
- App Access instructions.
- Store listing.
- Screenshots.
- Production-access notes.

If one surface cannot be made true before submission, revise every other surface to match the real behavior.

## Blocking Consistency Checks

| Area | Required truth | Surfaces to verify | Status |
| --- | --- | --- | --- |
| Android payments | Android build has no pricing, checkout, upgrade, trial, subscription, Stripe, external payment, or "go to website to pay" path. | Android app, `/pricing`, support, terms, privacy, store listing, screenshots | [ ] |
| Reviewer access | `play-review@animasai.co` can review without payment, Plaid, OTP, magic links, or Tyler intervention. | App Access, Android app, reviewer seed/reset scripts | [ ] |
| Deletion-test account | `play-delete-test@animasai.co` can be deleted without breaking primary reviewer access. | App Access, deletion UI, audit scripts | [ ] |
| Account deletion | In-app deletion and public deletion page describe the same scope, timing, retained records, and contact path. | App, `/delete-account`, privacy, Data Safety, Play data deletion URL | [ ] |
| Privacy scope | Privacy policy covers auth data, connected account data, derived financial data, chat, AI reports, feedback, app events, diagnostics, processors, retention, and deletion. | Privacy, Data Safety, terms, app behavior | [ ] |
| Data Safety | Play answers include controlled WebView data and all stored app data. | Data Safety, privacy, database/logging reality | [ ] |
| Financial features | App is described as read-only support/insight, not banking, lending, money movement, credit, insurance, crypto, or advice. | Financial declaration, listing, terms, screenshots, UI copy | [ ] |
| AI-generated content | Assistant responses can be reported in app, and report data handling is disclosed. | App UI, privacy, Data Safety, support, production notes | [ ] |
| Support | Support path uses `tyler@animasai.co` and warns users not to email credentials or sensitive financial screenshots. | Support, privacy, Play contact info | [ ] |
| Screenshots | Screenshots use demo data and show no payment CTA or real financial data. | Store listing, screenshots, reviewer data | [ ] |
| Closed testing | Production-access answers are backed by tester evidence, bugs, fixes, and dates. | Tester checklist, production notes, Play Console | [ ] |

## Text Guardrails

Search Android-visible surfaces for payment language:

```bash
rg -n "Subscribe|Upgrade|Start trial|Premium|Stripe|checkout|\\$2\\.99|\\$7\\.99" src
```

Expected result:

- Remaining hits are web-only and guarded from Android, or
- Remaining hits are neutral policy/legal explanations that do not create a purchase path.

Search listing, legal, and support copy for regulated-finance language:

```bash
rg -n "loan|advance|borrow|credit decision|investment advice|transfer money|move money|guarantee|bank replacement" src docs planning-docs
```

Expected result:

- Any hit is either absent from Play-facing copy or surrounded by explicit "does not" language.

Use the Codex in-app Browser plugin with the `iab` backend for browser automation when browser automation is needed.

## Manual Verification Checklist

- [ ] Fresh Android install loads `/app`.
- [ ] WebView is not blank.
- [ ] Android user agent includes `PipAndroid/1`.
- [ ] Back button behavior is predictable.
- [ ] External links open outside Pip only when intended.
- [ ] Main app stays inside `spendwithpip.com`.
- [ ] SSL errors fail closed.
- [ ] No broad Android permissions are added beyond the intended shell permissions.
- [ ] No Android-visible payment path exists.
- [ ] Reviewer login works.
- [ ] Demo data appears.
- [ ] Ask Pip works.
- [ ] AI report works.
- [ ] Feedback works.
- [ ] Privacy, terms, support, and delete-account pages work.
- [ ] Full account deletion works on `play-delete-test@animasai.co`.
- [ ] `play-review@animasai.co` still works after deletion-test cleanup.

## Play Console Final Review

- [ ] App Access instructions match the build.
- [ ] Privacy Policy URL is public.
- [ ] Data deletion URL is public and non-PDF.
- [ ] Data Safety answers match this worksheet and shipped behavior.
- [ ] Financial features declaration matches listing and terms.
- [ ] Content rating has no hidden contradiction with app behavior.
- [ ] Target audience answer is consistent with privacy/terms.
- [ ] Ads declaration is accurate.
- [ ] Store listing copy uses conservative read-only positioning.
- [ ] Screenshots show demo data only.
- [ ] Production-access answers cite actual closed-test evidence.
- [ ] Pre-launch report blockers are fixed or explained.

## Signoff Record

| Date | Build/versionCode | Auditor | Result | Notes |
| --- | --- | --- | --- | --- |
| YYYY-MM-DD | 0 | Tyler/Codex | Pending | Fill after verification. |
