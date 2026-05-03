import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createAssetClient, type AssetClient } from "./asset/index.ts";
import {
  getHeaders,
  installFetchMock,
  jsonResponse,
  originalFetch,
  readRequestJson,
  type FetchCall,
} from "../../test/http.ts";

const apiBaseUrl = "http://127.0.0.1:8080";
const sessionToken = "session-token";
const assetAddress = "0xasset";
const assetTypeId = "0xassettype";
const proposalId = "proposal-1";
const walletAddress = "0xwallet";
const slug = "office-fund";

interface EndpointCase {
  name: string;
  run: (client: AssetClient) => Promise<unknown>;
  url: string;
  response: unknown;
  method?: string;
  token?: string;
  body?: unknown;
  assertResponse?: (response: unknown) => void;
}

function sampleFactoryStatus() {
  return {
    factory_address: "0xfactory",
    access_control_address: "0xaccess",
    compliance_registry_address: "0xcompliance",
    treasury_address: "0xtreasury",
    paused: false,
    total_assets_created: "12",
  };
}

function sampleAssetPaymentTokenQuoteResponse(marketCurrency = "usd") {
  return {
    market_currency: marketCurrency,
    payment_token_coin_id: "usd-coin",
    payment_token_address: "0xusdc",
    payment_token_symbol: "USDC",
    payment_token_decimals: 6,
    market_currency_per_payment_token: "1600",
    usd_per_payment_token: "1",
    last_updated_at: 1780000000,
    amount: {
      market_currency_amount: "1000",
      payment_token_amount: "0.625",
      payment_token_base_units: "625000",
    },
    subscription_price: null,
    redemption_price: null,
  };
}

function sampleAssetType() {
  return {
    asset_type_id: assetTypeId,
    asset_type_id_text: "REAL_ESTATE",
    asset_type_name: "Real Estate",
    implementation_address: "0ximpl",
    is_registered: true,
    last_tx_hash: "0xtypehash",
    updated_at: "2026-04-30T10:00:00Z",
  };
}

function sampleAsset() {
  return {
    asset_address: assetAddress,
    proposal_id: proposalId,
    asset_type_id: assetTypeId,
    asset_type_id_text: "REAL_ESTATE",
    asset_type_name: "Real Estate",
    slug,
    name: "Office Fund",
    symbol: "OFF",
    image_url: "https://example.com/office.png",
    summary: "Prime office exposure",
    market_segment: "real-estate",
    suggested_internal_tags: ["income", "office"],
    sources: ["https://example.com/office-fund"],
    featured: true,
    visible: true,
    searchable: true,
    max_supply: "1000000",
    total_supply: "250000",
    asset_state: 1,
    asset_state_label: "active",
    controllable: true,
    self_service_purchase_enabled: true,
    price_per_token: "100",
    redemption_price_per_token: "95",
    treasury_address: "0xtreasury",
    compliance_registry_address: "0xcompliance",
    payment_token_address: "0xusdc",
    metadata_hash: "0xmetadata",
    holder_count: "15",
    total_pending_redemptions: "1000",
    last_tx_hash: "0xassethash",
    updated_at: "2026-04-30T10:00:00Z",
  };
}

function sampleHolder() {
  return {
    asset_address: assetAddress,
    wallet_address: walletAddress,
    balance: "100",
    claimable_yield: "5",
    accumulative_yield: "12",
    pending_redemption: "3",
    locked_balance: "4",
    unlocked_balance: "96",
    payment_token_balance: "10000",
    payment_token_allowance_to_treasury: "5000",
  };
}

function sampleAssetListResponse() {
  return {
    assets: [sampleAsset()],
    limit: 25,
    offset: 50,
  };
}

function samplePreviewResponse() {
  return {
    asset_address: assetAddress,
    token_amount: "10",
    value: "1000",
  };
}

function sampleTransferCheck() {
  return {
    status_code: "0",
    reason_code: "0",
    reason: "ok",
  };
}

function sampleAssetDetailResponse() {
  return {
    asset: sampleAsset(),
    treasury: {
      asset_address: assetAddress,
      balance: "250000",
      reserved_yield: "12000",
      available_liquidity: "238000",
      last_tx_hash: "0xtreasuryasset",
      updated_at: "2026-04-30T10:00:00Z",
    },
    compliance_rules: {
      asset_address: assetAddress,
      transfers_enabled: true,
      subscriptions_enabled: true,
      redemptions_enabled: true,
      requires_accreditation: false,
      min_investment: "1000",
      max_investor_balance: "1000000",
      last_tx_hash: "0xrules",
      updated_at: "2026-04-30T10:00:00Z",
    },
    valuation: {
      asset_address: assetAddress,
      asset_value: "1000000",
      nav_per_token: "100",
      onchain_updated_at: 1780000000,
      reference_id: "NAV-1",
      reference_id_text: "NAV-1",
      last_tx_hash: "0xvaluation",
      updated_at: "2026-04-30T10:00:00Z",
    },
    holder: sampleHolder(),
    unavailable_sections: [],
  };
}

