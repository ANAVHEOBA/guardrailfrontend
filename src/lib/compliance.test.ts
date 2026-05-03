import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createComplianceClient, type ComplianceClient } from "./compliance/index.ts";
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
const walletAddress = "0xwallet";
const jurisdiction = "US";

interface EndpointCase {
  name: string;
  run: (client: ComplianceClient) => Promise<unknown>;
  url: string;
  response: unknown;
  method?: string;
  token?: string;
  body?: unknown;
}

function sampleInvestor() {
  return {
    wallet_address: walletAddress,
    is_verified: true,
    is_accredited: true,
    is_frozen: false,
    is_whitelisted: true,
    valid_until: 1780000000,
    jurisdiction,
    jurisdiction_text: jurisdiction,
    external_ref: "INV-1",
    external_ref_text: "INV-1",
    last_tx_hash: "0xinvestor",
    updated_at: "2026-04-30T10:00:00Z",
  };
}

function sampleAssetRules() {
  return {
    asset_address: assetAddress,
    transfers_enabled: true,
    subscriptions_enabled: true,
    redemptions_enabled: true,
    requires_accreditation: false,
    min_investment: "1000",
    max_investor_balance: "1000000",
    last_tx_hash: "0xrules",
    updated_at: "2026-04-30T10:00:00Z",
  };
}

function sampleRestriction() {
  return {
    asset_address: assetAddress,
    jurisdiction,
    jurisdiction_text: jurisdiction,
    restricted: false,
    last_tx_hash: "0xrestriction",
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
    name: "fetchInvestor sends GET /compliance/investors/{wallet}",
    run: client => client.fetchInvestor(walletAddress),
    url: `${apiBaseUrl}/compliance/investors/${encodeURIComponent(walletAddress)}`,
    response: sampleInvestor(),
  },
  {
    name: "fetchAssetRules sends GET /compliance/assets/{asset}/rules",
    run: client => client.fetchAssetRules(assetAddress),
    url: `${apiBaseUrl}/compliance/assets/${encodeURIComponent(assetAddress)}/rules`,
    response: sampleAssetRules(),
  },
  {
    name: "fetchJurisdictionRestriction sends GET /compliance/assets/{asset}/jurisdictions/{jurisdiction}",
    run: client => client.fetchJurisdictionRestriction(assetAddress, jurisdiction),
    url:
      `${apiBaseUrl}/compliance/assets/${encodeURIComponent(assetAddress)}` +
      `/jurisdictions/${encodeURIComponent(jurisdiction)}`,
    response: sampleRestriction(),
  },
  {
    name: "checkSubscribe posts /compliance/check/subscribe",
    run: client =>
      client.checkSubscribe({
        asset_address: assetAddress,
        investor_wallet: walletAddress,
        amount: "1000",
        resulting_balance: "5000",
      }),
    url: `${apiBaseUrl}/compliance/check/subscribe`,
    method: "POST",
    body: {
      asset_address: assetAddress,
      investor_wallet: walletAddress,
      amount: "1000",
      resulting_balance: "5000",
    },
    response: {
      is_valid: true,
      reason: "ok",
    },
  },
  {
    name: "checkTransfer posts /compliance/check/transfer",
    run: client =>
      client.checkTransfer({
        asset_address: assetAddress,
        from_wallet: "0xfrom",
        to_wallet: "0xto",
        amount: "100",
        receiving_balance: "500",
      }),
    url: `${apiBaseUrl}/compliance/check/transfer`,
    method: "POST",
    body: {
      asset_address: assetAddress,
      from_wallet: "0xfrom",
      to_wallet: "0xto",
      amount: "100",
      receiving_balance: "500",
    },
    response: {
      is_valid: true,
      reason: "ok",
    },
  },
  {
    name: "checkRedeem posts /compliance/check/redeem",
    run: client =>
      client.checkRedeem({
        asset_address: assetAddress,
        investor_wallet: walletAddress,
        amount: "50",
      }),
    url: `${apiBaseUrl}/compliance/check/redeem`,
    method: "POST",
    body: {
      asset_address: assetAddress,
      investor_wallet: walletAddress,
      amount: "50",
    },
    response: {
      is_valid: true,
      reason: "ok",
    },
  },
];

afterEach(() => {
  globalThis.fetch = originalFetch;
});

for (const endpoint of cases) {
  test(endpoint.name, async () => {
    const client = createComplianceClient({ baseUrl: `${apiBaseUrl}/` });
    const calls: FetchCall[] = [];

    installFetchMock(calls, () => jsonResponse(endpoint.response));

    const response = await endpoint.run(client);

    await assertCaseRequest(calls[0], endpoint);
    assert.ok(response);
  });
}
