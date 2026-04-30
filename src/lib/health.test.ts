import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createHealthClient } from "./health/index.ts";
import {
  getHeaders,
  installFetchMock,
  jsonResponse,
  originalFetch,
  type FetchCall,
} from "../../test/http.ts";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("fetchHealth sends GET /health", async () => {
  const client = createHealthClient({ baseUrl: "http://127.0.0.1:8080/" });
  const calls: FetchCall[] = [];

  installFetchMock(calls, () => jsonResponse({ status: "ok" }));

  const response = await client.fetchHealth();

  assert.equal(response.status, "ok");
  assert.equal(String(calls[0]?.input), "http://127.0.0.1:8080/health");
  assert.equal(calls[0]?.init?.method, undefined);

  const headers = getHeaders(calls[0]?.init);
  assert.equal(headers.get("Accept"), "application/json");
  assert.equal(headers.get("Authorization"), null);
});
