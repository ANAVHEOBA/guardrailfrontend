import {
  assetRequestClient,
  type AssetRequestListResponse,
  type AssetRequestResponse,
} from "~/lib/asset-request/index.ts";
import { assetClient, type AssetTypeListResponse } from "~/lib/asset/index.ts";
import { orderClient, type MyPortfolioResponse } from "~/lib/order/index.ts";
import { readStoredAuthSession } from "~/lib/auth/session.ts";

const PORTFOLIO_PAGE_STORAGE_KEY_PREFIX = "guardrail-portfolio-page/v1";
const ASSET_TYPES_STORAGE_KEY = "guardrail-asset-types/v1";
const DEFAULT_REQUEST_LIMIT = 20;

export interface PortfolioPageBundle {
  portfolio: MyPortfolioResponse;
  assetRequests: AssetRequestListResponse;
  assetTypes: AssetTypeListResponse;
}

interface PrimePortfolioPageBundleOptions {
  requestLimit?: number;
}

let cachedAssetTypes: AssetTypeListResponse | null = null;
let inflightAssetTypesRequest: Promise<AssetTypeListResponse> | null = null;

const portfolioPageCache = new Map<string, PortfolioPageBundle>();
const inflightPortfolioPageRequests = new Map<string, Promise<PortfolioPageBundle>>();
const assetRequestDetailCache = new Map<string, AssetRequestResponse>();
const inflightAssetRequestDetailRequests = new Map<string, Promise<AssetRequestResponse>>();

function buildPortfolioPageCacheKey(userId: string): string {
  return userId.trim().toLowerCase();
}

function buildPortfolioPageStorageKey(userId: string): string {
  return `${PORTFOLIO_PAGE_STORAGE_KEY_PREFIX}:${buildPortfolioPageCacheKey(userId)}`;
}

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isAssetRequestListResponse(value: unknown): value is AssetRequestListResponse {
  if (!isObject(value)) {
    return false;
  }

  return (
    Array.isArray(value.asset_requests) &&
    typeof value.limit === "number" &&
    typeof value.offset === "number"
  );
}

function isAssetTypeListResponse(value: unknown): value is AssetTypeListResponse {
  return isObject(value) && Array.isArray(value.asset_types);
}

function isPortfolioResponse(value: unknown): value is MyPortfolioResponse {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.wallet_address === "string" &&
    typeof value.account_kind === "string" &&
    isObject(value.summary) &&
    Array.isArray(value.markets) &&
    Array.isArray(value.history)
  );
}

function isPortfolioPageBundle(value: unknown): value is PortfolioPageBundle {
  if (!isObject(value)) {
    return false;
  }

  return (
    isPortfolioResponse(value.portfolio) &&
    isAssetRequestListResponse(value.assetRequests) &&
    isAssetTypeListResponse(value.assetTypes)
  );
}

