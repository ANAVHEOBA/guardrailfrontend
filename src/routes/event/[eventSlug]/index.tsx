import { useParams, type RouteDefinition } from "@solidjs/router";

import AssetDetailScreen from "~/components/asset-detail/AssetDetailScreen";
import { primeAssetDetailBundle } from "~/components/asset-detail/data";

export const route = {
  preload: ({ params }) => primeAssetDetailBundle("slug", params.eventSlug, "1D"),
} satisfies RouteDefinition;

export default function EventDetailRoute() {
  const params = useParams<{ eventSlug: string }>();

  return <AssetDetailScreen mode="slug" identifier={() => params.eventSlug} />;
}
