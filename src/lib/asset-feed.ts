import { assetClient } from "./asset/index.ts";
import type { AssetResponse } from "./asset/types.ts";

const ASSET_FEED_STORAGE_KEY = "guardrail-asset-feed/v2";
const LEGACY_ASSET_FEED_STORAGE_KEY = "guardrail-asset-feed/v1";
const ASSET_FEED_PAGE_SIZE = 100;

export interface AssetFeedState {
  assets: AssetResponse[];
  nextOffset: number;
  hasMore: boolean;
}

export interface AssetFeedFilter {
  kind: "featured" | "breaking" | "new" | "category" | "tag" | "search";
  categorySlug?: string;
  tagSlug?: string;
  query?: string;
}

let cachedAssetFeed: AssetFeedState | null = null;
let inflightAssetFeedRequest: Promise<AssetFeedState> | null = null;

function normalizeLookupValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isAssetFeedState(value: unknown): value is AssetFeedState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AssetFeedState>;

  return (
    Array.isArray(candidate.assets) &&
    typeof candidate.nextOffset === "number" &&
    typeof candidate.hasMore === "boolean"
  );
}

function readStoredJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
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

function writeStoredAssetFeed(feed: AssetFeedState) {
  cachedAssetFeed = feed;

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(ASSET_FEED_STORAGE_KEY, JSON.stringify(feed));
  } catch {
    // Ignore storage write failures and keep the in-memory cache.
  }
}

function fetchAssetFeedPage(offset: number): Promise<AssetFeedState> {
  return assetClient
    .listAssets({
      limit: ASSET_FEED_PAGE_SIZE,
      offset,
    })
    .then(response => ({
      assets: response.assets,
      nextOffset: offset + response.assets.length,
      hasMore: response.assets.length === ASSET_FEED_PAGE_SIZE,
    }));
}

function mergeAssetFeedPages(
  currentFeed: AssetFeedState,
  nextPage: AssetFeedState,
): AssetFeedState {
  const seenAssetAddresses = new Set(currentFeed.assets.map(asset => asset.asset_address));
  const mergedAssets = [...currentFeed.assets];

  for (const asset of nextPage.assets) {
    if (seenAssetAddresses.has(asset.asset_address)) {
      continue;
    }

    seenAssetAddresses.add(asset.asset_address);
    mergedAssets.push(asset);
  }

  return {
    assets: mergedAssets,
    nextOffset: nextPage.nextOffset,
    hasMore: nextPage.hasMore,
  };
}

export function readStoredAssetFeed(): AssetFeedState | null {
  if (cachedAssetFeed) {
    return cachedAssetFeed;
  }

  const current = readStoredJson<unknown>(ASSET_FEED_STORAGE_KEY);

  if (isAssetFeedState(current)) {
    cachedAssetFeed = current;
    return current;
  }

  const legacy = readStoredJson<unknown>(LEGACY_ASSET_FEED_STORAGE_KEY);

  if (isAssetFeedState(legacy)) {
    cachedAssetFeed = legacy;
    return legacy;
  }

  return null;
}

export async function loadCompleteAssetFeed(
  onUpdate?: (feed: AssetFeedState) => void,
): Promise<AssetFeedState> {
  if (inflightAssetFeedRequest) {
    if (onUpdate) {
      void inflightAssetFeedRequest.then(onUpdate).catch(() => undefined);
    }

    return inflightAssetFeedRequest;
  }

  inflightAssetFeedRequest = (async () => {
    let currentFeed = await fetchAssetFeedPage(0);
    writeStoredAssetFeed(currentFeed);
    onUpdate?.(currentFeed);

    while (currentFeed.hasMore) {
      const nextPage = await fetchAssetFeedPage(currentFeed.nextOffset);
      currentFeed = mergeAssetFeedPages(currentFeed, nextPage);
      writeStoredAssetFeed(currentFeed);
      onUpdate?.(currentFeed);
    }

    return currentFeed;
  })().finally(() => {
    inflightAssetFeedRequest = null;
  });

  return inflightAssetFeedRequest;
}

export function resolveAssetCategorySlug(
  asset: Pick<AssetResponse, "market_segment" | "asset_type_name">,
): string {
  return (
    [asset.market_segment, asset.asset_type_name]
      .map(value => value?.trim() ?? "")
      .map(normalizeLookupValue)
      .find(Boolean) ?? "assets"
  );
}

export function readAssetTagSlugs(
  asset: Pick<AssetResponse, "suggested_internal_tags">,
): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const rawTag of asset.suggested_internal_tags) {
    const normalizedTag = normalizeLookupValue(rawTag);

    if (!normalizedTag || seen.has(normalizedTag)) {
      continue;
    }

    seen.add(normalizedTag);
    tags.push(normalizedTag);
  }

  return tags;
}

export function matchesAssetSearchQuery(
  asset: Pick<
    AssetResponse,
    "name" | "symbol" | "slug" | "summary" | "market_segment" | "suggested_internal_tags"
  >,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return false;
  }

  const haystacks = [
    asset.name,
    asset.symbol,
    asset.slug ?? "",
    asset.summary ?? "",
    asset.market_segment ?? "",
    asset.suggested_internal_tags.join(" "),
  ];

  return haystacks.some(value => value.toLowerCase().includes(normalizedQuery));
}

export function filterAssetsForFeed(
  assets: readonly AssetResponse[],
  filter: AssetFeedFilter,
): AssetResponse[] {
  switch (filter.kind) {
    case "featured":
      return assets.filter(asset => asset.featured);
    case "breaking":
      return [];
    case "new":
      return [...assets];
    case "category": {
      const categorySlug = normalizeLookupValue(filter.categorySlug ?? "");

      if (!categorySlug) {
        return [];
      }

      return assets.filter(asset => resolveAssetCategorySlug(asset) === categorySlug);
    }
    case "tag": {
      const tagSlug = normalizeLookupValue(filter.tagSlug ?? "");

      if (!tagSlug) {
        return [];
      }

      return assets.filter(asset => readAssetTagSlugs(asset).includes(tagSlug));
    }
    case "search": {
      const query = filter.query?.trim() ?? "";

      if (!query) {
        return [];
      }

      return assets.filter(asset => matchesAssetSearchQuery(asset, query));
    }
  }
}