function sampleAssetHistoryResponse() {
  return {
    asset_address: assetAddress,
    range: "30d",
    interval: "1d",
    last_updated_at: 1780000000,
    primary_market_price: [
      {
        timestamp: 1770000000,
        value: "100",
        open: "99",
        high: "101",
        low: "98",
        close: "100",
      },
    ],
    underlying_market_price: [
      {
        timestamp: 1770000000,
        value: "98",
        open: "97",
        high: "99",
        low: "96",
        close: "98",
      },
    ],
  };
}

function sampleAssetTypeWriteResponse() {
  return {
    tx_hash: "0xwrite-type",
    asset_type: sampleAssetType(),
  };
}

function sampleGaslessActionResponse() {
  return {
    tx_hash: "0xgasless",
    asset: sampleAsset(),
    holder: sampleHolder(),
  };
}

function assertCaseRequest(call: FetchCall | undefined, endpoint: EndpointCase): Promise<void> | void {
  assert.ok(call);
  assert.equal(String(call.input), endpoint.url);
  assert.equal(call.init?.method, endpoint.method);

  const headers = getHeaders(call.init);
  assert.equal(headers.get("Accept"), "application/json");
  assert.equal(
    headers.get("Authorization"),
    endpoint.token ? `Bearer ${endpoint.token}` : null,
  );
  assert.equal(
    headers.get("Content-Type"),
    endpoint.body !== undefined ? "application/json" : null,
  );

  if (endpoint.body === undefined) {
    assert.equal(call.init?.body, undefined);
    return;
  }

  return readRequestJson(call.init).then(body => {
    assert.deepEqual(body, endpoint.body);
  });
}

