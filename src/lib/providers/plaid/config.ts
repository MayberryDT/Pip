import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from "plaid";
import type { PlaidConnectSession, PlaidLinkMode } from "@/lib/providers/FinancialDataProvider";
import { ProviderUnavailableError } from "@/lib/providers/provider-errors";

export type PlaidEnvironment = "sandbox" | "production";

export type PlaidConfig = {
  clientId?: string;
  secret?: string;
  secretSource?: "PLAID_SECRET" | "PLAID_SANDBOX_SECRET";
  environment: PlaidEnvironment;
  products: Products[];
  countryCodes: CountryCode[];
  clientName: string;
  daysRequested: number;
  redirectUri?: string;
  webhookUrl?: string;
  productionRuntime?: boolean;
};

export type PlaidReadiness = {
  environment: PlaidEnvironment;
  clientIdConfigured: boolean;
  secretConfigured: boolean;
  canCreateLinkToken: boolean;
};

export type PlaidClient = Pick<
  PlaidApi,
  | "accountsGet"
  | "itemPublicTokenExchange"
  | "linkTokenCreate"
  | "transactionsSync"
  | "webhookVerificationKeyGet"
>;

const plaidProductMap: Record<string, Products> = {
  transactions: Products.Transactions,
};

const plaidCountryCodeMap: Record<string, CountryCode> = {
  US: CountryCode.Us,
  CA: CountryCode.Ca,
  GB: CountryCode.Gb,
};

export function getPlaidConfig(env: Record<string, string | undefined> = process.env): PlaidConfig {
  const secret = (env.PLAID_SECRET ?? env.PLAID_SANDBOX_SECRET)?.trim() || undefined;
  const redirectUri = getPlaidRedirectUri(env);
  const webhookUrl = getPlaidWebhookUrl(env);

  return {
    clientId: env.PLAID_CLIENT_ID?.trim() || undefined,
    secret,
    ...(secret
      ? { secretSource: env.PLAID_SECRET?.trim() ? "PLAID_SECRET" : "PLAID_SANDBOX_SECRET" }
      : {}),
    environment: parsePlaidEnvironment(env.PLAID_ENV),
    products: parsePlaidProducts(env.PLAID_PRODUCTS),
    countryCodes: parseCountryCodes(env.PLAID_COUNTRY_CODES),
    clientName: env.PLAID_CLIENT_NAME?.trim() || "Pip",
    daysRequested: parseDaysRequested(env.PLAID_DAYS_REQUESTED),
    redirectUri,
    webhookUrl,
    productionRuntime: isProductionPlaidRuntime(env, {
      redirectUri,
      webhookUrl,
    }),
  };
}

export function getPlaidReadiness(config: PlaidConfig = getPlaidConfig()): PlaidReadiness {
  const clientIdConfigured = Boolean(config.clientId);
  const secretConfigured = Boolean(config.secret);

  return {
    environment: config.environment,
    clientIdConfigured,
    secretConfigured,
    canCreateLinkToken: clientIdConfigured && secretConfigured,
  };
}

export function createPlaidClient(config: PlaidConfig = getPlaidConfig()): PlaidClient {
  if (!config.clientId || !config.secret) {
    throw new ProviderUnavailableError(
      "plaid",
      "Set PLAID_CLIENT_ID and PLAID_SECRET before connecting Plaid accounts.",
    );
  }

  const productionIssue = getProductionPlaidConfigIssue(config);

  if (productionIssue) {
    throw new ProviderUnavailableError("plaid", productionIssue);
  }

  return new PlaidApi(
    new Configuration({
      basePath:
        config.environment === "production"
          ? PlaidEnvironments.production
          : PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": config.clientId,
          "PLAID-SECRET": config.secret,
          "Plaid-Version": "2020-09-14",
        },
      },
    }),
  );
}

export async function createPlaidConnectSession(input: {
  userId: string;
  config?: PlaidConfig;
  client?: PlaidClient;
  accessToken?: string;
  mode?: PlaidLinkMode;
  institutionId?: string;
}): Promise<{
  provider: "plaid";
  status: "ready" | "unavailable";
  message: string;
  connect?: PlaidConnectSession;
}> {
  const config = input.config ?? getPlaidConfig();
  const readiness = getPlaidReadiness(config);
  const productionIssue = getProductionPlaidConfigIssue(config);

  if (!readiness.canCreateLinkToken) {
    return {
      provider: "plaid",
      status: "unavailable",
      message: "Set PLAID_CLIENT_ID and PLAID_SECRET before connecting Plaid accounts.",
    };
  }

  if (productionIssue) {
    return {
      provider: "plaid",
      status: "unavailable",
      message: productionIssue,
    };
  }

  const client = input.client ?? createPlaidClient(config);
  const mode: PlaidLinkMode = input.accessToken ? input.mode ?? "repair" : "connect";
  const response = await client.linkTokenCreate({
    client_name: config.clientName,
    language: "en",
    country_codes: config.countryCodes,
    ...(config.redirectUri ? { redirect_uri: config.redirectUri } : {}),
    ...(!input.accessToken && config.webhookUrl ? { webhook: config.webhookUrl } : {}),
    user: {
      client_user_id: input.userId,
    },
    ...(input.accessToken
      ? {
          access_token: input.accessToken,
          ...(mode === "account_selection"
            ? {
                update: {
                  account_selection_enabled: true,
                },
              }
            : {}),
        }
      : {
          products: config.products,
          transactions: {
            days_requested: config.daysRequested,
          },
        }),
  });

  return {
    provider: "plaid",
    status: "ready",
    message:
      mode === "connect"
        ? "Plaid Link is ready."
        : mode === "repair"
          ? "Plaid repair is ready."
          : "Plaid update is ready.",
    connect: {
      kind: "plaid",
      linkToken: response.data.link_token,
      environment: config.environment,
      products: mode === "connect" ? config.products : [],
      mode,
      institutionId: input.institutionId,
    },
  };
}

