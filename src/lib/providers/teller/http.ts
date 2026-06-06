import https from "node:https";
import { URL } from "node:url";
import { ProviderUnavailableError } from "@/lib/providers/provider-errors";
import { getTellerConfig, type TellerConfig } from "@/lib/providers/teller/config";
import type { TellerAccount, TellerBalance, TellerTransaction } from "@/lib/providers/teller/types";

export interface TellerHttpClient {
  listAccounts(accessToken: string): Promise<TellerAccount[]>;
  getBalance(accessToken: string, accountId: string): Promise<TellerBalance>;
  listTransactions(accessToken: string, accountId: string): Promise<TellerTransaction[]>;
}

export class NodeTellerHttpClient implements TellerHttpClient {
  private config: TellerConfig;

  constructor(config = getTellerConfig()) {
    this.config = config;
  }

  listAccounts(accessToken: string): Promise<TellerAccount[]> {
    return this.request(accessToken, "/accounts");
  }

  getBalance(accessToken: string, accountId: string): Promise<TellerBalance> {
    return this.request(accessToken, `/accounts/${encodeURIComponent(accountId)}/balances`);
  }

  listTransactions(accessToken: string, accountId: string): Promise<TellerTransaction[]> {
    return this.request(accessToken, `/accounts/${encodeURIComponent(accountId)}/transactions`);
  }

  private request<T>(accessToken: string, path: string): Promise<T> {
    if (!this.config.certificatePem || !this.config.privateKeyPem) {
      throw new ProviderUnavailableError(
        "teller",
        "Set TELLER_CERTIFICATE_PEM and TELLER_PRIVATE_KEY_PEM before calling Teller APIs.",
      );
    }

    const url = new URL(path, this.config.apiBaseUrl);
    const agent = new https.Agent({
      cert: this.config.certificatePem,
      key: this.config.privateKeyPem,
    });

    return new Promise((resolve, reject) => {
      const request = https.request(
        url,
        {
          agent,
          headers: {
            authorization: `Basic ${Buffer.from(`${accessToken}:`).toString("base64")}`,
            "content-type": "application/json",
          },
          method: "GET",
        },
        (response) => {
          const chunks: Buffer[] = [];

          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");

            if (!response.statusCode || response.statusCode >= 400) {
              reject(new Error(`Teller API error ${response.statusCode ?? "unknown"}.`));
              return;
            }

            try {
              resolve(JSON.parse(body) as T);
            } catch (error) {
              reject(error);
            }
          });
        },
      );

      request.on("error", reject);
      request.end();
    });
  }
}
