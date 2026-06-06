import { randomUUID } from "node:crypto";
import type { ConnectSession } from "@/lib/providers/FinancialDataProvider";

export type TellerEnvironment = "sandbox" | "development" | "production";

export type TellerConfig = {
  applicationId?: string;
  environment: TellerEnvironment;
  products: string[];
  apiBaseUrl: string;
  certificatePem?: string;
  privateKeyPem?: string;
  tokenEncryptionKeyBase64?: string;
};

export type TellerReadiness = {
  environment: TellerEnvironment;
  applicationIdConfigured: boolean;
  certificateConfigured: boolean;
  privateKeyConfigured: boolean;
  tokenEncryptionConfigured: boolean;
  canCreateConnectSession: boolean;
  canCallApi: boolean;
};

const tellerEnvironments = new Set<TellerEnvironment>(["sandbox", "development", "production"]);
const tellerDataProducts = new Set(["transactions", "balance"]);

export function getTellerConfig(env: Record<string, string | undefined> = process.env): TellerConfig {
  return {
    applicationId: env.TELLER_APPLICATION_ID,
    environment: parseEnvironment(env.TELLER_ENVIRONMENT),
    products: parseProducts(env.TELLER_PRODUCTS),
    apiBaseUrl: env.TELLER_API_BASE_URL ?? "https://api.teller.io",
    certificatePem: normalizePem(env.TELLER_CERTIFICATE_PEM),
    privateKeyPem: normalizePem(env.TELLER_PRIVATE_KEY_PEM),
    tokenEncryptionKeyBase64: env.FREE_CASH_PROVIDER_TOKEN_KEY_BASE64,
  };
}

export function getTellerReadiness(config: TellerConfig = getTellerConfig()): TellerReadiness {
  const applicationIdConfigured = Boolean(config.applicationId);
  const certificateConfigured = Boolean(config.certificatePem);
  const privateKeyConfigured = Boolean(config.privateKeyPem);
  const tokenEncryptionConfigured = Boolean(config.tokenEncryptionKeyBase64);

  return {
    environment: config.environment,
    applicationIdConfigured,
    certificateConfigured,
    privateKeyConfigured,
    tokenEncryptionConfigured,
    canCreateConnectSession: applicationIdConfigured,
    canCallApi: certificateConfigured && privateKeyConfigured && tokenEncryptionConfigured,
  };
}

export function createTellerConnectSession(
  config: TellerConfig = getTellerConfig(),
): ConnectSession {
  const readiness = getTellerReadiness(config);

  if (!readiness.canCreateConnectSession || !config.applicationId) {
    return {
      provider: "teller",
      status: "unavailable",
      message: "Set TELLER_APPLICATION_ID before connecting Teller accounts.",
    };
  }

  return {
    provider: "teller",
    status: "ready",
    message: "Teller Connect is ready.",
    connect: {
      kind: "teller",
      applicationId: config.applicationId,
      environment: config.environment,
      products: config.products,
      nonce: randomUUID(),
    },
  };
}

function parseEnvironment(value: string | undefined): TellerEnvironment {
  if (value && tellerEnvironments.has(value as TellerEnvironment)) {
    return value as TellerEnvironment;
  }

  return "sandbox";
}

function parseProducts(value: string | undefined): string[] {
  const products = (value ?? "transactions,balance")
    .split(",")
    .map((product) => product.trim().toLowerCase())
    .filter((product) => tellerDataProducts.has(product))
    .filter(Boolean);

  return products.length > 0 ? products : ["transactions", "balance"];
}

function normalizePem(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.replace(/\\n/g, "\n");
}
