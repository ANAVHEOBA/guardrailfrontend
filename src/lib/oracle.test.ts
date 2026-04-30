import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createOracleClient, type OracleClient } from "./oracle/index.ts";
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
const oracleAddress = "0xoracle";
const documentType = "NAV_REPORT";

interface EndpointCase {
  name: string;
  run: (client: OracleClient) => Promise<unknown>;
  url: string;
  response: unknown;
  method?: string;
  token?: string;
  body?: unknown;
}

function sampleTrustedOracle() {
  return {
    oracle_address: oracleAddress,
    is_trusted: true,
    last_tx_hash: "0xoraclehash",
    updated_at: "2026-04-30T10:00:00Z",
  };
}

function sampleValuation() {
  return {
    asset_address: assetAddress,
    asset_value: "1000000",
    nav_per_token: "100",
    onchain_updated_at: 1780000000,
    reference_id: "REF-1",
    reference_id_text: "REF-1",
    last_tx_hash: "0xvaluationhash",
    updated_at: "2026-04-30T10:00:00Z",
  };
}

function sampleDocument() {
  return {
    asset_address: assetAddress,
    document_type: documentType,
    document_type_text: documentType,
    document_hash: "0xdochash",
    reference_id: "REF-1",
    reference_id_text: "REF-1",
    last_tx_hash: "0xdocumenthash",
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
    name: "fetchTrustedOracle sends GET /oracle/trusted-oracles/{oracle_address}",
    run: client => client.fetchTrustedOracle(oracleAddress),
    url: `${apiBaseUrl}/oracle/trusted-oracles/${encodeURIComponent(oracleAddress)}`,
    response: sampleTrustedOracle(),
  },
  {
    name: "fetchValuation sends GET /oracle/assets/{asset_address}/valuation",
    run: client => client.fetchValuation(assetAddress),
    url: `${apiBaseUrl}/oracle/assets/${encodeURIComponent(assetAddress)}/valuation`,
    response: sampleValuation(),
  },
  {
    name: "fetchDocument sends GET /oracle/assets/{asset_address}/documents/{document_type}",
    run: client => client.fetchDocument(assetAddress, documentType),
    url:
      `${apiBaseUrl}/oracle/assets/${encodeURIComponent(assetAddress)}` +
      `/documents/${encodeURIComponent(documentType)}`,
    response: sampleDocument(),
  },
  {
    name: "setTrustedOracle puts /admin/oracle/trusted-oracles/{oracle_address}",
    run: client =>
      client.setTrustedOracle(sessionToken, oracleAddress, {
        trusted: true,
      }),
    url: `${apiBaseUrl}/admin/oracle/trusted-oracles/${encodeURIComponent(oracleAddress)}`,
    method: "PUT",
    token: sessionToken,
    body: {
      trusted: true,
    },
    response: {
      tx_hash: "0xset-oracle",
      trusted_oracle: sampleTrustedOracle(),
    },
  },
  {
    name: "submitValuation posts /admin/oracle/valuations",
    run: client =>
      client.submitValuation(sessionToken, {
        asset_address: assetAddress,
        asset_value: "1000000",
        nav_per_token: "100",
        reference_id: "REF-1",
      }),
    url: `${apiBaseUrl}/admin/oracle/valuations`,
    method: "POST",
    token: sessionToken,
    body: {
      asset_address: assetAddress,
      asset_value: "1000000",
      nav_per_token: "100",
      reference_id: "REF-1",
    },
    response: {
      tx_hash: "0xsubmit-valuation",
      valuation: sampleValuation(),
    },
  },
  {
    name: "submitValuationAndSyncPricing posts /admin/oracle/valuations/sync-pricing",
    run: client =>
      client.submitValuationAndSyncPricing(sessionToken, {
        asset_address: assetAddress,
        asset_value: "1000000",
        nav_per_token: "100",
        subscription_price: "101",
        redemption_price: "96",
        reference_id: "REF-1",
      }),
    url: `${apiBaseUrl}/admin/oracle/valuations/sync-pricing`,
    method: "POST",
    token: sessionToken,
    body: {
      asset_address: assetAddress,
      asset_value: "1000000",
      nav_per_token: "100",
      subscription_price: "101",
      redemption_price: "96",
      reference_id: "REF-1",
    },
    response: {
      tx_hash: "0xsync-pricing",
      valuation: sampleValuation(),
    },
  },
  {
    name: "anchorDocument puts /admin/oracle/assets/{asset_address}/documents/{document_type}",
    run: client =>
      client.anchorDocument(sessionToken, assetAddress, documentType, {
        document_hash: "0xdochash",
        reference_id: "REF-1",
      }),
    url:
      `${apiBaseUrl}/admin/oracle/assets/${encodeURIComponent(assetAddress)}` +
      `/documents/${encodeURIComponent(documentType)}`,
    method: "PUT",
    token: sessionToken,
    body: {
      document_hash: "0xdochash",
      reference_id: "REF-1",
    },
    response: {
      tx_hash: "0xanchor-document",
      document: sampleDocument(),
    },
  },
];

afterEach(() => {
  globalThis.fetch = originalFetch;
});

for (const endpoint of cases) {
  test(endpoint.name, async () => {
    const client = createOracleClient({ baseUrl: `${apiBaseUrl}/` });
    const calls: FetchCall[] = [];

    installFetchMock(calls, () => jsonResponse(endpoint.response));

    const response = await endpoint.run(client);

    await assertCaseRequest(calls[0], endpoint);
    assert.ok(response);
  });
}
