# Pip

Open-source web app for Pip: an experimental AI money companion that calculates Spendable Cash Today from read-only connected account data.

This repository is a source release and proof-of-work project. It is not connected to the hosted Pip production deployment, private provider accounts, or production deployment configuration.

Use fake-data/demo mode unless you understand the risks of configuring real financial-data providers.

## Development

```bash
npm install
npm run dev
```

## Local fake app

```bash
PIP_SUPABASE_MODE=off PIP_LOCAL_FAKE_APP_MODE=1 PIP_RATE_LIMIT_SALT=local-only npm run dev
```

## Verification

```bash
npm run test
npm run build
npm run check:db-schema-names
```

## Production services

- The hosted Pip deployment is managed separately from this source release.
- This public repo contains no production deployment wiring and no production provider configuration.
- Developers may connect their own Supabase, Plaid, Stripe, and AI provider accounts by filling in local environment values.

## Boundaries

- Pip is read-only and cannot move money.
- Money math lives in deterministic code, not the AI layer.
- Provider credentials and service-role keys must stay server-side.
- Local fake-data mode is the default public development path.