function parsePlaidEnvironment(value: string | undefined): PlaidEnvironment {
  return value === "production" ? "production" : "sandbox";
}

function getProductionPlaidConfigIssue(config: PlaidConfig): string | null {
  if (!config.productionRuntime) {
    return null;
  }

  if (config.environment !== "production") {
    return "PLAID_ENV must be production for production Plaid connections.";
  }

  if (config.secretSource === "PLAID_SANDBOX_SECRET") {
    return "PLAID_SECRET must be configured with the production Plaid secret.";
  }

  return null;
}

function parsePlaidProducts(value: string | undefined): Products[] {
  const products = (value ?? "transactions")
    .split(",")
    .map((product) => product.trim().toLowerCase())
    .filter((product) => product !== "balance")
    .map((product) => plaidProductMap[product])
    .filter((product): product is Products => Boolean(product));

  const uniqueProducts = Array.from(new Set(products));

  return uniqueProducts.length > 0 ? uniqueProducts : [Products.Transactions];
}

function parseCountryCodes(value: string | undefined): CountryCode[] {
  const countryCodes = (value ?? "US")
    .split(",")
    .map((countryCode) => countryCode.trim().toUpperCase())
    .map((countryCode) => plaidCountryCodeMap[countryCode])
    .filter((countryCode): countryCode is CountryCode => Boolean(countryCode));

  return countryCodes.length > 0 ? countryCodes : [CountryCode.Us];
}

function parseDaysRequested(value: string | undefined): number {
  const days = Number(value ?? "90");

  if (!Number.isFinite(days)) {
    return 90;
  }

  return Math.min(730, Math.max(30, Math.round(days)));
}

function getPlaidRedirectUri(env: Record<string, string | undefined>): string | undefined {
  const explicitRedirectUri = normalizeAbsoluteUrl(env.PLAID_REDIRECT_URI);

  if (explicitRedirectUri) {
    return explicitRedirectUri;
  }

  const configuredOrigin = normalizeOrigin(env.NEXT_PUBLIC_SITE_URL || env.URL);
  const appOrigin =
    configuredOrigin &&
    !(parsePlaidEnvironment(env.PLAID_ENV) === "production" && isLocalhostOrigin(configuredOrigin))
      ? configuredOrigin
      : normalizeOrigin(getDefaultPlaidRedirectOrigin(env));

  if (!appOrigin) {
    return undefined;
  }

  return `${appOrigin}/plaid/oauth`;
}

function getPlaidWebhookUrl(env: Record<string, string | undefined>): string | undefined {
  const explicitWebhookUrl = normalizePublicHttpsUrl(env.PLAID_WEBHOOK_URL);

  if (explicitWebhookUrl) {
    return explicitWebhookUrl;
  }

  const appOrigin = normalizePublicHttpsOrigin(env.NEXT_PUBLIC_SITE_URL || env.URL);

  if (!appOrigin) {
    return undefined;
  }

  return `${appOrigin}/api/webhooks/plaid`;
}

function normalizeOrigin(rawUrl: string | undefined): string | null {
  if (!rawUrl?.trim()) {
    return null;
  }

  const trimmedUrl = rawUrl.trim();
  const urlWithProtocol =
    trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")
      ? trimmedUrl
      : `https://${trimmedUrl}`;

  try {
    return new URL(urlWithProtocol).origin;
  } catch {
    return null;
  }
}

function normalizeAbsoluteUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl?.trim()) {
    return undefined;
  }

  const urlWithProtocol =
    rawUrl.trim().startsWith("http://") || rawUrl.trim().startsWith("https://")
      ? rawUrl.trim()
      : `https://${rawUrl.trim()}`;

  try {
    const url = new URL(urlWithProtocol);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizePublicHttpsOrigin(rawUrl: string | undefined): string | undefined {
  const origin = normalizeOrigin(rawUrl);

  if (!origin) {
    return undefined;
  }

  try {
    const url = new URL(origin);

    if (url.protocol !== "https:" || isLocalhost(url.hostname)) {
      return undefined;
    }

    return url.origin;
  } catch {
    return undefined;
  }
}

function normalizePublicHttpsUrl(rawUrl: string | undefined): string | undefined {
  const url = normalizeAbsoluteUrl(rawUrl);

  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:" || isLocalhost(parsed.hostname)) {
      return undefined;
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
}

function getDefaultPlaidRedirectOrigin(env: Record<string, string | undefined>): string | undefined {
  if (parsePlaidEnvironment(env.PLAID_ENV) === "production") {
    return "http://localhost:3000";
  }

  if (env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  return undefined;
}

function isProductionPlaidRuntime(
  env: Record<string, string | undefined>,
  urls: {
    redirectUri?: string;
    webhookUrl?: string;
  },
): boolean {
  if (env.CONTEXT === "production") {
    return true;
  }

  if (env.NODE_ENV !== "production") {
    return false;
  }

  return [
    env.NEXT_PUBLIC_SITE_URL,
    env.URL,
    urls.redirectUri,
    urls.webhookUrl,
  ]
    .map(normalizeOrigin)
    .filter((origin): origin is string => Boolean(origin))
    .some(isKnownProductionPlaidOrigin);
}

function isKnownProductionPlaidOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();

    return (
      hostname === "localhost:3000" ||
      hostname === "www.localhost:3000" ||
      hostname === "preview.example.com" ||
      hostname.endsWith("--preview.example.com")
    );
  } catch {
    return false;
  }
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    return isLocalhost(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
