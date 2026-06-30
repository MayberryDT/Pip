# Architecture

Pip is organized around a deterministic money engine with an AI explanation layer.

Architecture flow:

User -> Next.js app -> Supabase Auth and Postgres -> Plaid read-only account connection -> normalized accounts and transactions -> Pip Cash deterministic engine -> AI agent explanation layer -> Ask Pip, cards, and purchase checks.

## Boundaries

- Pip is read-only and does not move money.
- Money math lives in deterministic code, not the AI layer.
- Provider credentials are server-side only.
- Local fake-data mode is the default public development path.
- Hosted production configuration is private and not part of this repository.
