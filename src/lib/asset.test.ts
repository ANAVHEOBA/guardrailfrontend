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

function sampleAssetTypeWriteResponse() {
  return {
    tx_hash: "0xwrite-type",
    asset_type: sampleAssetType(),
  };
}

function sampleFactoryWriteResponse() {
  return {
    tx_hash: "0xwrite-factory",
    factory: sampleFactoryStatus(),
  };
}

function sampleAssetWriteResponse() {
  return {
    tx_hash: "0xwrite-asset",
    asset: sampleAsset(),
  };
}

function sampleAssetCatalogWriteResponse() {
  return {
    asset: sampleAsset(),
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
    name: "fetchAssetByProposal sends GET /assets/proposals/{proposal_id}",
    run: client => client.fetchAssetByProposal(proposalId),
    url: `${apiBaseUrl}/assets/proposals/${encodeURIComponent(proposalId)}`,
    response: sampleAsset(),
  },
  {
    name: "fetchAssetBySlug sends GET /assets/slug/{slug}",
    run: client => client.fetchAssetBySlug(slug),
    url: `${apiBaseUrl}/assets/slug/${encodeURIComponent(slug)}`,
    response: sampleAsset(),
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

const adminCases: EndpointCase[] = [
  {
    name: "registerAssetType posts /admin/assets/types",
    run: client =>
      client.registerAssetType(sessionToken, {
        asset_type_id: assetTypeId,
        asset_type_name: "Real Estate",
        implementation_address: "0ximpl",
      }),
    url: `${apiBaseUrl}/admin/assets/types`,
    method: "POST",
    token: sessionToken,
    body: {
      asset_type_id: assetTypeId,
      asset_type_name: "Real Estate",
      implementation_address: "0ximpl",
    },
    response: sampleAssetTypeWriteResponse(),
  },
  {
    name: "unregisterAssetType sends DELETE /admin/assets/types/{asset_type_id}",
    run: client => client.unregisterAssetType(sessionToken, assetTypeId),
    url: `${apiBaseUrl}/admin/assets/types/${encodeURIComponent(assetTypeId)}`,
    method: "DELETE",
    token: sessionToken,
    response: sampleAssetTypeWriteResponse(),
  },
  {
    name: "pauseFactory posts /admin/assets/factory/pause",
    run: client => client.pauseFactory(sessionToken),
    url: `${apiBaseUrl}/admin/assets/factory/pause`,
    method: "POST",
    token: sessionToken,
    response: sampleFactoryWriteResponse(),
  },
  {
    name: "unpauseFactory posts /admin/assets/factory/unpause",
    run: client => client.unpauseFactory(sessionToken),
    url: `${apiBaseUrl}/admin/assets/factory/unpause`,
    method: "POST",
    token: sessionToken,
    response: sampleFactoryWriteResponse(),
  },
  {
    name: "createAsset posts /admin/assets",
    run: client =>
      client.createAsset(sessionToken, {
        proposal_id: proposalId,
        asset_type_id: assetTypeId,
        name: "Office Fund",
        symbol: "OFF",
        max_supply: "1000000",
        subscription_price: "100",
        redemption_price: "95",
        self_service_purchase_enabled: true,
        metadata_hash: "0xmetadata",
        slug,
        image_url: "https://example.com/office.png",
        summary: "Prime office exposure",
        featured: true,
        visible: true,
        searchable: true,
      }),
    url: `${apiBaseUrl}/admin/assets`,
    method: "POST",
    token: sessionToken,
    body: {
      proposal_id: proposalId,
      asset_type_id: assetTypeId,
      name: "Office Fund",
      symbol: "OFF",
      max_supply: "1000000",
      subscription_price: "100",
      redemption_price: "95",
      self_service_purchase_enabled: true,
      metadata_hash: "0xmetadata",
      slug,
      image_url: "https://example.com/office.png",
      summary: "Prime office exposure",
      featured: true,
      visible: true,
      searchable: true,
    },
    response: sampleAssetWriteResponse(),
  },
  {
    name: "issueAsset posts /admin/assets/{asset_address}/issue",
    run: client =>
      client.issueAsset(sessionToken, assetAddress, {
        recipient_wallet: walletAddress,
        amount: "100",
        data: "0x00",
      }),
    url: `${apiBaseUrl}/admin/assets/${encodeURIComponent(assetAddress)}/issue`,
    method: "POST",
    token: sessionToken,
    body: {
      recipient_wallet: walletAddress,
      amount: "100",
      data: "0x00",
    },
    response: sampleAssetWriteResponse(),
  },
  {
    name: "burnAsset posts /admin/assets/{asset_address}/burn",
    run: client =>
      client.burnAsset(sessionToken, assetAddress, {
        from_wallet: walletAddress,
        amount: "25",
      }),
    url: `${apiBaseUrl}/admin/assets/${encodeURIComponent(assetAddress)}/burn`,
    method: "POST",
    token: sessionToken,
    body: {
      from_wallet: walletAddress,
      amount: "25",
    },
    response: sampleAssetWriteResponse(),
  },
  {
    name: "setAssetState puts /admin/assets/{asset_address}/state",
    run: client =>
      client.setAssetState(sessionToken, assetAddress, {
        state: "paused",
      }),
    url: `${apiBaseUrl}/admin/assets/${encodeURIComponent(assetAddress)}/state`,
    method: "PUT",
    token: sessionToken,
    body: {
      state: "paused",
    },
    response: sampleAssetWriteResponse(),
  },
  {
    name: "setSubscriptionPrice puts /admin/assets/{asset_address}/subscription-price",
    run: client =>
      client.setSubscriptionPrice(sessionToken, assetAddress, {
        value: "101",
      }),
    url: `${apiBaseUrl}/admin/assets/${encodeURIComponent(assetAddress)}/subscription-price`,
    method: "PUT",
    token: sessionToken,
    body: {
      value: "101",
    },
    response: sampleAssetWriteResponse(),
  },
  {
    name: "setRedemptionPrice puts /admin/assets/{asset_address}/redemption-price",
    run: client =>
      client.setRedemptionPrice(sessionToken, assetAddress, {
        value: "96",
      }),
    url: `${apiBaseUrl}/admin/assets/${encodeURIComponent(assetAddress)}/redemption-price`,
    method: "PUT",
    token: sessionToken,
    body: {
      value: "96",
    },
    response: sampleAssetWriteResponse(),
  },
  {
    name: "setPricing puts /admin/assets/{asset_address}/pricing",
    run: client =>
      client.setPricing(sessionToken, assetAddress, {
        subscription_price: "101",
        redemption_price: "96",
      }),
    url: `${apiBaseUrl}/admin/assets/${encodeURIComponent(assetAddress)}/pricing`,
    method: "PUT",
    token: sessionToken,
    body: {
      subscription_price: "101",
      redemption_price: "96",
    },
    response: sampleAssetWriteResponse(),
  },
  {
    name: "setSelfServicePurchaseEnabled puts /admin/assets/{asset_address}/self-service-purchase",
    run: client =>
      client.setSelfServicePurchaseEnabled(sessionToken, assetAddress, {
        enabled: false,
      }),
    url: `${apiBaseUrl}/admin/assets/${encodeURIComponent(assetAddress)}/self-service-purchase`,
    method: "PUT",
    token: sessionToken,
    body: {
      enabled: false,
    },
    response: sampleAssetWriteResponse(),
  },
  {
    name: "setMetadataHash puts /admin/assets/{asset_address}/metadata",
    run: client =>
      client.setMetadataHash(sessionToken, assetAddress, {
        metadata_hash: "0xnewhash",
      }),
    url: `${apiBaseUrl}/admin/assets/${encodeURIComponent(assetAddress)}/metadata`,
    method: "PUT",
    token: sessionToken,
    body: {
      metadata_hash: "0xnewhash",
    },
    response: sampleAssetWriteResponse(),
  },
  {
    name: "setAssetCatalog puts /admin/assets/{asset_address}/catalog",
    run: client =>
      client.setAssetCatalog(sessionToken, assetAddress, {
        slug,
        image_url: "https://example.com/office.png",
        summary: "Updated summary",
        featured: true,
        visible: true,
        searchable: true,
      }),
    url: `${apiBaseUrl}/admin/assets/${encodeURIComponent(assetAddress)}/catalog`,
    method: "PUT",
    token: sessionToken,
    body: {
      slug,
      image_url: "https://example.com/office.png",
      summary: "Updated summary",
      featured: true,
      visible: true,
      searchable: true,
    },
    response: sampleAssetCatalogWriteResponse(),
  },
  {
    name: "setComplianceRegistry puts /admin/assets/{asset_address}/compliance-registry",
    run: client =>
      client.setComplianceRegistry(sessionToken, assetAddress, {
        compliance_registry_address: "0xregistry",
      }),
    url: `${apiBaseUrl}/admin/assets/${encodeURIComponent(assetAddress)}/compliance-registry`,
    method: "PUT",
    token: sessionToken,
    body: {
      compliance_registry_address: "0xregistry",
    },
    response: sampleAssetWriteResponse(),
  },
  {
    name: "setTreasury puts /admin/assets/{asset_address}/treasury",
    run: client =>
      client.setTreasury(sessionToken, assetAddress, {
        treasury_address: "0xtreasury",
      }),
    url: `${apiBaseUrl}/admin/assets/${encodeURIComponent(assetAddress)}/treasury`,
    method: "PUT",
    token: sessionToken,
    body: {
      treasury_address: "0xtreasury",
    },
    response: sampleAssetWriteResponse(),
  },
  {
    name: "disableController posts /admin/assets/{asset_address}/controller/disable",
    run: client => client.disableController(sessionToken, assetAddress),
    url: `${apiBaseUrl}/admin/assets/${encodeURIComponent(assetAddress)}/controller/disable`,
    method: "POST",
    token: sessionToken,
    response: sampleAssetWriteResponse(),
  },
  {
    name: "controllerTransfer posts /admin/assets/{asset_address}/controller/transfer",
    run: client =>
      client.controllerTransfer(sessionToken, assetAddress, {
        from_wallet: "0xfrom",
        to_wallet: "0xto",
        amount: "10",
        data: "0x00",
        operator_data: "0x01",
      }),
    url: `${apiBaseUrl}/admin/assets/${encodeURIComponent(assetAddress)}/controller/transfer`,
    method: "POST",
    token: sessionToken,
    body: {
      from_wallet: "0xfrom",
      to_wallet: "0xto",
      amount: "10",
      data: "0x00",
      operator_data: "0x01",
    },
    response: sampleAssetWriteResponse(),
  },
  {
    name: "processRedemption posts /admin/assets/{asset_address}/redemptions/process",
    run: client =>
      client.processRedemption(sessionToken, assetAddress, {
        investor_wallet: walletAddress,
        amount: "5",
        recipient_wallet: "0xrecipient",
        data: "0x02",
      }),
    url: `${apiBaseUrl}/admin/assets/${encodeURIComponent(assetAddress)}/redemptions/process`,
    method: "POST",
    token: sessionToken,
    body: {
      investor_wallet: walletAddress,
      amount: "5",
      recipient_wallet: "0xrecipient",
      data: "0x02",
    },
    response: sampleAssetWriteResponse(),
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

for (const endpoint of [...publicCases, ...adminCases, ...userCases]) {
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
