import { useParams, type RouteDefinition } from "@solidjs/router";

import AssetDetailScreen from "~/components/asset-detail/AssetDetailScreen";
import { primeAssetDetailBundle } from "~/components/asset-detail/data";

export const route = {
  preload: ({ params }) => primeAssetDetailBundle("proposal", params.proposalId, "1D"),
} satisfies RouteDefinition;

export default function AssetProposalDetailRoute() {
  const params = useParams<{ proposalId: string }>();

  return <AssetDetailScreen mode="proposal" identifier={() => params.proposalId} />;
}
