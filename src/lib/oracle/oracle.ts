import {
  encodePathSegment,
  normalizeApiBaseUrl,
  readApiBaseUrlFromEnv,
  requestJson,
} from "../api.ts";
import type {
  OracleClientOptions,
  OracleDocumentResponse,
  OracleTrustedOracleResponse,
  OracleValuationResponse,
} from "./types.ts";

export interface OracleClient {
  fetchTrustedOracle(oracleAddress: string): Promise<OracleTrustedOracleResponse>;
  fetchValuation(assetAddress: string): Promise<OracleValuationResponse>;
  fetchDocument(assetAddress: string, documentType: string): Promise<OracleDocumentResponse>;
}

export function createOracleClient(options: OracleClientOptions = {}): OracleClient {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl);

  return {
    fetchTrustedOracle(oracleAddress) {
      return requestJson<OracleTrustedOracleResponse>(
        baseUrl,
        `/oracle/trusted-oracles/${encodePathSegment(oracleAddress)}`,
      );
    },

    fetchValuation(assetAddress) {
      return requestJson<OracleValuationResponse>(
        baseUrl,
        `/oracle/assets/${encodePathSegment(assetAddress)}/valuation`,
      );
    },

    fetchDocument(assetAddress, documentType) {
      return requestJson<OracleDocumentResponse>(
        baseUrl,
        `/oracle/assets/${encodePathSegment(assetAddress)}/documents/${encodePathSegment(documentType)}`,
      );
    },
  };
}

export const oracleClient = createOracleClient({
  baseUrl: readApiBaseUrlFromEnv(),
});

export { ApiError } from "../api.ts";
