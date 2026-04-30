import {
  normalizeApiBaseUrl,
  readApiBaseUrlFromEnv,
  requestJson,
  withBearerToken,
} from "../api.ts";
import type {
  AuthClientOptions,
  AuthResponse,
  GoogleSignInRequest,
  MeResponse,
  WalletChallengeRequest,
  WalletChallengeResponse,
  WalletConnectRequest,
} from "./types.ts";

export interface AuthClient {
  signInWithGoogle(request: GoogleSignInRequest): Promise<AuthResponse>;
  createWalletChallenge(request: WalletChallengeRequest): Promise<WalletChallengeResponse>;
  connectWallet(request: WalletConnectRequest): Promise<AuthResponse>;
  fetchMe(token: string): Promise<MeResponse>;
}

export function createAuthClient(options: AuthClientOptions = {}): AuthClient {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl);

  return {
    signInWithGoogle(request) {
      return requestJson<AuthResponse>(baseUrl, "/auth/google/sign-in", {
        method: "POST",
        json: request,
      });
    },

    createWalletChallenge(request) {
      return requestJson<WalletChallengeResponse>(baseUrl, "/auth/wallet/challenge", {
        method: "POST",
        json: request,
      });
    },

    connectWallet(request) {
      return requestJson<AuthResponse>(baseUrl, "/auth/wallet/connect", {
        method: "POST",
        json: request,
      });
    },

    fetchMe(token) {
      return requestJson<MeResponse>(baseUrl, "/auth/me", {
        headers: withBearerToken(token),
      });
    },
  };
}

export const authClient = createAuthClient({
  baseUrl: readApiBaseUrlFromEnv(),
});

export { ApiError } from "../api.ts";