const publicCases: EndpointCase[] = [
  {
    name: "fetchPaymentTokenQuote sends GET /market/quotes/payment-token",
    run: client =>
      client.fetchPaymentTokenQuote({
        market_currency: "usd",
        amount: "1000",
      }),
    url: `${apiBaseUrl}/market/quotes/payment-token?market_currency=usd&amount=1000`,
    response: sampleAssetPaymentTokenQuoteResponse("usd"),
  },
  {
    name: "fetchNgnPaymentTokenQuote sends GET /market/quotes/ngn-payment-token",
    run: client =>
      client.fetchNgnPaymentTokenQuote({
        amount: "5000",
      }),
    url: `${apiBaseUrl}/market/quotes/ngn-payment-token?amount=5000`,
    response: sampleAssetPaymentTokenQuoteResponse("ngn"),
  },
  {
    name: "fetchSupportedCurrencies sends GET /market/supported-currencies",
    run: client => client.fetchSupportedCurrencies(),
    url: `${apiBaseUrl}/market/supported-currencies`,
    response: {
      supported_currencies: ["ngn", "usd"],
    },
  },
  {
    name: "fetchFactoryStatus sends GET /assets/factory",
    run: client => client.fetchFactoryStatus(),
    url: `${apiBaseUrl}/assets/factory`,
    response: sampleFactoryStatus(),
    assertResponse: response => assert.equal((response as { paused: boolean }).paused, false),
  },
  {
    name: "listAssetTypes sends GET /assets/types",
    run: client => client.listAssetTypes(),
    url: `${apiBaseUrl}/assets/types`,
    response: {
      asset_types: [sampleAssetType()],
    },
    assertResponse: response =>
      assert.equal(
        (response as { asset_types: Array<{ asset_type_name: string }> }).asset_types[0]?.asset_type_name,
        "Real Estate",
      ),
  },
  {
    name: "fetchAssetType sends GET /assets/types/{asset_type_id}",
    run: client => client.fetchAssetType(assetTypeId),
    url: `${apiBaseUrl}/assets/types/${encodeURIComponent(assetTypeId)}`,
    response: sampleAssetType(),
  },
  {
    name: "listAssets sends GET /assets with query params",
    run: client =>
      client.listAssets({
        asset_type_id: assetTypeId,
        q: "office fund",
        asset_state: "active",
        self_service_purchase_enabled: true,
        featured: true,
        limit: 25,
        offset: 50,
      }),
    url:
      `${apiBaseUrl}/assets?asset_type_id=${encodeURIComponent(assetTypeId)}` +
      "&q=office+fund&asset_state=active&self_service_purchase_enabled=true&featured=true&limit=25&offset=50",
    response: sampleAssetListResponse(),
    assertResponse: response =>
      assert.equal((response as { assets: Array<{ slug: string | null }> }).assets[0]?.slug, slug),
  },
  {
    name: "listAssetsByType sends GET /assets/by-type/{asset_type_id}",
    run: client => client.listAssetsByType(assetTypeId),
    url: `${apiBaseUrl}/assets/by-type/${encodeURIComponent(assetTypeId)}`,
    response: sampleAssetListResponse(),
  },
  {
    name: "fetchAssetHistoryByProposal sends GET /assets/proposals/{proposal_id}/history",
    run: client =>
      client.fetchAssetHistoryByProposal(proposalId, {
        range: "30d",
      }),
    url: `${apiBaseUrl}/assets/proposals/${encodeURIComponent(proposalId)}/history?range=30d`,
    response: sampleAssetHistoryResponse(),
  },
  {
    name: "fetchAssetDetailByProposal sends GET /assets/proposals/{proposal_id}/detail",
    run: client =>
      client.fetchAssetDetailByProposal(proposalId, {
        wallet_address: walletAddress,
      }),
    url:
      `${apiBaseUrl}/assets/proposals/${encodeURIComponent(proposalId)}/detail` +
      `?wallet_address=${encodeURIComponent(walletAddress)}`,
    response: sampleAssetDetailResponse(),
  },
  {
    name: "fetchAssetByProposal sends GET /assets/proposals/{proposal_id}",
    run: client => client.fetchAssetByProposal(proposalId),
    url: `${apiBaseUrl}/assets/proposals/${encodeURIComponent(proposalId)}`,
    response: sampleAsset(),
  },
  {
    name: "fetchAssetHistoryBySlug sends GET /assets/slug/{slug}/history",
    run: client =>
      client.fetchAssetHistoryBySlug(slug, {
        range: "7d",
      }),
    url: `${apiBaseUrl}/assets/slug/${encodeURIComponent(slug)}/history?range=7d`,
    response: sampleAssetHistoryResponse(),
  },
  {
    name: "fetchAssetDetailBySlug sends GET /assets/slug/{slug}/detail",
    run: client =>
      client.fetchAssetDetailBySlug(slug, {
        wallet_address: walletAddress,
      }),
    url:
      `${apiBaseUrl}/assets/slug/${encodeURIComponent(slug)}/detail` +
      `?wallet_address=${encodeURIComponent(walletAddress)}`,
    response: sampleAssetDetailResponse(),
  },
  {
    name: "fetchAssetBySlug sends GET /assets/slug/{slug}",
    run: client => client.fetchAssetBySlug(slug),
    url: `${apiBaseUrl}/assets/slug/${encodeURIComponent(slug)}`,
    response: sampleAsset(),
  },
  {
    name: "fetchAssetHistory sends GET /assets/{asset_address}/history",
    run: client =>
      client.fetchAssetHistory(assetAddress, {
        range: "90d",
      }),
    url: `${apiBaseUrl}/assets/${encodeURIComponent(assetAddress)}/history?range=90d`,
    response: sampleAssetHistoryResponse(),
  },
  {
    name: "fetchAssetDetail sends GET /assets/{asset_address}/detail",
    run: client =>
      client.fetchAssetDetail(assetAddress, {
        wallet_address: walletAddress,
      }),
    url:
      `${apiBaseUrl}/assets/${encodeURIComponent(assetAddress)}/detail` +
      `?wallet_address=${encodeURIComponent(walletAddress)}`,
    response: sampleAssetDetailResponse(),
    assertResponse: response =>
      assert.equal(
        (response as { holder: { wallet_address: string } | null }).holder?.wallet_address,
        walletAddress,
      ),
  },
  {
    name: "fetchAsset sends GET /assets/{asset_address}",
    run: client => client.fetchAsset(assetAddress),
    url: `${apiBaseUrl}/assets/${encodeURIComponent(assetAddress)}`,
    response: sampleAsset(),
  },
  {
    name: "fetchAssetHolderState sends GET /assets/{asset_address}/holders/{wallet_address}",
    run: client => client.fetchAssetHolderState(assetAddress, walletAddress),
    url: `${apiBaseUrl}/assets/${encodeURIComponent(assetAddress)}/holders/${encodeURIComponent(walletAddress)}`,
    response: sampleHolder(),
  },
  {
    name: "previewPurchase posts /assets/{asset_address}/preview/purchase",
    run: client =>
      client.previewPurchase(assetAddress, {
        token_amount: "10",
      }),
    url: `${apiBaseUrl}/assets/${encodeURIComponent(assetAddress)}/preview/purchase`,
    method: "POST",
    body: {
      token_amount: "10",
    },
    response: samplePreviewResponse(),
  },
  {
    name: "previewRedemption posts /assets/{asset_address}/preview/redemption",
    run: client =>
      client.previewRedemption(assetAddress, {
        token_amount: "10",
      }),
    url: `${apiBaseUrl}/assets/${encodeURIComponent(assetAddress)}/preview/redemption`,
    method: "POST",
    body: {
      token_amount: "10",
    },
    response: samplePreviewResponse(),
  },
  {
    name: "checkTransfer posts /assets/{asset_address}/check/transfer",
    run: client =>
      client.checkTransfer(assetAddress, {
        from_wallet: "0xfrom",
        to_wallet: "0xto",
        amount: "10",
        data: "0x00",
      }),
    url: `${apiBaseUrl}/assets/${encodeURIComponent(assetAddress)}/check/transfer`,
    method: "POST",
    body: {
      from_wallet: "0xfrom",
      to_wallet: "0xto",
      amount: "10",
      data: "0x00",
    },
    response: sampleTransferCheck(),
  },
];

