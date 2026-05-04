import {
  normalizeApiBaseUrl,
  readApiBaseUrlFromEnv,
  requestJson,
  withBearerToken,
} from "../api.ts";
import { readStoredAuthSession } from "../auth/session.ts";
import type {
  FaucetClientOptions,
  FaucetUsdcLegacyRequest,
  FaucetUsdcBalanceResponse,
  FaucetUsdcRequest,
  FaucetUsdcResponse,
} from "./types.ts";

export interface FaucetClient {
  requestUsdc(request?: FaucetUsdcRequest): Promise<FaucetUsdcResponse>;
  fetchUsdcBalance(address: string): Promise<FaucetUsdcBalanceResponse>;
}

function resolveFaucetAuthToken(request?: FaucetUsdcRequest): string {
  if (typeof request === "string") {
    return request.trim();
  }

  return readStoredAuthSession()?.token?.trim() ?? "";
}

function isLegacyFaucetRequest(request: FaucetUsdcRequest): request is FaucetUsdcLegacyRequest {
  return typeof request === "object" && request !== null;
}

export function createFaucetClient(options: FaucetClientOptions = {}): FaucetClient {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl);

  return {
    requestUsdc(request) {
      const token = resolveFaucetAuthToken(request);
      const amount =
        typeof request === "object" && request !== null ? request.amount?.trim() : undefined;
      const payload = amount ? { amount } : undefined;

      if (token.length === 0) {
        throw new Error("An authenticated session is required to request faucet USDC.");
      }

      if (isLegacyFaucetRequest(request)) {
        // Keep accepting the older component call shape while speaking the backend contract.
        void request.address;
        void request.amount;
      }

      return requestJson<FaucetUsdcResponse>(baseUrl, "/faucet/usdc", {
        method: "POST",
        headers: withBearerToken(token),
        json: payload,
      });
    },

    fetchUsdcBalance(address) {
      return requestJson<FaucetUsdcBalanceResponse>(baseUrl, "/faucet/usdc/balance", {
        query: {
          address,
        },
      });
    },
  };
}

export const faucetClient = createFaucetClient({
  baseUrl: readApiBaseUrlFromEnv(),
});

export { ApiError } from "../api.ts";
