# Closed Tester Checklist

Status: checklist for internal and closed testing. Use this to collect evidence for production access and to keep testers focused on real app behavior instead of only opening the app once.

Support contact for testers: `tyler@animasai.co`

## Tester Setup

Before sending the build:

- [ ] Tester is opted in to the correct Play testing track.
- [ ] Tester has the current Android build installed.
- [ ] Tester has a test account or approved reviewer/demo account path.
- [ ] Tester understands not to enter real bank credentials unless Tyler explicitly authorizes that test.
- [ ] Tester understands the Android test build has no payment, subscription, checkout, upgrade, or trial path.
- [ ] Tester knows to report issues through the in-app feedback path or `tyler@animasai.co`.

If the developer account is subject to the personal-account production-access requirement, keep at least 12 testers opted in continuously for at least 14 days before applying for production access.

## Core Test Script

Ask each tester to complete as much of this script as possible:

- [ ] Install the app from Play testing.
- [ ] Open the app from a cold start.
- [ ] Sign in successfully.
- [ ] Confirm the app shows a ready state with demo or connected account data.
- [ ] View Spendable Cash Today.
- [ ] Open the explanation for why the number changed.
- [ ] Ask Pip: "What changed since yesterday?"
- [ ] Ask Pip: "Can I afford a 40 dollar purchase today?"
- [ ] Ask Pip: "What bills should I watch before payday?"
- [ ] Confirm answers are understandable and do not claim to move money or give formal advice.
- [ ] Report one assistant answer using the AI report action.
- [ ] Send one feedback item.
- [ ] Open account controls or settings.
- [ ] Open Privacy Policy.
- [ ] Open Terms.
- [ ] Open Support.
- [ ] Open Delete Account information.
- [ ] Log out.
- [ ] Close and reopen the app.
- [ ] Confirm the Android back button behaves predictably.
- [ ] Try the app with poor or no network and record the result.

Do not ask normal testers to delete their accounts unless the test plan explicitly assigns them to deletion testing.

## Deletion-Test Script

Use only `play-delete-test@animasai.co` or another disposable test account:

- [ ] Sign in to the deletion-test account.
- [ ] Confirm the account has demo/test data.
- [ ] Open settings or account controls.
- [ ] Start account deletion.
- [ ] Read the deletion warning.
- [ ] Enter the required confirmation phrase, expected: `DELETE`.
- [ ] Confirm deletion.
- [ ] Confirm the app signs out or shows a final deletion confirmation.
- [ ] Confirm the deleted account cannot access the previous data.
- [ ] Run the data audit script or equivalent manual audit.
- [ ] Confirm `play-review@animasai.co` still works after deletion-test cleanup.

## Android Policy Checks

Record the result for each build:

- [ ] No pricing page is visible inside Android.
- [ ] No `$2.99` or `$7.99` copy is visible inside Android.
- [ ] No Subscribe, Upgrade, Start trial, Premium, checkout, Stripe, or external payment link is visible inside Android.
- [ ] Direct navigation to `/pricing` under the Android user agent is blocked or replaced by an Android-safe access message.
- [ ] Privacy, terms, support, and delete-account pages are reachable.
- [ ] Support page does not ask users to email bank credentials, full account numbers, or sensitive screenshots.
- [ ] AI response reporting is available.
- [ ] Feedback is available.

## Tester Evidence Log

Create one row per tester or test session:

| Date | Tester | Device/OS | App version | Features tested | Feedback | Bugs found | Fixed in version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD | Tester initials or email | Device and Android version | versionCode/versionName | Spendable Cash, Ask Pip, settings, deletion, feedback | Summary | Issue links | Version |

Use specific feature names. Play production access answers should be based on this log, not memory.

## Bug Report Template

```txt
Tester:
Device:
Android version:
App version/versionCode:
Network state:
Account used:
Screen or URL:
Steps to reproduce:
Expected:
Actual:
Screenshot or screen recording:
Can reproduce again: yes/no
Severity: blocker/high/medium/low
```

## Feedback Prompts For Testers

Ask testers:

- What did Spendable Cash Today make clearer?
- Which answer from Ask Pip was useful?
- Which answer was confusing or risky?
- Did any screen look like it was asking for payment?
- Could you find privacy, terms, support, and account deletion?
- Did the app explain that it is read-only and does not move money?
- What would stop you from trusting the number?
- What should be fixed before production?
