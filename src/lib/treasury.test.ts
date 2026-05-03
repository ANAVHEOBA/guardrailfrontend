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
