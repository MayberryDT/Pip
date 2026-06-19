#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const androidVisibleCopyFiles = [
  "src/app/android-access/page.tsx",
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/support/page.tsx",
  "src/app/delete-account/page.tsx",
  "src/app/reviewer-login/page.tsx",
  "src/components/LegalShell.tsx",
  "src/components/auth/LoginPanel.tsx",
];

export const androidVisibleCopyBlockers = [
  /\$2\.99/,
  /\$7\.99/,
  /\bView pricing\b/i,
  /\bPricing details\b/i,
  /href=["']\/pricing["']/i,
  /\bSubscribe\b/i,
  /\bUpgrade\b/i,
  /\bStart trial\b/i,
  /\bPremium\b/i,
  /\bStripe\b/i,
  /\bcheckout\b/i,
  /go to the website to pay/i,
];

export function findAndroidVisibleCopyBlockers({
  cwd = process.cwd(),
  files = androidVisibleCopyFiles,
} = {}) {
  const failures = [];

  for (const file of files) {
    const path = resolve(cwd, file);
    const content = readFileSync(path, "utf8");

    failures.push(...findAndroidVisibleCopyBlockersInContent(file, content));
  }

  return failures;
}

export function findAndroidVisibleCopyBlockersInContent(file, content) {
  const failures = [];

  for (const pattern of androidVisibleCopyBlockers) {
    if (pattern.test(content)) {
      failures.push({
        file,
        pattern: pattern.source,
      });
    }
  }

  return failures;
}

export function runCheckAndroidVisibleCopy({
  cwd = process.cwd(),
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const failures = findAndroidVisibleCopyBlockers({ cwd });

  if (failures.length > 0) {
    for (const failure of failures) {
      stderr(`${failure.file} contains Android-visible blocker pattern: ${failure.pattern}`);
    }

    return 1;
  }

  stdout("Verified Android-visible copy has no pricing or purchase blockers.");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runCheckAndroidVisibleCopy();
}
