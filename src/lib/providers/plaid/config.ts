import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from "plaid";
import type { PlaidConnectSession } from "@/lib/providers/FinancialDataProvider";
import { ProviderUnavailableError } from "@/lib/providers/provider-errors";

export type PlaidEnvironment = "sandbox" | "production";

export type PlaidConfig = {
  clientId?: string;
  secret?: string;
  environment: PlaidEnvironment;
  products: Products[];
  countryCodes: CountryCode[];
  clientName: string;
  daysRequested: number;
  redirectUri?: string;
};

export type PlaidReadiness = {
  environment: PlaidEnvironment;
  clientIdConfigured: boolean;
  secretConfigured: boolean;
  canCreateLinkToken: boolean;
};

export type PlaidClient = Pick<
  PlaidApi,
  "accountsGet" | "itemPublicTokenExchange" | "linkTokenCreate" | "transactionsSync"
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
  return {
    clientId: env.PLAID_CLIENT_ID?.trim() || undefined,
    secret: (env.PLAID_SECRET ?? env.PLAID_SANDBOX_SECRET)?.trim() || undefined,
    environment: parsePlaidEnvironment(env.PLAID_ENV),
    products: parsePlaidProducts(env.PLAID_PRODUCTS),
    countryCodes: parseCountryCodes(env.PLAID_COUNTRY_CODES),
    clientName: env.PLAID_CLIENT_NAME?.trim() || "Pip",
    daysRequested: parseDaysRequested(env.PLAID_DAYS_REQUESTED),
    redirectUri: getPlaidRedirectUri(env),
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
}): Promise<{
  provider: "plaid";
  status: "ready" | "unavailable";
  message: string;
  connect?: PlaidConnectSession;
}> {
  const config = input.config ?? getPlaidConfig();
  const readiness = getPlaidReadiness(config);

  if (!readiness.canCreateLinkToken) {
    return {
      provider: "plaid",
      status: "unavailable",
      message: "Set PLAID_CLIENT_ID and PLAID_SECRET before connecting Plaid accounts.",
    };
  }

  const client = input.client ?? createPlaidClient(config);
  const mode = input.accessToken ? "repair" : "connect";
  const response = await client.linkTokenCreate({
    client_name: config.clientName,
    language: "en",
    country_codes: config.countryCodes,
    ...(config.redirectUri ? { redirect_uri: config.redirectUri } : {}),
    user: {
      client_user_id: input.userId,
    },
    ...(input.accessToken
      ? {
          access_token: input.accessToken,
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
    message: mode === "repair" ? "Plaid repair is ready." : "Plaid Link is ready.",
    connect: {
      kind: "plaid",
      linkToken: response.data.link_token,
      environment: config.environment,
      products: mode === "repair" ? [] : config.products,
      mode,
    },
  };
}

function parsePlaidEnvironment(value: string | undefined): PlaidEnvironment {
  return value === "production" ? "production" : "sandbox";
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

  const appOrigin = normalizeOrigin(
    env.NEXT_PUBLIC_SITE_URL ||
      env.URL ||
      env.DEPLOY_PRIME_URL ||
      (env.NODE_ENV === "development" ? "http://localhost:3000" : undefined),
  );

  if (!appOrigin) {
    return undefined;
  }

  return `${appOrigin}/plaid/oauth`;
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
