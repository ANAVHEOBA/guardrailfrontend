import assert from "node:assert/strict";
import test from "node:test";

import {
  filterAssetsForFeed,
  matchesAssetSearchQuery,
  readAssetTagSlugs,
  resolveAssetCategorySlug,
} from "./asset-feed.ts";
import type { AssetResponse } from "./asset/types.ts";

function sampleAsset(overrides: Partial<AssetResponse> = {}): AssetResponse {
  return {
    asset_address: "0xasset",
    proposal_id: "proposal-1",
    asset_type_id: "type-1",
    asset_type_id_text: "type-1",
    asset_type_name: "Bond",
    slug: "fgn-18-50-feb-2031-bond",
    name: "FGN 18.50% FEB 2031 Bond",
    symbol: "FGN2031",
    image_url: null,
    summary: "Federal government bond",
    market_segment: "Fixed Income",
    suggested_internal_tags: ["bonds", "income"],
    sources: [],
    featured: true,
    visible: true,
    searchable: true,
    max_supply: "1000000",
    total_supply: "0",
    asset_state: 1,
    asset_state_label: "active",
    controllable: true,
    self_service_purchase_enabled: false,
    price_per_token: "76612",
    redemption_price_per_token: "76612",
    treasury_address: "0xtreasury",
    compliance_registry_address: "0xcompliance",
    payment_token_address: "0xpayment",
    metadata_hash: "0xmetadata",
    holder_count: "0",
    total_pending_redemptions: "0",
    last_tx_hash: null,
    updated_at: "2026-05-04T00:00:00Z",
    ...overrides,
  };
}

test("resolveAssetCategorySlug matches backend market-segment fallback", () => {
  assert.equal(resolveAssetCategorySlug(sampleAsset()), "fixed-income");
  assert.equal(
    resolveAssetCategorySlug(sampleAsset({ market_segment: null, asset_type_name: "Treasury Bills" })),
    "treasury-bills",
  );
  assert.equal(
    resolveAssetCategorySlug(sampleAsset({ market_segment: null, asset_type_name: null })),
    "assets",
  );
});

test("readAssetTagSlugs normalizes and deduplicates tags", () => {
  const tags = readAssetTagSlugs(
    sampleAsset({
      suggested_internal_tags: ["Fixed Income", "fixed-income", " NGN ", "", "income"],
    }),
  );

  assert.deepEqual(tags, ["fixed-income", "ngn", "income"]);
});

test("matchesAssetSearchQuery checks the same asset-facing text fields", () => {
  const asset = sampleAsset();

  assert.equal(matchesAssetSearchQuery(asset, "FGN2031"), true);
  assert.equal(matchesAssetSearchQuery(asset, "government bond"), true);
  assert.equal(matchesAssetSearchQuery(asset, "fixed income"), true);
  assert.equal(matchesAssetSearchQuery(asset, "income"), true);
  assert.equal(matchesAssetSearchQuery(asset, "equity"), false);
});

test("filterAssetsForFeed reuses asset data for featured category tag and search views", () => {
  const featured = sampleAsset();
  const tagged = sampleAsset({
    asset_address: "0xasset2",
    proposal_id: "proposal-2",
    slug: "ntb-364",
    name: "Nigeria Treasury Bills 364-Day Series",
    symbol: "NTB364",
    featured: false,
    market_segment: "Treasury Bills",
    suggested_internal_tags: ["tbills", "ngn"],
  });

  assert.equal(
    filterAssetsForFeed([featured, tagged], { kind: "featured" }).map(asset => asset.symbol).join(","),
    "FGN2031",
  );
  assert.equal(
    filterAssetsForFeed([featured, tagged], {
      kind: "category",
      categorySlug: "fixed-income",
    })
      .map(asset => asset.symbol)
      .join(","),
    "FGN2031",
  );
  assert.equal(
    filterAssetsForFeed([featured, tagged], {
      kind: "tag",
      tagSlug: "ngn",
    })
      .map(asset => asset.symbol)
      .join(","),
    "NTB364",
  );
  assert.equal(
    filterAssetsForFeed([featured, tagged], {
      kind: "search",
      query: "treasury",
    })
      .map(asset => asset.symbol)
      .join(","),
    "NTB364",
  );
  assert.deepEqual(filterAssetsForFeed([featured, tagged], { kind: "breaking" }), []);
});
