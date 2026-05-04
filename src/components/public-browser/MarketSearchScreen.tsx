import { createEffect, createMemo, createSignal, Show } from "solid-js";

import PublicAssetSections from "~/components/PublicAssetSections";
import {
  filterAssetsForFeed,
  loadCompleteAssetFeed,
  readStoredAssetFeed,
} from "~/lib/asset-feed.ts";
import type { AssetResponse } from "~/lib/asset/types.ts";
import PublicPageLayout from "./PublicPageLayout.tsx";
import PublicState from "./PublicState.tsx";

type ScreenStatus = "idle" | "loading" | "ready" | "error";
const MIN_SEARCH_LENGTH = 2;

interface MarketSearchScreenProps {
  query?: string;
}

function normalizeSearchQuery(value?: string): string {
  return value?.trim() ?? "";
}

export default function MarketSearchScreen(props: MarketSearchScreenProps) {
  const [status, setStatus] = createSignal<ScreenStatus>("idle");
  const [error, setError] = createSignal<string | null>(null);
  const [assets, setAssets] = createSignal<AssetResponse[]>([]);
  let requestVersion = 0;

  const query = createMemo(() => normalizeSearchQuery(props.query));
  const hasQuery = createMemo(() => query().length > 0);
  const hasValidQuery = createMemo(() => query().length >= MIN_SEARCH_LENGTH);

  const seedFromCachedAssetFeed = (currentQuery: string): boolean => {
    const cachedFeed = readStoredAssetFeed();

    if (!cachedFeed) {
      return false;
    }

    setAssets(
      filterAssetsForFeed(cachedFeed.assets, {
        kind: "search",
        query: currentQuery,
      }),
    );
    setStatus("ready");
    setError(null);
    return true;
  };

  const loadSearch = async () => {
    const currentQuery = query();

    if (currentQuery.length === 0 || currentQuery.length < MIN_SEARCH_LENGTH) {
      setStatus("idle");
      setError(null);
      setAssets([]);
      return;
    }

    const version = ++requestVersion;
    const seededFromCache = seedFromCachedAssetFeed(currentQuery);

    if (!seededFromCache) {
      setStatus("loading");
      setAssets([]);
    }

    setError(null);

    try {
      const response = await loadCompleteAssetFeed(feed => {
        if (version !== requestVersion) {
          return;
        }

        setAssets(
          filterAssetsForFeed(feed.assets, {
            kind: "search",
            query: currentQuery,
          }),
        );
        setStatus("ready");
      });

      if (version !== requestVersion) {
        return;
      }

      setAssets(
        filterAssetsForFeed(response.assets, {
          kind: "search",
          query: currentQuery,
        }),
      );
      setStatus("ready");
    } catch (caughtError) {
      if (version !== requestVersion) {
        return;
      }

      if (seededFromCache) {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to refresh assets.");
        return;
      }

      setAssets([]);
      setError(caughtError instanceof Error ? caughtError.message : "Unable to search assets.");
      setStatus("error");
    }
  };

  createEffect(() => {
    query();
    void loadSearch();
  });

  return (
    <PublicPageLayout
      title={hasQuery() ? `Search: ${query()}` : "Search"}
      kicker="Public search"
      heading={hasQuery() ? `Search results for "${query()}"` : "Search assets"}
      summary={
        hasQuery()
          ? "Browse assets using the same cached feed and card layout as the home page."
          : "Search by asset name, symbol, slug, summary, category, or tag."
      }
    >
      <Show
        when={status() !== "error"}
        fallback={
          <PublicState
            title="Unable to search assets"
            copy={error() ?? "Please try again."}
            actionLabel="Retry"
            onAction={() => {
              void loadSearch();
            }}
          />
        }
      >
        <Show
          when={status() === "ready" && assets().length > 0}
          fallback={
            <PublicState
              title={
                !hasQuery()
                  ? "Search assets"
                  : !hasValidQuery()
                    ? "Keep typing"
                    : status() === "loading"
                      ? "Searching assets"
                      : "No assets found"
              }
              copy={
                !hasQuery()
                  ? "Enter at least 2 characters in the search bar above to find assets."
                  : !hasValidQuery()
                    ? "Search terms must be at least 2 characters long."
                    : status() === "loading"
                      ? `Looking for assets matching "${query()}".`
                      : `No assets matched "${query()}".`
              }
            />
          }
        >
          <PublicAssetSections assets={assets()} title="Search matches" />
        </Show>
      </Show>
    </PublicPageLayout>
  );
}
