import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createTreasuryClient, type TreasuryClient } from "./treasury/index.ts";
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

interface EndpointCase {
  name: string;
  run: (client: TreasuryClient) => Promise<unknown>;
  url: string;
  response: unknown;
  method?: string;
  token?: string;
  body?: unknown;
}

function sampleTreasuryStatus() {
  return {
    treasury_address: "0xtreasury",
    payment_token_address: "0xusdc",
    access_control_address: "0xaccess",
    paused: false,
    total_tracked_balance: "1000000",
    total_reserved_yield: "50000",
    last_tx_hash: "0xtreasuryhash",
    updated_at: "2026-04-30T10:00:00Z",
  };
}

function sampleTreasuryAsset() {
  return {
    asset_address: assetAddress,
    balance: "250000",
    reserved_yield: "12000",
    available_liquidity: "238000",
    last_tx_hash: "0xassethash",
    updated_at: "2026-04-30T10:00:00Z",
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

const cases: EndpointCase[] = [
  {
    name: "fetchTreasuryStatus sends GET /treasury",
    run: client => client.fetchTreasuryStatus(),
    url: `${apiBaseUrl}/treasury`,
    response: sampleTreasuryStatus(),
  },
  {
    name: "fetchTreasuryAsset sends GET /treasury/assets/{asset_address}",
    run: client => client.fetchTreasuryAsset(assetAddress),
    url: `${apiBaseUrl}/treasury/assets/${encodeURIComponent(assetAddress)}`,
    response: sampleTreasuryAsset(),
  },
  {
    name: "approvePaymentToken posts /admin/treasury/payment-token/approve",
    run: client =>
      client.approvePaymentToken(sessionToken, {
        amount: "1000000",
      }),
    url: `${apiBaseUrl}/admin/treasury/payment-token/approve`,
    method: "POST",
    token: sessionToken,
    body: {
      amount: "1000000",
    },
    response: {
      tx_hash: "0xapprove-payment-token",
      payment_token_address: "0xusdc",
      treasury_address: "0xtreasury",
      approved_amount: "1000000",
    },
  },
  {
    name: "depositAssetLiquidity posts /admin/treasury/liquidity/deposit",
    run: client =>
      client.depositAssetLiquidity(sessionToken, {
        asset_address: assetAddress,
        amount: "10000",
      }),
    url: `${apiBaseUrl}/admin/treasury/liquidity/deposit`,
    method: "POST",
    token: sessionToken,
    body: {
      asset_address: assetAddress,
      amount: "10000",
    },
    response: {
      tx_hash: "0xdeposit-liquidity",
      treasury: sampleTreasuryStatus(),
      asset: sampleTreasuryAsset(),
    },
  },
  {
    name: "releaseCapital posts /admin/treasury/capital/release",
    run: client =>
      client.releaseCapital(sessionToken, {
        asset_address: assetAddress,
        amount: "5000",
        recipient_wallet: "0xrecipient",
        reference_id: "CAP-1",
      }),
    url: `${apiBaseUrl}/admin/treasury/capital/release`,
    method: "POST",
    token: sessionToken,
    body: {
      asset_address: assetAddress,
      amount: "5000",
      recipient_wallet: "0xrecipient",
      reference_id: "CAP-1",
    },
    response: {
      tx_hash: "0xrelease-capital",
      treasury: sampleTreasuryStatus(),
      asset: sampleTreasuryAsset(),
    },
  },
  {
    name: "depositYield posts /admin/treasury/yield/deposit",
    run: client =>
      client.depositYield(sessionToken, {
        asset_address: assetAddress,
        amount: "2000",
        data: "0x00",
      }),
    url: `${apiBaseUrl}/admin/treasury/yield/deposit`,
    method: "POST",
    token: sessionToken,
    body: {
      asset_address: assetAddress,
      amount: "2000",
      data: "0x00",
    },
    response: {
      tx_hash: "0xdeposit-yield",
      treasury: sampleTreasuryStatus(),
      asset: sampleTreasuryAsset(),
    },
  },
  {
    name: "emergencyWithdraw posts /admin/treasury/emergency-withdraw",
    run: client =>
      client.emergencyWithdraw(sessionToken, {
        token_address: "0xusdc",
        amount: "1000",
        recipient_wallet: "0xrecipient",
      }),
    url: `${apiBaseUrl}/admin/treasury/emergency-withdraw`,
    method: "POST",
    token: sessionToken,
    body: {
      token_address: "0xusdc",
      amount: "1000",
      recipient_wallet: "0xrecipient",
    },
    response: {
      tx_hash: "0xemergency-withdraw",
      treasury: sampleTreasuryStatus(),
    },
  },
  {
    name: "pauseTreasury posts /admin/treasury/pause",
    run: client => client.pauseTreasury(sessionToken),
    url: `${apiBaseUrl}/admin/treasury/pause`,
    method: "POST",
    token: sessionToken,
    response: {
      tx_hash: "0xpause-treasury",
      treasury: sampleTreasuryStatus(),
    },
  },
  {
    name: "unpauseTreasury posts /admin/treasury/unpause",
    run: client => client.unpauseTreasury(sessionToken),
    url: `${apiBaseUrl}/admin/treasury/unpause`,
    method: "POST",
    token: sessionToken,
    response: {
      tx_hash: "0xunpause-treasury",
      treasury: sampleTreasuryStatus(),
    },
  },
];

afterEach(() => {
  globalThis.fetch = originalFetch;
});

for (const endpoint of cases) {
  test(endpoint.name, async () => {
    const client = createTreasuryClient({ baseUrl: `${apiBaseUrl}/` });
    const calls: FetchCall[] = [];

    installFetchMock(calls, () => jsonResponse(endpoint.response));

    const response = await endpoint.run(client);

    await assertCaseRequest(calls[0], endpoint);
    assert.ok(response);
  });
}
