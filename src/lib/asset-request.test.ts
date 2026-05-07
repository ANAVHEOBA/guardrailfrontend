import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { createAssetRequestClient } from "./asset-request/index.ts";

const apiBaseUrl = "http://127.0.0.1:8080";
const sampleRequestId = "550e8400-e29b-41d4-a716-446655440000";

interface FetchCall {
  input: RequestInfo | URL;
  init?: RequestInit;
}

const originalFetch = globalThis.fetch;
let calls: FetchCall[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function sampleAssetRequestResponse() {
  return {
    id: sampleRequestId,
    proposal_id: "101",
    submitted_by_user_id: "110e8400-e29b-41d4-a716-446655440000",
    issuer_name: "Acme Infrastructure",
    contact_name: "Jamie Doe",
    contact_email: "jamie@example.com",
    issuer_website: "https://acme.example.com",
    issuer_country: "US",
    asset_name: "Acme Growth Note",
    asset_type_id: "0x61737365745f7479706500000000000000000000000000000000000000000000",
    asset_type_id_text: "asset_type",
    description: "A private credit note backed by revenue contracts.",
    target_raise: "2500000",
    currency: "USD",
    maturity_date: "2027-03-31",
    expected_yield_bps: 1250,
    redemption_summary: "Quarterly redemption window after a 12 month lockup.",
    valuation_source: "Monthly NAV from issuer administrator.",
    document_urls: ["https://example.com/deck.pdf"],
    token_symbol: "ACME",
    max_supply: "1000000",
    subscription_price: "1.00",
    redemption_price: "1.02",
    self_service_purchase_enabled: true,
    metadata_hash: null,
    metadata_hash_text: null,
    slug: "acme-growth-note",
    image_url: "https://example.com/acme.png",
    market_segment: "private-credit",
    suggested_internal_tags: ["yield", "private-credit"],
    source_urls: ["https://example.com/source"],
    status: "submitted",
    review_notes: null,
    reviewed_by_user_id: null,
    reviewed_at: null,
    deployed_by_user_id: null,
    deployed_at: null,
    deployed_asset_address: null,
    deployment_tx_hash: null,
    created_at: "2026-05-07T12:00:00Z",
    updated_at: "2026-05-07T12:00:00Z",
  };
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("listMyAssetRequests sends authenticated GET /asset-requests/me with query params", async () => {
  const client = createAssetRequestClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return jsonResponse({
      asset_requests: [sampleAssetRequestResponse()],
      limit: 10,
      offset: 0,
    });
  }) as typeof fetch;

  const response = await client.listMyAssetRequests("session-token", {
    status: "submitted",
    limit: 10,
    offset: 0,
  });

  assert.equal(response.asset_requests[0]?.asset_name, "Acme Growth Note");
  assert.equal(
    String(calls[0]?.input),
    "http://127.0.0.1:8080/asset-requests/me?status=submitted&limit=10&offset=0",
  );
  assert.equal(calls[0]?.init?.method, undefined);

  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer session-token");
  assert.equal(headers.get("Accept"), "application/json");
});

test("fetchAssetRequest sends authenticated GET /asset-requests/{requestId}", async () => {
  const client = createAssetRequestClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return jsonResponse(sampleAssetRequestResponse());
  }) as typeof fetch;

  const response = await client.fetchAssetRequest("session-token", sampleRequestId);

  assert.equal(response.proposal_id, "101");
  assert.equal(
    String(calls[0]?.input),
    `http://127.0.0.1:8080/asset-requests/${sampleRequestId}`,
  );
  assert.equal(calls[0]?.init?.method, undefined);

  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer session-token");
  assert.equal(headers.get("Accept"), "application/json");
});

test("createAssetRequest posts an authenticated payload to /asset-requests", async () => {
  const client = createAssetRequestClient({ baseUrl: apiBaseUrl });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return jsonResponse(sampleAssetRequestResponse());
  }) as typeof fetch;

  const response = await client.createAssetRequest("session-token", {
    issuer_name: "Acme Infrastructure",
    contact_name: "Jamie Doe",
    contact_email: "jamie@example.com",
    asset_name: "Acme Growth Note",
    asset_type_id: "private-credit",
    description: "A private credit note backed by revenue contracts.",
    token_symbol: "ACME",
    max_supply: "1000000",
    subscription_price: "1.00",
    redemption_price: "1.02",
    self_service_purchase_enabled: true,
    document_urls: ["https://example.com/deck.pdf"],
    source_urls: ["https://example.com/source"],
  });

  assert.equal(response.status, "submitted");
  assert.equal(String(calls[0]?.input), "http://127.0.0.1:8080/asset-requests");
  assert.equal(calls[0]?.init?.method, "POST");

  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer session-token");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(
    calls[0]?.init?.body,
    JSON.stringify({
      issuer_name: "Acme Infrastructure",
      contact_name: "Jamie Doe",
      contact_email: "jamie@example.com",
      asset_name: "Acme Growth Note",
      asset_type_id: "private-credit",
      description: "A private credit note backed by revenue contracts.",
      token_symbol: "ACME",
      max_supply: "1000000",
      subscription_price: "1.00",
      redemption_price: "1.02",
      self_service_purchase_enabled: true,
      document_urls: ["https://example.com/deck.pdf"],
      source_urls: ["https://example.com/source"],
    }),
  );
});
