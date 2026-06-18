# Pip Trust Readiness Implementation

Last updated: June 18, 2026

This note documents where Pip's public trust disclosures and in-app trust context live.

## Source of truth

- `src/lib/trust/pip-trust-policy.ts` holds public provider, AI, security, privacy, pricing, deletion, and product-boundary claims.
- `src/lib/pip-cash/trust-receipt.ts` builds the current Spendable Cash Today receipt from a `PipCashResult` plus optional sync status.

Do not restate provider, AI, deletion, or pricing claims in new UI without checking `pipTrustPolicy` first.

## Public surfaces

- `/how-the-number-works` explains inputs, common edge cases, and how to read the receipt.
- `/security`, `/privacy`, `/terms`, `/support`, `/delete-account`, `/pricing`, and `public/llms.txt` reuse or reflect the same trust boundaries.
- The marketing nav and sitemap include the calculation page; `robots.ts` explicitly allows it and pricing.

## App surfaces

- The main Pip screen renders a compact receipt summary under Spendable Cash Today.
- Ask Pip routes trust policy questions through `get_trust_policy`.
- Ask Pip routes freshness, completeness, and receipt questions through `get_trust_receipt`, which returns a typed `trust_receipt` card.

## Boundaries intentionally left explicit

- Pip names Plaid as the current read-only bank-data provider.
- Pip describes AI as explanation and conversation support, not the owner of the money calculation.
- Pip does not publicly claim SOC 2, independent penetration testing, or a third-party audit.
- Pip does not promise a universal trial or refund; subscription details depend on the platform and offer.
- Pip remains decision support and does not guarantee every future obligation is known.