const userCases: EndpointCase[] = [
  {
    name: "approvePaymentToken posts /assets/{asset_address}/payment-token/approve",
    run: client =>
      client.approvePaymentToken(sessionToken, assetAddress, {
        amount: "1000",
      }),
    url: `${apiBaseUrl}/assets/${encodeURIComponent(assetAddress)}/payment-token/approve`,
    method: "POST",
    token: sessionToken,
    body: {
      amount: "1000",
    },
    response: sampleGaslessActionResponse(),
  },
  {
    name: "purchaseAsset posts /assets/{asset_address}/purchase",
    run: client =>
      client.purchaseAsset(sessionToken, assetAddress, {
        token_amount: "10",
      }),
    url: `${apiBaseUrl}/assets/${encodeURIComponent(assetAddress)}/purchase`,
    method: "POST",
    token: sessionToken,
    body: {
      token_amount: "10",
    },
    response: sampleGaslessActionResponse(),
  },
  {
    name: "claimYield posts /assets/{asset_address}/yield/claim",
    run: client =>
      client.claimYield(sessionToken, assetAddress, {
        recipient_wallet: "0xrecipient",
      }),
    url: `${apiBaseUrl}/assets/${encodeURIComponent(assetAddress)}/yield/claim`,
    method: "POST",
    token: sessionToken,
    body: {
      recipient_wallet: "0xrecipient",
    },
    response: sampleGaslessActionResponse(),
  },
  {
    name: "redeemAsset posts /assets/{asset_address}/redeem",
    run: client =>
      client.redeemAsset(sessionToken, assetAddress, {
        amount: "15",
        data: "0x03",
      }),
    url: `${apiBaseUrl}/assets/${encodeURIComponent(assetAddress)}/redeem`,
    method: "POST",
    token: sessionToken,
    body: {
      amount: "15",
      data: "0x03",
    },
    response: sampleGaslessActionResponse(),
  },
  {
    name: "cancelRedemption posts /assets/{asset_address}/redemptions/cancel",
    run: client =>
      client.cancelRedemption(sessionToken, assetAddress, {
        amount: "5",
      }),
    url: `${apiBaseUrl}/assets/${encodeURIComponent(assetAddress)}/redemptions/cancel`,
    method: "POST",
    token: sessionToken,
    body: {
      amount: "5",
    },
    response: sampleGaslessActionResponse(),
    assertResponse: response =>
      assert.equal((response as { holder: { wallet_address: string } }).holder.wallet_address, walletAddress),
  },
];

afterEach(() => {
  globalThis.fetch = originalFetch;
});

for (const endpoint of [...publicCases, ...userCases]) {
  test(endpoint.name, async () => {
    const client = createAssetClient({ baseUrl: `${apiBaseUrl}/` });
    const calls: FetchCall[] = [];

    installFetchMock(calls, () => jsonResponse(endpoint.response));

    const response = await endpoint.run(client);

    await assertCaseRequest(calls[0], endpoint);
    if (endpoint.assertResponse) {
      endpoint.assertResponse(response);
    } else {
      assert.ok(response);
    }
  });
}
