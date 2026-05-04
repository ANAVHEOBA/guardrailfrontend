import { createEffect, createMemo, createSignal, Show } from "solid-js";

import PublicAssetSections from "~/components/PublicAssetSections";
import {
  filterAssetsForFeed,
  loadCompleteAssetFeed,
  readStoredAssetFeed,
} from "~/lib/asset-feed.ts";
import type { AssetResponse } from "~/lib/asset/types.ts";
import type { MarketFeedKind } from "~/lib/market/index.ts";
import PublicPageLayout from "./PublicPageLayout.tsx";
import PublicState from "./PublicState.tsx";

type ScreenStatus = "loading" | "ready" | "error";

interface MarketBrowseScreenProps {
  feed?: string;
  category?: string;
  tag?: string;
  label?: string;
}

interface ResolvedFeedRequest {
  kind: Exclude<MarketFeedKind, "search">;
  label: string;
  title: string;
  heading: string;
  summary: string;
  categorySlug?: string;
  tagSlug?: string;
}

function normalizeOptionalValue(value?: string): string | undefined {
  const normalizedValue = value?.trim();
  return normalizedValue && normalizedValue.length > 0 ? normalizedValue : undefined;
}

function resolveFeedRequest(props: MarketBrowseScreenProps): ResolvedFeedRequest {
  const feed = normalizeOptionalValue(props.feed)?.toLowerCase();
  const label = normalizeOptionalValue(props.label);
  const categorySlug = normalizeOptionalValue(props.category);
  const tagSlug = normalizeOptionalValue(props.tag);

  if (feed === "breaking") {
    return {
      kind: "breaking",
      label: label ?? "Breaking",
      title: "Breaking Assets",
      heading: "Breaking assets",
      summary: "The current backend does not expose a breaking asset feed yet.",
    };
  }

  if (feed === "new") {
    return {
      kind: "new",
      label: label ?? "New",
      title: "New Assets",
      heading: "New assets",
      summary: "The newest visible assets from the shared public asset feed.",
    };
  }

  if (feed === "category" && categorySlug) {
    return {
      kind: "category",
      label: label ?? categorySlug,
      title: `${label ?? categorySlug} Assets`,
      heading: `${label ?? categorySlug} assets`,
      summary: "Assets filtered through the same cached feed the home page uses.",
      categorySlug,
    };
  }

  if (feed === "tag" && tagSlug) {
    return {
      kind: "tag",
      label: label ?? tagSlug,
      title: `${label ?? tagSlug} Assets`,
      heading: `${label ?? tagSlug} assets`,
      summary: "Assets filtered through the same cached feed the home page uses.",
      tagSlug,
    };
  }

  return {
    kind: "featured",
    label: label ?? "Trending",
    title: "Trending Assets",
    heading: "Trending assets",
    summary: "Featured assets filtered through the shared public asset feed.",
  };
}

export default function MarketBrowseScreen(props: MarketBrowseScreenProps) {
  const [status, setStatus] = createSignal<ScreenStatus>("loading");
  const [error, setError] = createSignal<string | null>(null);
  const [assets, setAssets] = createSignal<AssetResponse[]>([]);
  let requestVersion = 0;

  const request = createMemo(() => resolveFeedRequest(props));
  const hasRenderedData = createMemo(() => status() === "ready" || assets().length > 0);

  const seedFromCachedAssetFeed = (currentRequest: ResolvedFeedRequest): boolean => {
    const cachedFeed = readStoredAssetFeed();

    if (!cachedFeed) {
      return false;
    }

    setAssets(
      filterAssetsForFeed(cachedFeed.assets, {
        kind: currentRequest.kind,
        categorySlug: currentRequest.categorySlug,
        tagSlug: currentRequest.tagSlug,
      }),
    );
    setStatus("ready");
    setError(null);
    return true;
  };

  const loadFeed = async (background = false) => {
    const currentRequest = request();
    const version = ++requestVersion;

    if (!background) {
      setStatus("loading");
    }

    setError(null);

    try {
      const response = await loadCompleteAssetFeed(feed => {
        if (version !== requestVersion) {
          return;
        }

        setAssets(
          filterAssetsForFeed(feed.assets, {
            kind: currentRequest.kind,
            categorySlug: currentRequest.categorySlug,
            tagSlug: currentRequest.tagSlug,
          }),
        );
        setStatus("ready");
      });

      if (version !== requestVersion) {
        return;
      }

      setAssets(
        filterAssetsForFeed(response.assets, {
          kind: currentRequest.kind,
          categorySlug: currentRequest.categorySlug,
          tagSlug: currentRequest.tagSlug,
        }),
      );
      setStatus("ready");
    } catch (caughtError) {
      if (version !== requestVersion) {
        return;
      }

      if (background && hasRenderedData()) {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to refresh assets.");
        return;
      }

      setAssets([]);
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load assets.");
      setStatus("error");
    }
  };

  createEffect(() => {
    const currentRequest = request();
    const seededFromCache = seedFromCachedAssetFeed(currentRequest);

    if (!seededFromCache) {
      setAssets([]);
    }

    void loadFeed(seededFromCache);
  });

  return (
    <PublicPageLayout
      title={request().title}
      kicker="Public filters"
      heading={request().heading}
      summary={request().summary}
    >
      <Show
        when={status() !== "error"}
        fallback={
          <PublicState
            title="Unable to load assets"
            copy={error() ?? "Please try again."}
            actionLabel="Retry"
            onAction={() => {
              void loadFeed();
            }}
          />
        }
      >
        <Show
          when={status() === "ready" || hasRenderedData()}
          fallback={
            <PublicState
              title="Loading assets"
              copy={`Fetching the ${request().label.toLowerCase()} asset feed.`}
            />
          }
        >
          <Show
            when={assets().length > 0}
            fallback={
              <PublicState
                title="No assets found"
                copy={
                  request().kind === "breaking"
                    ? "The current backend does not publish any breaking assets yet."
                    : `No assets matched the ${request().label.toLowerCase()} filter.`
                }
              />
            }
          >
            <PublicAssetSections assets={assets()} title={request().label} />
          </Show>
        </Show>
      </Show>
    </PublicPageLayout>
  );
}
