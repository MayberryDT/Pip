# Pip Character Pipeline

This folder stages generated-image Pip character assets and publishes a minimal best-effort v001 set for app usage.

Pip is the public app and agent name for the mobile-first personal finance app. The public daily metric is Spendable Cash Today.

## Source Files

- Character rules: `design/pip-character/pip-character-bible.md`
- Asset manifest: `design/pip-character/asset-manifest.json`
- Raw incoming assets: `design/pip-character/incoming/raw/`
- Stable normalized assets: `design/pip-character/incoming/normalized/`
- Auto mapping: `design/pip-character/incoming/auto-mapping.json`
- Review page: `design/pip-character/incoming/contact-sheets/review.html`
- Approved public assets: `public/brand/pip-character/v001/`

Incoming raw and normalized files are ignored because they are local review material. Approved public v001 assets are not ignored and are the only assets app code may use.

## Commands

Build the current minimal app-ready asset set:

```bash
npm run pip:character:quick-wire
```

Auto-select and copy the five required app assets:

```bash
npm run pip:character:auto-select
```

Import local generated images:

```bash
npm run pip:character:import
```

Normalize imported files to stable IDs:

```bash
npm run pip:character:normalize
```

Generate the browser review page:

```bash
npm run pip:character:review
```

Create an optional manual review mapping:

```bash
npm run pip:character:propose-mapping
```

Run the full first-pass preparation workflow:

```bash
npm run pip:character:prepare
```

Apply an optional reviewed manual mapping:

```bash
npm run pip:character:apply-mapping
```

Check approved production assets:

```bash
npm run pip:character:check
```

## Production Rules

- Do not use random generated Pip images in production.
- Do not use branchless Pip assets.
- Do not wire incoming images directly into app code.
- Only reviewed assets copied into `public/brand/pip-character/v001` may be used by the app.
- Every Pip image must include the leafy branch, even at tiny avatar sizes.
