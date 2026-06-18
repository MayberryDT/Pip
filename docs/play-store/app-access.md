# Play Store App Access Notes

Status: implementation-ready Play Console draft. Do not submit until the reviewer login path, seeded data, and reset flow have been verified on the Android build being uploaded.

## Contacts And Accounts

- Developer/support contact: `tyler@animasai.co`
- Primary reviewer account: `play-review@animasai.co`
- Deletion-test account: `play-delete-test@animasai.co`
- Reviewer password: store only in Play Console. Do not commit it to this repo.

Use the primary reviewer account for normal Play review. Use the deletion-test account only when Google needs to verify full account deletion.

## Play Console App Access Answer

Use this answer in Play Console after replacing the password placeholder:

```txt
Pip requires sign-in to review the main app experience. Use the reusable reviewer account below.

Reviewer sign-in path:
1. Open the Android app.
2. Go to the reviewer sign-in path: https://spendwithpip.com/reviewer-login
3. Sign in with:
   Email: play-review@animasai.co
   Password: [enter only in Play Console]

The reviewer account has preloaded demo financial data. No real bank connection, Plaid login, payment, subscription, one-time password, magic-link inbox access, or location-specific credential is required.

Please test Spendable Cash Today, Ask Pip, account controls, settings, privacy policy, terms, support, AI response reporting, feedback, and account deletion. Use play-delete-test@animasai.co only for account deletion testing so the primary reviewer account remains available.

If access fails, contact tyler@animasai.co.
```

If the final implementation uses a different durable reviewer path, update the path above before submission. Do not use a public query parameter to enable reviewer mode.

## Reviewer Account Requirements

The primary reviewer account must:

- Be reusable for the entire review window.
- Avoid OTP, magic-link, personal inbox, phone verification, or Tyler intervention.
- Be allowlisted server-side by normalized email or auth user ID.
- Land in a ready app state after login.
- Include seeded demo data using mock/provider-safe records, not real financial data.
- Never require a purchase or subscription in the Android build.
- Remain separate from the deletion-test account.

The seeded state should include:

- Checking account.
- Savings or protected cushion.
- Credit card account if supported.
- Recent income.
- Upcoming recurring bills.
- Everyday transactions.
- At least one explanation for a Spendable Cash Today change.
- Enough history for at least three useful Ask Pip questions.
- A connected-data status that is clearly demo or mock data.

## Reviewer Dry Run Checklist

Complete this checklist on the exact Android build before submitting App Access:

- [ ] Fresh install opens `https://spendwithpip.com/app`.
- [ ] Android WebView user agent includes `PipAndroid/1`.
- [ ] Reviewer can reach `/reviewer-login` from the documented instructions.
- [ ] `play-review@animasai.co` can sign in without OTP or inbox access.
- [ ] Reviewer lands in the main app with demo data visible.
- [ ] Spendable Cash Today renders.
- [ ] Ask Pip answers at least three demo-data questions.
- [ ] Settings or account controls are visible within two taps.
- [ ] Privacy, terms, support, and delete-account surfaces are reachable.
- [ ] AI response reporting is available from an assistant response.
- [ ] Feedback path is available.
- [ ] No pricing, checkout, upgrade, trial, subscription, Stripe, or external payment path is visible in Android.
- [ ] Direct navigation to `/pricing` in Android shows an Android-safe access message, not prices.
- [ ] `play-delete-test@animasai.co` can complete deletion without affecting `play-review@animasai.co`.

## Reset And Verification Runbook

Before each Play submission or resubmission:

```txt
PIP_PLAY_REVIEWER_PASSWORD=[store outside repo] npm run play:reviewer:reset
npm run play:reviewer:verify

PIP_PLAY_REVIEWER_PASSWORD=[store outside repo] npm run play:reviewer:reset -- --email=play-delete-test@animasai.co
npm run play:reviewer:verify -- --email=play-delete-test@animasai.co
```

Expected verification result:

- `play-review@animasai.co` exists.
- Demo data exists and is internally consistent.
- Account is not marked deleted or disabled.
- No live Plaid/Teller credential is required.
- No payment entitlement is required.
- `play-delete-test@animasai.co` exists or can be recreated for deletion testing.

For account-deletion proof, use the disposable account and then run:

```txt
npm run privacy:audit-user -- --email=play-delete-test@animasai.co
```

## Reviewer Notes To Keep Out Of Play Console

Do not put these in Play Console:

- Service-role keys.
- Supabase dashboard links.
- Seed script internals.
- Passwords in repo files.
- Private provider credentials.
- Real customer data.

Play Console should contain only the reusable reviewer credentials, durable steps, and support contact.