function readStoredJson<T>(key: string): T | null {
  if (!canUseSessionStorage()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(key);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStoredJson(key: string, value: unknown) {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write failures and keep the in-memory cache.
  }
}

function writeCachedAssetRequestDetail(request: AssetRequestResponse) {
  assetRequestDetailCache.set(request.id, request);
}

function writeCachedPortfolioPageBundle(userId: string, bundle: PortfolioPageBundle) {
  const cacheKey = buildPortfolioPageCacheKey(userId);
  portfolioPageCache.set(cacheKey, bundle);
  writeStoredJson(buildPortfolioPageStorageKey(userId), bundle);

  for (const request of bundle.assetRequests.asset_requests) {
    writeCachedAssetRequestDetail(request);
  }
}

function readStoredAssetTypes(): AssetTypeListResponse | null {
  const parsed = readStoredJson<unknown>(ASSET_TYPES_STORAGE_KEY);
  return isAssetTypeListResponse(parsed) ? parsed : null;
}

function writeStoredAssetTypes(response: AssetTypeListResponse) {
  cachedAssetTypes = response;
  writeStoredJson(ASSET_TYPES_STORAGE_KEY, response);
}

async function primeAssetTypes(): Promise<AssetTypeListResponse> {
  if (cachedAssetTypes) {
    return cachedAssetTypes;
  }

  const storedAssetTypes = readStoredAssetTypes();

  if (storedAssetTypes) {
    cachedAssetTypes = storedAssetTypes;
    return storedAssetTypes;
  }

  if (inflightAssetTypesRequest) {
    return inflightAssetTypesRequest;
  }

  inflightAssetTypesRequest = assetClient
    .listAssetTypes()
    .then(response => {
      writeStoredAssetTypes(response);
      return response;
    })
    .finally(() => {
      inflightAssetTypesRequest = null;
    });

  return inflightAssetTypesRequest;
}

export function readCachedPortfolioPageBundle(userId: string): PortfolioPageBundle | null {
  const cacheKey = buildPortfolioPageCacheKey(userId);
  const cachedBundle = portfolioPageCache.get(cacheKey);

  if (cachedBundle) {
    return cachedBundle;
  }

  const storedBundle = readStoredJson<unknown>(buildPortfolioPageStorageKey(userId));

  if (!isPortfolioPageBundle(storedBundle)) {
    return null;
  }

  writeCachedPortfolioPageBundle(userId, storedBundle);
  return storedBundle;
}

export async function primePortfolioPageBundle(
  token: string,
  userId: string,
  options: PrimePortfolioPageBundleOptions = {},
): Promise<PortfolioPageBundle> {
  const normalizedToken = token.trim();
  const cacheKey = buildPortfolioPageCacheKey(userId);
  const requestLimit = options.requestLimit ?? DEFAULT_REQUEST_LIMIT;

  if (!normalizedToken || !cacheKey) {
    throw new Error("Authenticated portfolio data requires both token and user id.");
  }

  const cachedRequest = inflightPortfolioPageRequests.get(cacheKey);

  if (cachedRequest) {
    return cachedRequest;
  }

  const request = Promise.all([
    orderClient.fetchMyPortfolio(normalizedToken),
    assetRequestClient.listMyAssetRequests(normalizedToken, {
      limit: requestLimit,
      offset: 0,
    }),
    primeAssetTypes(),
  ])
    .then(([portfolio, assetRequests, assetTypes]) => {
      const bundle: PortfolioPageBundle = {
        portfolio,
        assetRequests,
        assetTypes,
      };

      writeCachedPortfolioPageBundle(userId, bundle);
      return bundle;
    })
    .finally(() => {
      inflightPortfolioPageRequests.delete(cacheKey);
    });

  inflightPortfolioPageRequests.set(cacheKey, request);
  return request;
}

export function primeStoredPortfolioPageBundle(
  options: PrimePortfolioPageBundleOptions = {},
): Promise<PortfolioPageBundle> | undefined {
  const session = readStoredAuthSession();
  const token = session?.token?.trim() ?? "";
  const userId = session?.user?.id?.trim() ?? "";

  if (!token || !userId) {
    return undefined;
  }

  return primePortfolioPageBundle(token, userId, options);
}

export function readCachedAssetRequestDetail(requestId: string): AssetRequestResponse | null {
  return assetRequestDetailCache.get(requestId) ?? null;
}

export async function primeAssetRequestDetail(
  token: string,
  requestId: string,
): Promise<AssetRequestResponse> {
  const normalizedToken = token.trim();
  const normalizedRequestId = requestId.trim();

  if (!normalizedToken || !normalizedRequestId) {
    throw new Error("Asset request detail requires both token and request id.");
  }

  const cachedDetail = readCachedAssetRequestDetail(normalizedRequestId);

  if (cachedDetail) {
    return cachedDetail;
  }

  const cachedRequest = inflightAssetRequestDetailRequests.get(normalizedRequestId);

  if (cachedRequest) {
    return cachedRequest;
  }

  const request = assetRequestClient
    .fetchAssetRequest(normalizedToken, normalizedRequestId)
    .then(response => {
      writeCachedAssetRequestDetail(response);
      return response;
    })
    .finally(() => {
      inflightAssetRequestDetailRequests.delete(normalizedRequestId);
    });

  inflightAssetRequestDetailRequests.set(normalizedRequestId, request);
  return request;
}

export function cacheAssetRequestDetail(request: AssetRequestResponse) {
  writeCachedAssetRequestDetail(request);
}
