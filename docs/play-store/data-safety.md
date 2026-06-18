# Play Store Data Safety Worksheet

Status: implementation-ready worksheet. Final Play Console answers must match the shipped Android build, privacy policy, terms, deletion behavior, and any enabled logging or analytics provider.

## Submission Principles

- Treat the controlled WebView experience as Android app data collection.
- Do not answer "No data collected."
- Do not omit connected financial data.
- Do not mark data as ephemeral unless it is never stored server-side.
- If a provider does not clearly qualify as a service provider under Google Play's Data Safety rules, mark the relevant transfer as sharing.
- If implementation changes before submission, update this worksheet before Play Console submission.

## Data Safety Summary

Recommended high-level answers:

```txt
Does the app collect or share user data?
Yes.

Is all user data collected encrypted in transit?
Yes, if HTTPS/TLS is enforced for app, API, provider, and processor traffic. Verify before submission.

Can users request that data be deleted?
Yes. Pip has an in-app account deletion flow and a public delete-account page.

Does the app sell user data?
No.

Does the app collect data for advertising?
No, unless advertising or ad attribution tooling is later added.
```

## Data Categories

| Play category | Data type | Collected | Required or optional | Main purposes | Notes |
| --- | --- | --- | --- | --- | --- |
| Personal info | Email address | Yes | Required for account access | App functionality, account management, support, security | Used for sign-in, support, deletion, and reviewer access. |
| Personal info | User IDs | Yes | Required | App functionality, security, account management | Includes auth user ID and internal account identifiers. |
| Financial info | Bank account metadata | Yes when account data is connected or seeded | Required for core functionality after setup | App functionality | Read-only account names/types/masked identifiers/institution status. |
| Financial info | Account balances | Yes when account data is connected or seeded | Required for core functionality after setup | App functionality | Used for Spendable Cash Today and explanations. |
| Financial info | Transaction history | Yes when account data is connected or seeded | Required for core functionality after setup | App functionality | Used for recurring bills, income, explanations, and chat answers. |
| Financial info | Other financial info | Yes | Required for core functionality after setup | App functionality | Includes protected cushion, account preferences, recurring bill/income inferences, sync status, and financial summaries. |
| App activity | App interactions | Yes if product events or analytics are enabled | Optional where possible | Analytics, app functionality, security, diagnostics | Includes feature use, settings changes, feedback actions, and event logs. |
| App activity | In-app search or prompts | Yes if Ask Pip prompts are stored | Optional for chat use, required to answer chat | App functionality, support, abuse prevention | Includes chat prompts and assistant responses or references. |
| App activity | Other user-generated content | Yes if feedback or AI reports are stored | Optional | Support, app functionality, security | Includes AI report reasons/details and tester feedback. |
| App info and performance | Crash logs | Yes if crash logging is enabled | Optional | Diagnostics | Verify whether Netlify, Android, or other crash tooling stores this. |
| App info and performance | Diagnostics | Yes if server/client logs capture diagnostics | Optional | Diagnostics, security | Includes sync errors, network failures, API status, user-agent/build metadata if stored. |
| Device or other IDs | Device or app identifiers | Only if implemented by analytics, logs, or Android tooling | Optional | Diagnostics, security, analytics | Do not declare unless the shipped build stores or receives such IDs. |

Do not select payment info, credit score, credit report, money transfer, investment, crypto, insurance, or government ID data unless a later implementation actually collects it.

## Processor And Sharing Analysis

Review each provider before Play submission:

| Provider | Data likely processed | Purpose | Service-provider position | Play Console note |
| --- | --- | --- | --- | --- |
| Supabase | Auth identifiers, email, app database rows, financial data, chat/report/feedback rows | Hosting, auth, database | Service provider if processing only for Pip under contract | Usually not marked as sharing if service-provider exemption applies. Mark shared if exemption is not satisfied. |
| Plaid | Connected account metadata, balances, transactions, institution status | Read-only financial data connection | Third-party financial data processor/provider | Review contracts and disclosures. If user intentionally connects through Plaid, document clearly. |
| Teller | Connected account metadata, balances, transactions, institution status | Read-only financial data connection | Third-party financial data processor/provider | Include only if active in the shipped build. |
| OpenAI or AI gateway | Chat prompts, assistant context, selected financial context, AI report context if sent | Generate answers and explanations | Service provider if configured to process on Pip's behalf | Disclose AI processing in privacy. Avoid sending unnecessary sensitive context. |
| Netlify | Web/API hosting logs, IP/user-agent/request data, app responses | Hosting and diagnostics | Service provider if processing only for Pip | Verify logs and retention before final answer. |
| Google Play | Android app distribution data, crash/pre-launch data, tester data | Distribution and platform services | Platform provider | Covered by Play platform flows; still keep app disclosures accurate. |
| Analytics/logging provider | Events, device/app metadata, diagnostics | Analytics and diagnostics | Depends on provider and contract | Add only if active. If uncertain, mark relevant data as shared. |

## Retention And Deletion Notes

State the deletion behavior consistently across Play Console, privacy policy, `/delete-account`, and in-app UI:

- Full app-account deletion should delete or anonymize user-scoped financial data, provider credentials, account preferences, transactions, sync artifacts, cash snapshots, product events, chat turns, reactions, feedback, and AI reports according to the retention policy.
- Supabase auth user deletion should occur only through a server-side admin/service boundary.
- If minimal security, legal, fraud, or audit records are retained, disclose what remains, why, and for how long.
- The public deletion URL should be `https://spendwithpip.com/delete-account`.
- The support contact for deletion issues should be `tyler@animasai.co`.

Claim full deletion only after verifying the shipped backend deletes the auth account and associated user-scoped app data with `play-delete-test@animasai.co`.

## Play Console Checklist

- [ ] Privacy policy URL is live and public.
- [ ] Delete-account URL is live, public, non-PDF, and references `tyler@animasai.co`.
- [ ] Data Safety answers include controlled WebView data.
- [ ] Financial data categories are selected where applicable.
- [ ] AI prompt/report/feedback storage is declared where applicable.
- [ ] Service-provider exemptions are reviewed provider by provider.
- [ ] "Data is encrypted in transit" is verified for app, API, and provider calls.
- [ ] Account deletion behavior is verified with `play-delete-test@animasai.co`.
- [ ] No Android payment data is declared unless Android payments are later added through Play Billing.
- [ ] Privacy policy, terms, support, app UI, and Play answers use the same claims.
