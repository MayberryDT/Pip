import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts/check-deployment-env.mjs");
const supabaseAnonJwt =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0.signature";
const supabaseServiceRoleJwt =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UifQ.signature";

describe("check-deployment-env", () => {
  it("passes fake mode only when fake-data mode is explicit", async () => {
    const cwd = createTempProject(`
PIP_SUPABASE_MODE=off
PIP_RATE_LIMIT_SALT=rate-limit-salt
`);

    const result = await runCheck(cwd, "--mode=fake");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Deployment env check passed for fake mode.");
  });

  it("fails fake mode without the production rate-limit salt", async () => {
    const cwd = createTempProject(`
PIP_SUPABASE_MODE=off
`);

    const result = await runCheck(cwd, "--mode=fake");
    const output = result.stderr + result.stdout + result.warnings;

    expect(result.status).toBe(1);
    expect(output).toContain("Deployment env check failed for fake mode.");
    expect(output).toContain("- PIP_RATE_LIMIT_SALT");
  });

  it("fails beta mode with exact missing server-side requirements", async () => {
    const cwd = createTempProject(`
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key
PIP_OPERATOR_TOKEN=operator-token
PIP_PROVIDER_TOKEN_KEY_BASE64=token-key
PIP_EMAIL_MODE=off
PLAID_CLIENT_ID=plaid-client-id
PLAID_SECRET=plaid-secret
PLAID_ENV=sandbox
`);

    const result = await runCheck(cwd, "--mode=beta");
    const output = result.stderr + result.stdout + result.warnings;

    expect(result.status).toBe(1);
    expect(output).toContain("Deployment env check failed for beta mode.");
    expect(output).toContain("- NEXT_PUBLIC_SITE_URL");
    expect(output).toContain("- SUPABASE_SERVICE_ROLE_KEY");
    expect(output).toContain("- PIP_RATE_LIMIT_SALT");
    expect(output).toContain(
      "- OPENAI_API_KEY, OPENAI_BASE_URL, or NETLIFY_AI_GATEWAY_BASE_URL plus NETLIFY_AI_GATEWAY_KEY",
    );
    expect(output).toContain("- PLAID_ENV must be production for beta mode.");
    expect(output).not.toContain("operator-token");
    expect(output).not.toContain("plaid-secret");
  });

  it("allows Netlify AI Gateway base URL instead of a direct OpenAI key", async () => {
    const cwd = createTempProject(`
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SITE_URL=https://spendwithpip.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseAnonJwt}
SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceRoleJwt}
PIP_OPERATOR_TOKEN=operator-token
PIP_PROVIDER_TOKEN_KEY_BASE64=token-key
PIP_RATE_LIMIT_SALT=rate-limit-salt
PLAID_CLIENT_ID=plaid-client-id
PLAID_SECRET=plaid-secret
PLAID_ENV=production
OPENAI_BASE_URL=https://pip.netlify.app/.netlify/ai
RESEND_API_KEY=resend-key
PIP_EMAIL_FROM=Pip <hello@spendwithpip.com>
PIP_EMAIL_POSTAL_ADDRESS=123 Pip St, Denver, CO
PIP_EMAIL_UNSUBSCRIBE_SECRET=email-secret
RESEND_WEBHOOK_SECRET=whsec_123
`);

    const result = await runCheck(cwd, "--mode=beta");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Deployment env check passed for beta mode.");
  });

  it("allows Netlify AI Gateway explicit injected variables without a direct OpenAI key", async () => {
    const cwd = createTempProject(`
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SITE_URL=https://spendwithpip.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key
SUPABASE_SERVICE_ROLE_KEY=service-role-key
PIP_OPERATOR_TOKEN=operator-token
PIP_PROVIDER_TOKEN_KEY_BASE64=token-key
PIP_RATE_LIMIT_SALT=rate-limit-salt
PLAID_CLIENT_ID=plaid-client-id
PLAID_SECRET=plaid-secret
PLAID_ENV=production
NETLIFY_AI_GATEWAY_BASE_URL=https://api.netlify.com/ai/v1
NETLIFY_AI_GATEWAY_KEY=netlify-gateway-key
RESEND_API_KEY=resend-key
PIP_EMAIL_FROM=Pip <hello@spendwithpip.com>
PIP_EMAIL_POSTAL_ADDRESS=123 Pip St, Denver, CO
PIP_EMAIL_UNSUBSCRIBE_SECRET=email-secret
RESEND_WEBHOOK_SECRET=whsec_123
`);

    const result = await runCheck(cwd, "--mode=beta");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Deployment env check passed for beta mode.");
  });

  it("fails beta mode when the canonical app or Plaid redirect URL points to localhost", async () => {
    const cwd = createTempProject(`
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=service-role-key
PIP_OPERATOR_TOKEN=operator-token
PIP_PROVIDER_TOKEN_KEY_BASE64=token-key
PIP_RATE_LIMIT_SALT=rate-limit-salt
PLAID_CLIENT_ID=plaid-client-id
PLAID_SECRET=plaid-secret
PLAID_ENV=production
PLAID_REDIRECT_URI=http://localhost:3000/plaid/oauth
OPENAI_BASE_URL=https://pip.netlify.app/.netlify/ai
RESEND_API_KEY=resend-key
PIP_EMAIL_FROM=Pip <hello@spendwithpip.com>
PIP_EMAIL_POSTAL_ADDRESS=123 Pip St, Denver, CO
PIP_EMAIL_UNSUBSCRIBE_SECRET=email-secret
RESEND_WEBHOOK_SECRET=whsec_123
`);

    const result = await runCheck(cwd, "--mode=beta");
    const output = result.stderr + result.stdout + result.warnings;

    expect(result.status).toBe(1);
    expect(output).toContain(
      "- NEXT_PUBLIC_SITE_URL must be the production app origin, not localhost.",
    );
    expect(output).toContain("- PLAID_REDIRECT_URI must not point to localhost in beta mode.");
  });

  it("passes local-beta mode with Supabase, model config, and localhost origins", async () => {
    const cwd = createTempProject(`
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseAnonJwt}
SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceRoleJwt}
PIP_OPERATOR_TOKEN=operator-token
PIP_PROVIDER_TOKEN_KEY_BASE64=token-key
PIP_RATE_LIMIT_SALT=rate-limit-salt
PLAID_CLIENT_ID=plaid-client-id
PLAID_SECRET=plaid-secret
PLAID_ENV=production
PLAID_REDIRECT_URI=http://localhost:3000/plaid/oauth
OPENAI_BASE_URL=https://pip.netlify.app/.netlify/ai
PIP_EMAIL_MODE=off
PIP_LOCAL_STAGING=1
`);

    const result = await runCheck(cwd, "--mode=local-beta");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Deployment env check passed for local-beta mode.");
  });

  it("lets ignored local-beta env override Netlify placeholder values", async () => {
    const cwd = createTempProject(
      "",
      `
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseAnonJwt}
SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceRoleJwt}
PLAID_REDIRECT_URI=http://localhost:3000/plaid/oauth
PIP_LOCAL_STAGING=1
`,
    );

    const result = await runCheck(cwd, "--mode=local-beta", {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SITE_URL: "https://spendwithpip.com",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "netlify-secret-placeholder",
      PIP_OPERATOR_TOKEN: "operator-token",
      PIP_PROVIDER_TOKEN_KEY_BASE64: "token-key",
      PIP_RATE_LIMIT_SALT: "rate-limit-salt",
      PLAID_CLIENT_ID: "plaid-client-id",
      PLAID_SECRET: "plaid-secret",
      PLAID_ENV: "production",
      PLAID_REDIRECT_URI: "https://spendwithpip.com/plaid/oauth",
      OPENAI_BASE_URL: "https://pip.netlify.app/.netlify/ai",
      PIP_EMAIL_MODE: "off",
      PIP_LOCAL_STAGING: "0",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Deployment env check passed for local-beta mode.");
  });

  it("fails local-beta mode when Supabase keys have placeholder shapes", async () => {
    const cwd = createTempProject(`
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key
SUPABASE_SERVICE_ROLE_KEY=netlify-secret-placeholder
PIP_OPERATOR_TOKEN=operator-token
PIP_PROVIDER_TOKEN_KEY_BASE64=token-key
PIP_RATE_LIMIT_SALT=rate-limit-salt
PLAID_CLIENT_ID=plaid-client-id
PLAID_SECRET=plaid-secret
PLAID_ENV=production
PLAID_REDIRECT_URI=http://localhost:3000/plaid/oauth
OPENAI_BASE_URL=https://pip.netlify.app/.netlify/ai
PIP_EMAIL_MODE=off
PIP_LOCAL_STAGING=1
`);

    const result = await runCheck(cwd, "--mode=local-beta");
    const output = result.stderr + result.stdout + result.warnings;

    expect(result.status).toBe(1);
    expect(output).toContain(
      "- NEXT_PUBLIC_SUPABASE_ANON_KEY must be a Supabase anon or publishable key in local-beta mode.",
    );
    expect(output).toContain(
      "- SUPABASE_SERVICE_ROLE_KEY must be a Supabase service-role or secret key in local-beta mode.",
    );
  });

  it("fails local-beta mode when fake Supabase mode or model config is missing", async () => {
    const cwd = createTempProject(`
PIP_SUPABASE_MODE=off
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key
SUPABASE_SERVICE_ROLE_KEY=service-role-key
PIP_OPERATOR_TOKEN=operator-token
PIP_PROVIDER_TOKEN_KEY_BASE64=token-key
PIP_RATE_LIMIT_SALT=rate-limit-salt
PLAID_CLIENT_ID=plaid-client-id
PLAID_SECRET=plaid-secret
PLAID_ENV=production
`);

    const result = await runCheck(cwd, "--mode=local-beta");
    const output = result.stderr + result.stdout + result.warnings;

    expect(result.status).toBe(1);
    expect(output).toContain("Deployment env check failed for local-beta mode.");
    expect(output).toContain("- PIP_SUPABASE_MODE must not be off in local-beta mode.");
    expect(output).toContain("- PIP_LOCAL_STAGING must be 1 in local-beta mode.");
    expect(output).toContain(
      "- NEXT_PUBLIC_SUPABASE_ANON_KEY must be a Supabase anon or publishable key in local-beta mode.",
    );
    expect(output).toContain(
      "- SUPABASE_SERVICE_ROLE_KEY must be a Supabase service-role or secret key in local-beta mode.",
    );
    expect(output).toContain(
      "- OPENAI_API_KEY, OPENAI_BASE_URL, or NETLIFY_AI_GATEWAY_BASE_URL plus NETLIFY_AI_GATEWAY_KEY",
    );
    expect(output).toContain("- PLAID_REDIRECT_URI must be set for local-beta mode.");
  });

  it("fails beta mode when fake Supabase mode is enabled", async () => {
    const cwd = createTempProject(`
PIP_SUPABASE_MODE=off
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SITE_URL=https://spendwithpip.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key
SUPABASE_SERVICE_ROLE_KEY=service-role-key
PIP_OPERATOR_TOKEN=operator-token
PIP_PROVIDER_TOKEN_KEY_BASE64=token-key
PIP_RATE_LIMIT_SALT=rate-limit-salt
PLAID_CLIENT_ID=plaid-client-id
PLAID_SECRET=plaid-secret
PLAID_ENV=production
OPENAI_BASE_URL=https://pip.netlify.app/.netlify/ai
PIP_EMAIL_MODE=off
`);

    const result = await runCheck(cwd, "--mode=beta");
    const output = result.stderr + result.stdout + result.warnings;

    expect(result.status).toBe(1);
    expect(output).toContain("- PIP_SUPABASE_MODE must not be off in beta mode.");
  });

  it("fails beta mode when local fake app mode is enabled", async () => {
    const cwd = createTempProject(`
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key
NEXT_PUBLIC_SITE_URL=https://spendwithpip.com
SUPABASE_SERVICE_ROLE_KEY=service-role-key
PIP_OPERATOR_TOKEN=operator-token
PIP_PROVIDER_TOKEN_KEY_BASE64=token-key
PIP_RATE_LIMIT_SALT=rate-limit-salt
PIP_LOCAL_FAKE_APP_MODE=1
PLAID_CLIENT_ID=plaid-client-id
PLAID_SECRET=plaid-secret
PLAID_ENV=production
OPENAI_BASE_URL=https://pip.netlify.app/.netlify/ai
RESEND_API_KEY=resend-key
PIP_EMAIL_FROM=Pip <hello@spendwithpip.com>
PIP_EMAIL_POSTAL_ADDRESS=123 Pip St, Denver, CO
PIP_EMAIL_UNSUBSCRIBE_SECRET=email-secret
RESEND_WEBHOOK_SECRET=whsec_123
`);

    const result = await runCheck(cwd, "--mode=beta");
    const output = result.stderr + result.stdout + result.warnings;

    expect(result.status).toBe(1);
    expect(output).toContain("- PIP_LOCAL_FAKE_APP_MODE must not be enabled for beta mode.");
  });

  it("fails local-beta mode when staging flag or localhost origins are missing", async () => {
    const cwd = createTempProject(`
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SITE_URL=https://spendwithpip.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key
SUPABASE_SERVICE_ROLE_KEY=service-role-key
PIP_OPERATOR_TOKEN=operator-token
PIP_PROVIDER_TOKEN_KEY_BASE64=token-key
PIP_RATE_LIMIT_SALT=rate-limit-salt
PLAID_CLIENT_ID=plaid-client-id
PLAID_SECRET=plaid-secret
PLAID_ENV=production
PLAID_REDIRECT_URI=https://spendwithpip.com/plaid/oauth
OPENAI_BASE_URL=https://pip.netlify.app/.netlify/ai
PIP_EMAIL_MODE=off
`);

    const result = await runCheck(cwd, "--mode=local-beta");
    const output = result.stderr + result.stdout + result.warnings;

    expect(result.status).toBe(1);
    expect(output).toContain("- PIP_LOCAL_STAGING must be 1 in local-beta mode.");
    expect(output).toContain("- NEXT_PUBLIC_SITE_URL must be localhost in local-beta mode.");
    expect(output).toContain(
      "- NEXT_PUBLIC_SUPABASE_ANON_KEY must be a Supabase anon or publishable key in local-beta mode.",
    );
    expect(output).toContain(
      "- SUPABASE_SERVICE_ROLE_KEY must be a Supabase service-role or secret key in local-beta mode.",
    );
    expect(output).toContain("- PLAID_REDIRECT_URI must point to localhost in local-beta mode.");
  });

  it("warns when an explicit Plaid redirect origin differs from the canonical site origin", async () => {
    const cwd = createTempProject(`
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key
NEXT_PUBLIC_SITE_URL=https://spendwithpip.com
SUPABASE_SERVICE_ROLE_KEY=service-role-key
PIP_OPERATOR_TOKEN=operator-token
PIP_PROVIDER_TOKEN_KEY_BASE64=token-key
PIP_RATE_LIMIT_SALT=rate-limit-salt
PLAID_CLIENT_ID=plaid-client-id
PLAID_SECRET=plaid-secret
PLAID_ENV=production
PLAID_REDIRECT_URI=https://preview--spendwithpip.netlify.app/plaid/oauth
OPENAI_BASE_URL=https://pip.netlify.app/.netlify/ai
RESEND_API_KEY=resend-key
PIP_EMAIL_FROM=Pip <hello@spendwithpip.com>
PIP_EMAIL_POSTAL_ADDRESS=123 Pip St, Denver, CO
PIP_EMAIL_UNSUBSCRIBE_SECRET=email-secret
RESEND_WEBHOOK_SECRET=whsec_123
`);

    const result = await runCheck(cwd, "--mode=beta");

    expect(result.status).toBe(0);
    expect(result.warnings).toContain(
      "PLAID_REDIRECT_URI does not share the NEXT_PUBLIC_SITE_URL origin.",
    );
  });

  it("fails beta mode when email delivery env is incomplete", async () => {
    const cwd = createTempProject(`
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SITE_URL=https://spendwithpip.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key
SUPABASE_SERVICE_ROLE_KEY=service-role-key
PIP_OPERATOR_TOKEN=operator-token
PIP_PROVIDER_TOKEN_KEY_BASE64=token-key
PIP_RATE_LIMIT_SALT=rate-limit-salt
PLAID_CLIENT_ID=plaid-client-id
PLAID_SECRET=plaid-secret
PLAID_ENV=production
OPENAI_BASE_URL=https://pip.netlify.app/.netlify/ai
RESEND_API_KEY=resend-key
`);

    const result = await runCheck(cwd, "--mode=beta");
    const output = result.stderr + result.stdout + result.warnings;

    expect(result.status).toBe(1);
    expect(output).toContain("PIP_EMAIL_FROM");
    expect(output).toContain("PIP_EMAIL_POSTAL_ADDRESS");
    expect(output).toContain("PIP_EMAIL_UNSUBSCRIBE_SECRET");
    expect(output).toContain("RESEND_WEBHOOK_SECRET");
  });

  it("documents the production rate-limit salt in local and Netlify setup files", () => {
    expect(readFileSync(".env.example", "utf8")).toContain("PIP_RATE_LIMIT_SALT=");
    expect(readFileSync("README.md", "utf8")).toContain("PIP_RATE_LIMIT_SALT");
    expect(readFileSync("netlify.toml", "utf8")).toContain("PIP_RATE_LIMIT_SALT");
  });

  it("documents app access grants and operator-token invite operations", () => {
    const readme = readFileSync("README.md", "utf8");
    const playAccess = readFileSync("docs/play-store/app-access.md", "utf8");

    expect(readme).toContain("/api/operator/access-grants");
    expect(readme).toContain("PIP_OPERATOR_TOKEN");
    expect(readme).toContain("app_access_grants");
    expect(playAccess).toContain("active app access grant");
  });
});

function createTempProject(envFile: string, localEnvFile = ""): string {
  const cwd = mkdtempSync(join(tmpdir(), "pip-env-check-"));
  writeFileSync(join(cwd, ".env"), envFile.trimStart());

  if (localEnvFile) {
    writeFileSync(join(cwd, ".env.local"), localEnvFile.trimStart());
  }

  return cwd;
}

async function runCheck(
  cwd: string,
  mode: "--mode=beta" | "--mode=fake" | "--mode=local-beta",
  env: Record<string, string | undefined> = {},
) {
  const output = {
    stdout: [] as string[],
    stderr: [] as string[],
    warnings: [] as string[],
  };
  const module = await import(pathToFileURL(scriptPath).href);
  const runDeploymentEnvCheck = module.runDeploymentEnvCheck as (input: {
    argv: string[];
    cwd: string;
    env: Record<string, string | undefined>;
    stdout: (line: string) => void;
    stderr: (line: string) => void;
    warn: (line: string) => void;
  }) => number;
  const status = runDeploymentEnvCheck({
    argv: ["node", scriptPath, mode],
    cwd,
    env,
    stdout: (line) => output.stdout.push(line),
    stderr: (line) => output.stderr.push(line),
    warn: (line) => output.warnings.push(line),
  });

  return {
    status,
    stdout: output.stdout.join("\n"),
    stderr: output.stderr.join("\n"),
    warnings: output.warnings.join("\n"),
  };
}
