import {
  encodePathSegment,
  normalizeApiBaseUrl,
  readApiBaseUrlFromEnv,
  requestJson,
} from "../api.ts";
import type {
  ComplianceAssetRulesResponse,
  ComplianceCheckRedeemRequest,
  ComplianceCheckResponse,
  ComplianceCheckSubscribeRequest,
  ComplianceCheckTransferRequest,
  ComplianceClientOptions,
  ComplianceInvestorResponse,
  ComplianceJurisdictionRestrictionResponse,
} from "./types.ts";

export interface ComplianceClient {
  fetchInvestor(walletAddress: string): Promise<ComplianceInvestorResponse>;
  fetchAssetRules(assetAddress: string): Promise<ComplianceAssetRulesResponse>;
  fetchJurisdictionRestriction(
    assetAddress: string,
    jurisdiction: string,
  ): Promise<ComplianceJurisdictionRestrictionResponse>;
  checkSubscribe(request: ComplianceCheckSubscribeRequest): Promise<ComplianceCheckResponse>;
  checkTransfer(request: ComplianceCheckTransferRequest): Promise<ComplianceCheckResponse>;
  checkRedeem(request: ComplianceCheckRedeemRequest): Promise<ComplianceCheckResponse>;
}

export function createComplianceClient(
  options: ComplianceClientOptions = {},
): ComplianceClient {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl);

  return {
    fetchInvestor(walletAddress) {
      return requestJson<ComplianceInvestorResponse>(
        baseUrl,
        `/compliance/investors/${encodePathSegment(walletAddress)}`,
      );
    },

    fetchAssetRules(assetAddress) {
      return requestJson<ComplianceAssetRulesResponse>(
        baseUrl,
        `/compliance/assets/${encodePathSegment(assetAddress)}/rules`,
      );
    },

    fetchJurisdictionRestriction(assetAddress, jurisdiction) {
      return requestJson<ComplianceJurisdictionRestrictionResponse>(
        baseUrl,
        `/compliance/assets/${encodePathSegment(assetAddress)}/jurisdictions/${encodePathSegment(jurisdiction)}`,
      );
    },

    checkSubscribe(request) {
      return requestJson<ComplianceCheckResponse>(baseUrl, "/compliance/check/subscribe", {
        method: "POST",
        json: request,
      });
    },

    checkTransfer(request) {
      return requestJson<ComplianceCheckResponse>(baseUrl, "/compliance/check/transfer", {
        method: "POST",
        json: request,
      });
    },

    checkRedeem(request) {
      return requestJson<ComplianceCheckResponse>(baseUrl, "/compliance/check/redeem", {
        method: "POST",
        json: request,
      });
    },
  };
}

export const complianceClient = createComplianceClient({
  baseUrl: readApiBaseUrlFromEnv(),
});

export { ApiError } from "../api.ts";
