import {
  encodePathSegment,
  normalizeApiBaseUrl,
  readApiBaseUrlFromEnv,
  requestJson,
  withBearerToken,
} from "../api.ts";
import type {
  AssetCheckTransferRequest,
  AssetClientOptions,
  AssetDetailQuery,
  AssetDetailResponse,
  AssetFactoryStatusResponse,
  AssetHistoryQuery,
  AssetHistoryResponse,
  AssetHolderStateResponse,
  AssetListResponse,
  AssetPaymentTokenQuoteResponse,
  AssetPreviewRequest,
  AssetPreviewResponse,
  AssetResponse,
  AssetSupportedCurrenciesResponse,
  AssetTransferCheckResponse,
  AssetTypeListResponse,
  AssetTypeResponse,
  AssetQuoteQuery,
  GaslessApprovePaymentTokenRequest,
  GaslessAssetActionResponse,
  GaslessCancelRedemptionRequest,
  GaslessClaimYieldRequest,
  GaslessPurchaseAssetRequest,
  GaslessRedeemAssetRequest,
  ListAssetsQuery,
} from "./types.ts";

export interface AssetClient {
  fetchPaymentTokenQuote(query?: AssetQuoteQuery): Promise<AssetPaymentTokenQuoteResponse>;
  fetchNgnPaymentTokenQuote(query?: AssetQuoteQuery): Promise<AssetPaymentTokenQuoteResponse>;
  fetchSupportedCurrencies(): Promise<AssetSupportedCurrenciesResponse>;
  fetchFactoryStatus(): Promise<AssetFactoryStatusResponse>;
  listAssetTypes(): Promise<AssetTypeListResponse>;
  fetchAssetType(assetTypeId: string): Promise<AssetTypeResponse>;
  listAssets(query?: ListAssetsQuery): Promise<AssetListResponse>;
  listAssetsByType(assetTypeId: string): Promise<AssetListResponse>;
  fetchAssetHistoryByProposal(
    proposalId: string,
    query?: AssetHistoryQuery,
  ): Promise<AssetHistoryResponse>;
  fetchAssetDetailByProposal(
    proposalId: string,
    query?: AssetDetailQuery,
  ): Promise<AssetDetailResponse>;
  fetchAssetByProposal(proposalId: string): Promise<AssetResponse>;
  fetchAssetHistoryBySlug(slug: string, query?: AssetHistoryQuery): Promise<AssetHistoryResponse>;
  fetchAssetDetailBySlug(slug: string, query?: AssetDetailQuery): Promise<AssetDetailResponse>;
  fetchAssetBySlug(slug: string): Promise<AssetResponse>;
  fetchAssetHistory(
    assetAddress: string,
    query?: AssetHistoryQuery,
  ): Promise<AssetHistoryResponse>;
  fetchAssetDetail(
    assetAddress: string,
    query?: AssetDetailQuery,
  ): Promise<AssetDetailResponse>;
  fetchAsset(assetAddress: string): Promise<AssetResponse>;
  fetchAssetHolderState(
    assetAddress: string,
    walletAddress: string,
  ): Promise<AssetHolderStateResponse>;
  previewPurchase(assetAddress: string, request: AssetPreviewRequest): Promise<AssetPreviewResponse>;
  previewRedemption(
    assetAddress: string,
    request: AssetPreviewRequest,
  ): Promise<AssetPreviewResponse>;
  checkTransfer(
    assetAddress: string,
    request: AssetCheckTransferRequest,
  ): Promise<AssetTransferCheckResponse>;
  approvePaymentToken(
    token: string,
    assetAddress: string,
    request: GaslessApprovePaymentTokenRequest,
  ): Promise<GaslessAssetActionResponse>;
  purchaseAsset(
    token: string,
    assetAddress: string,
    request: GaslessPurchaseAssetRequest,
  ): Promise<GaslessAssetActionResponse>;
  claimYield(
    token: string,
    assetAddress: string,
    request: GaslessClaimYieldRequest,
  ): Promise<GaslessAssetActionResponse>;
  redeemAsset(
    token: string,
    assetAddress: string,
    request: GaslessRedeemAssetRequest,
  ): Promise<GaslessAssetActionResponse>;
  cancelRedemption(
    token: string,
    assetAddress: string,
    request: GaslessCancelRedemptionRequest,
  ): Promise<GaslessAssetActionResponse>;
}

function assetPath(assetAddress: string): string {
  return `/assets/${encodePathSegment(assetAddress)}`;
}

