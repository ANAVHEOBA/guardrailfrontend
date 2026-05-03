import { normalizeApiBaseUrl, requestJson, withBearerToken } from "../api.ts";
import { readStoredAuthSession } from "../auth/session.ts";
import type {
  FaucetClientOptions,
  FaucetUsdcLegacyRequest,
  FaucetUsdcBalanceResponse,
  FaucetUsdcRequest,
  FaucetUsdcResponse,
} from "./types.ts";

function readViteEnv(key: "VITE_API_BASE_URL"): string | undefined {
  return import.meta.env?.[key];
}

export interface FaucetClient {
  requestUsdc(request: FaucetUsdcRequest): Promise<FaucetUsdcResponse>;
  fetchUsdcBalance(address: string): Promise<FaucetUsdcBalanceResponse>;
}

function resolveFaucetAuthToken(request: FaucetUsdcRequest): string {
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
  baseUrl: readViteEnv("VITE_API_BASE_URL"),
});

export { ApiError } from "../api.ts";
