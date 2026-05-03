import {
  encodePathSegment,
  normalizeApiBaseUrl,
  readApiBaseUrlFromEnv,
  requestJson,
} from "../api.ts";
import type {
  TreasuryAssetResponse,
  TreasuryClientOptions,
  TreasuryStatusResponse,
} from "./types.ts";

export interface TreasuryClient {
  fetchTreasuryStatus(): Promise<TreasuryStatusResponse>;
  fetchTreasuryAsset(assetAddress: string): Promise<TreasuryAssetResponse>;
}

export function createTreasuryClient(options: TreasuryClientOptions = {}): TreasuryClient {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl);

  return {
    fetchTreasuryStatus() {
      return requestJson<TreasuryStatusResponse>(baseUrl, "/treasury");
    },

    fetchTreasuryAsset(assetAddress) {
      return requestJson<TreasuryAssetResponse>(
        baseUrl,
        `/treasury/assets/${encodePathSegment(assetAddress)}`,
      );
    },
  };
}

export const treasuryClient = createTreasuryClient({
  baseUrl: readApiBaseUrlFromEnv(),
});

export { ApiError } from "../api.ts";
