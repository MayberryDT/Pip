# Contributing

This repository contains the open-source Pip web app. Keep website, brand campaign, and launch assets out of this source tree.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run test
npm run build
```

Use explicit fake-data mode for local prototype work:

```bash
PIP_SUPABASE_MODE=off PIP_LOCAL_FAKE_APP_MODE=1 PIP_RATE_LIMIT_SALT=local-only npm run dev
```

## Boundaries

- Do not add money movement.
- Do not add dashboards, budget categories, or transaction-led navigation.
- Do not expose service-role, provider, Stripe, or model secrets to the browser.
- Add tests for auth, billing, provider, or financial-calculation changes.
