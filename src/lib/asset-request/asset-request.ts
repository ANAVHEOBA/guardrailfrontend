import {
  encodePathSegment,
  normalizeApiBaseUrl,
  readApiBaseUrlFromEnv,
  requestJson,
  withBearerToken,
} from "../api.ts";
import type {
  AssetRequestClientOptions,
  AssetRequestListResponse,
  AssetRequestResponse,
  CreateAssetRequestRequest,
  ListMyAssetRequestsQuery,
} from "./types.ts";

export interface AssetRequestClient {
  createAssetRequest(
    token: string,
    request: CreateAssetRequestRequest,
  ): Promise<AssetRequestResponse>;
  listMyAssetRequests(
    token: string,
    query?: ListMyAssetRequestsQuery,
  ): Promise<AssetRequestListResponse>;
  fetchAssetRequest(token: string, requestId: string): Promise<AssetRequestResponse>;
}

export function createAssetRequestClient(
  options: AssetRequestClientOptions = {},
): AssetRequestClient {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl);

  return {
    createAssetRequest(token, request) {
      return requestJson<AssetRequestResponse>(baseUrl, "/asset-requests", {
        method: "POST",
        headers: withBearerToken(token),
        json: request,
      });
    },

    listMyAssetRequests(token, query) {
      return requestJson<AssetRequestListResponse>(baseUrl, "/asset-requests/me", {
        headers: withBearerToken(token),
        query,
      });
    },

    fetchAssetRequest(token, requestId) {
      return requestJson<AssetRequestResponse>(
        baseUrl,
        `/asset-requests/${encodePathSegment(requestId)}`,
        {
          headers: withBearerToken(token),
        },
      );
    },
  };
}

export const assetRequestClient = createAssetRequestClient({
  baseUrl: readApiBaseUrlFromEnv(),
});

export { ApiError } from "../api.ts";
