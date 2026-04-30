import {
  encodePathSegment,
  normalizeApiBaseUrl,
  readApiBaseUrlFromEnv,
  requestJson,
  withBearerToken,
} from "../api.ts";
import type {
  AdminBatchUpsertComplianceInvestorsRequest,
  AdminComplianceAssetRulesUpsertResponse,
  AdminComplianceInvestorBatchUpsertResponse,
  AdminComplianceInvestorUpsertResponse,
  AdminComplianceJurisdictionRestrictionUpsertResponse,
  AdminSetComplianceAssetRulesRequest,
  AdminSetComplianceJurisdictionRestrictionRequest,
  AdminUpsertComplianceInvestorRequest,
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
  upsertInvestor(
    token: string,
    walletAddress: string,
    request: AdminUpsertComplianceInvestorRequest,
  ): Promise<AdminComplianceInvestorUpsertResponse>;
  batchUpsertInvestors(
    token: string,
    request: AdminBatchUpsertComplianceInvestorsRequest,
  ): Promise<AdminComplianceInvestorBatchUpsertResponse>;
  fetchAssetRules(assetAddress: string): Promise<ComplianceAssetRulesResponse>;
  setAssetRules(
    token: string,
    assetAddress: string,
    request: AdminSetComplianceAssetRulesRequest,
  ): Promise<AdminComplianceAssetRulesUpsertResponse>;
  fetchJurisdictionRestriction(
    assetAddress: string,
    jurisdiction: string,
  ): Promise<ComplianceJurisdictionRestrictionResponse>;
  setJurisdictionRestriction(
    token: string,
    assetAddress: string,
    jurisdiction: string,
    request: AdminSetComplianceJurisdictionRestrictionRequest,
  ): Promise<AdminComplianceJurisdictionRestrictionUpsertResponse>;
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

    upsertInvestor(token, walletAddress, request) {
      return requestJson<AdminComplianceInvestorUpsertResponse>(
        baseUrl,
        `/admin/compliance/investors/${encodePathSegment(walletAddress)}`,
        {
          method: "PUT",
          headers: withBearerToken(token),
          json: request,
        },
      );
    },

    batchUpsertInvestors(token, request) {
      return requestJson<AdminComplianceInvestorBatchUpsertResponse>(
        baseUrl,
        "/admin/compliance/investors/batch",
        {
          method: "POST",
          headers: withBearerToken(token),
          json: request,
        },
      );
    },

    fetchAssetRules(assetAddress) {
      return requestJson<ComplianceAssetRulesResponse>(
        baseUrl,
        `/compliance/assets/${encodePathSegment(assetAddress)}/rules`,
      );
    },

    setAssetRules(token, assetAddress, request) {
      return requestJson<AdminComplianceAssetRulesUpsertResponse>(
        baseUrl,
        `/admin/compliance/assets/${encodePathSegment(assetAddress)}/rules`,
        {
          method: "PUT",
          headers: withBearerToken(token),
          json: request,
        },
      );
    },

    fetchJurisdictionRestriction(assetAddress, jurisdiction) {
      return requestJson<ComplianceJurisdictionRestrictionResponse>(
        baseUrl,
        `/compliance/assets/${encodePathSegment(assetAddress)}/jurisdictions/${encodePathSegment(jurisdiction)}`,
      );
    },

    setJurisdictionRestriction(token, assetAddress, jurisdiction, request) {
      return requestJson<AdminComplianceJurisdictionRestrictionUpsertResponse>(
        baseUrl,
        `/admin/compliance/assets/${encodePathSegment(assetAddress)}/jurisdictions/${encodePathSegment(jurisdiction)}`,
        {
          method: "PUT",
          headers: withBearerToken(token),
          json: request,
        },
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
