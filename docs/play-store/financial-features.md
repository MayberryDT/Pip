# Play Store Financial Features Notes

Status: conservative declaration notes for Play Console. Final answers must match shipped app behavior, store listing copy, screenshots, privacy policy, and terms.

## Recommended Positioning

Pip should be positioned as a finance-adjacent support service:

```txt
Pip is a read-only daily spending companion. It helps users understand a simple Spendable Cash Today signal based on connected account activity, upcoming bills, and a user-controlled savings cushion. Pip does not hold funds, move money, issue loans, make credit decisions, provide investment advice, or act as a bank.
```

Recommended Financial features declaration:

```txt
The app provides a financial support/insight service using read-only connected account information. It helps users understand spending context and available cash signals. It does not provide banking, lending, money transfer, wallet, payday loan, earned wage access, credit monitoring/reporting, stock or crypto trading, insurance, or formal financial advice.
```

If Play Console offers `Support services` with `Other`, use that category unless the final Console taxonomy requires a more specific non-regulated category.

## Categories To Avoid Unless Implementation Changes

Do not select or imply:

- Banking or neobank services.
- Deposit accounts.
- Money movement, transfers, remittance, wallet, stored value, or payments.
- Bill payment.
- Loans, loan facilitation, payday loans, cash advance, earned wage access, or line of credit.
- Credit decisions, credit repair, credit monitoring, or credit reports.
- Buy now pay later.
- Investment advice, brokerage, stock trading, crypto, or securities.
- Insurance.
- Tax, legal, or regulated financial advice.
- Guaranteed savings, guaranteed affordability, or guaranteed overdraft prevention.

## Required Copy Guardrails

Use language like:

- Read-only account data.
- Spending clarity.
- Spendable Cash Today.
- Daily money companion.
- Decision support.
- Connected account activity.
- Upcoming bills.
- Protected cushion.
- No money movement.
- Not a bank.
- No loans or credit decisions.
- No investment, tax, legal, or financial advice.

Avoid language like:

- Borrow.
- Advance.
- Loan.
- Credit line.
- Get paid early.
- We move your money.
- We pay bills for you.
- Guaranteed spending room.
- Guaranteed savings.
- Bank replacement.
- Financial advisor.
- Investment recommendations.

## Store Listing Answer Notes

Short description:

```txt
A calm daily spending signal from your connected account activity.
```

Long-description core copy:

```txt
Pip shows Spendable Cash Today: one simple number that helps you understand today's spending room based on connected account activity, upcoming bills, and your savings cushion.

Pip is read-only. It does not move money, hold funds, initiate transfers, issue loans, make credit decisions, or provide investment, tax, legal, or financial advice.
```

Android payment note, if needed in review notes:

```txt
The Android test build is consumption-only and does not include pricing, checkout, subscription, trial, upgrade, Stripe, or external payment flows.
```

## Evidence Checklist

Before completing the Financial features declaration:

- [ ] Store listing describes read-only spending clarity, not banking or advice.
- [ ] Screenshots show demo financial data only.
- [ ] Screenshots do not show payment CTAs.
- [ ] Terms state Pip is not a bank and does not provide loans, money movement, or formal advice.
- [ ] Privacy policy describes connected financial data and AI processing.
- [ ] App UI includes read-only/no-money-movement language in the appropriate places.
- [ ] Android app has no pricing, checkout, upgrade, trial, subscription, or external payment path.
- [ ] Data Safety worksheet declares connected account metadata, balances, transactions, and derived financial info.
- [ ] Support copy does not direct Android users to a non-Play payment path.

## Internal Review Questions

Answer "yes" before submission:

- [ ] Could a reviewer tell that Pip is read-only?
- [ ] Could a reviewer tell that Pip does not move money?
- [ ] Could a reviewer tell that Pip does not offer loans or credit?
- [ ] Could a reviewer tell that Pip is not giving regulated financial advice?
- [ ] Do listing, screenshots, app UI, terms, privacy, Data Safety, and financial declaration all tell the same story?
