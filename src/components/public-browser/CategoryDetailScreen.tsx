import { formatSlugLabel } from "~/lib/market/index.ts";

import MarketBrowseScreen from "./MarketBrowseScreen.tsx";

interface CategoryDetailScreenProps {
  slug: string;
}

export default function CategoryDetailScreen(props: CategoryDetailScreenProps) {
  return (
    <MarketBrowseScreen
      feed="category"
      category={props.slug}
      label={formatSlugLabel(props.slug)}
    />
  );
}