export function createAssetClient(options: AssetClientOptions = {}): AssetClient {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl);

  return {
    fetchPaymentTokenQuote(query) {
      return requestJson<AssetPaymentTokenQuoteResponse>(baseUrl, "/market/quotes/payment-token", {
        query,
      });
    },

    fetchNgnPaymentTokenQuote(query) {
      return requestJson<AssetPaymentTokenQuoteResponse>(
        baseUrl,
        "/market/quotes/ngn-payment-token",
        { query },
      );
    },

    fetchSupportedCurrencies() {
      return requestJson<AssetSupportedCurrenciesResponse>(
        baseUrl,
        "/market/supported-currencies",
      );
    },

    fetchFactoryStatus() {
      return requestJson<AssetFactoryStatusResponse>(baseUrl, "/assets/factory");
    },

    listAssetTypes() {
      return requestJson<AssetTypeListResponse>(baseUrl, "/assets/types");
    },

    fetchAssetType(assetTypeId) {
      return requestJson<AssetTypeResponse>(
        baseUrl,
        `/assets/types/${encodePathSegment(assetTypeId)}`,
      );
    },

    listAssets(query) {
      return requestJson<AssetListResponse>(baseUrl, "/assets", {
        query,
      });
    },

    listAssetsByType(assetTypeId) {
      return requestJson<AssetListResponse>(
        baseUrl,
        `/assets/by-type/${encodePathSegment(assetTypeId)}`,
      );
    },

    fetchAssetHistoryByProposal(proposalId, query) {
      return requestJson<AssetHistoryResponse>(
        baseUrl,
        `/assets/proposals/${encodePathSegment(proposalId)}/history`,
        { query },
      );
    },

    fetchAssetDetailByProposal(proposalId, query) {
      return requestJson<AssetDetailResponse>(
        baseUrl,
        `/assets/proposals/${encodePathSegment(proposalId)}/detail`,
        { query },
      );
    },

    fetchAssetByProposal(proposalId) {
      return requestJson<AssetResponse>(
        baseUrl,
        `/assets/proposals/${encodePathSegment(proposalId)}`,
      );
    },

    fetchAssetHistoryBySlug(slug, query) {
      return requestJson<AssetHistoryResponse>(
        baseUrl,
        `/assets/slug/${encodePathSegment(slug)}/history`,
        { query },
      );
    },

    fetchAssetDetailBySlug(slug, query) {
      return requestJson<AssetDetailResponse>(
        baseUrl,
        `/assets/slug/${encodePathSegment(slug)}/detail`,
        { query },
      );
    },

    fetchAssetBySlug(slug) {
      return requestJson<AssetResponse>(baseUrl, `/assets/slug/${encodePathSegment(slug)}`);
    },

    fetchAssetHistory(assetAddress, query) {
      return requestJson<AssetHistoryResponse>(baseUrl, `${assetPath(assetAddress)}/history`, {
        query,
      });
    },

    fetchAssetDetail(assetAddress, query) {
      return requestJson<AssetDetailResponse>(baseUrl, `${assetPath(assetAddress)}/detail`, {
        query,
      });
    },

    fetchAsset(assetAddress) {
      return requestJson<AssetResponse>(baseUrl, assetPath(assetAddress));
    },

    fetchAssetHolderState(assetAddress, walletAddress) {
      return requestJson<AssetHolderStateResponse>(
        baseUrl,
        `${assetPath(assetAddress)}/holders/${encodePathSegment(walletAddress)}`,
      );
    },

    previewPurchase(assetAddress, request) {
      return requestJson<AssetPreviewResponse>(
        baseUrl,
        `${assetPath(assetAddress)}/preview/purchase`,
        {
          method: "POST",
          json: request,
        },
      );
    },

    previewRedemption(assetAddress, request) {
      return requestJson<AssetPreviewResponse>(
        baseUrl,
        `${assetPath(assetAddress)}/preview/redemption`,
        {
          method: "POST",
          json: request,
        },
      );
    },

    checkTransfer(assetAddress, request) {
      return requestJson<AssetTransferCheckResponse>(
        baseUrl,
        `${assetPath(assetAddress)}/check/transfer`,
        {
          method: "POST",
          json: request,
        },
      );
    },

    approvePaymentToken(token, assetAddress, request) {
      return requestJson<GaslessAssetActionResponse>(
        baseUrl,
        `${assetPath(assetAddress)}/payment-token/approve`,
        {
          method: "POST",
          headers: withBearerToken(token),
          json: request,
        },
      );
    },

    purchaseAsset(token, assetAddress, request) {
      return requestJson<GaslessAssetActionResponse>(baseUrl, `${assetPath(assetAddress)}/purchase`, {
        method: "POST",
        headers: withBearerToken(token),
        json: request,
      });
    },

    claimYield(token, assetAddress, request) {
      return requestJson<GaslessAssetActionResponse>(baseUrl, `${assetPath(assetAddress)}/yield/claim`, {
        method: "POST",
        headers: withBearerToken(token),
        json: request,
      });
    },

    redeemAsset(token, assetAddress, request) {
      return requestJson<GaslessAssetActionResponse>(baseUrl, `${assetPath(assetAddress)}/redeem`, {
        method: "POST",
        headers: withBearerToken(token),
        json: request,
      });
    },

    cancelRedemption(token, assetAddress, request) {
      return requestJson<GaslessAssetActionResponse>(
        baseUrl,
        `${assetPath(assetAddress)}/redemptions/cancel`,
        {
          method: "POST",
          headers: withBearerToken(token),
          json: request,
        },
      );
    },
  };
}

export const assetClient = createAssetClient({
  baseUrl: readApiBaseUrlFromEnv(),
});

export { ApiError } from "../api.ts";
