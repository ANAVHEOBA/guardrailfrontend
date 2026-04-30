import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  ApiError,
  buildApiUrl,
  normalizeApiBaseUrl,
  requestJson,
} from "./api.ts";
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

test("normalizeApiBaseUrl trims trailing slashes", () => {
  assert.equal(normalizeApiBaseUrl("http://127.0.0.1:8080///"), "http://127.0.0.1:8080");
  assert.equal(normalizeApiBaseUrl(undefined), "");
});

test("buildApiUrl appends query params and skips nullish values", () => {
  const url = buildApiUrl("http://127.0.0.1:8080", "/assets", {
    q: "fund",
    featured: true,
    limit: 20,
    offset: 0,
    ignored: undefined,
    omitted: null,
  });

  assert.equal(
    url,
    "http://127.0.0.1:8080/assets?q=fund&featured=true&limit=20&offset=0",
  );
});

test("requestJson sends JSON payloads with Accept and Content-Type headers", async () => {
  const calls: FetchCall[] = [];

  installFetchMock(calls, () =>
    jsonResponse({
      ok: true,
    }),
  );

  const response = await requestJson<{ ok: boolean }>("http://127.0.0.1:8080", "/auth/me", {
    method: "POST",
    json: {
      token: "session-token",
    },
  });

  assert.equal(response.ok, true);
  assert.equal(String(calls[0]?.input), "http://127.0.0.1:8080/auth/me");
  assert.equal(calls[0]?.init?.method, "POST");

  const headers = getHeaders(calls[0]?.init);
  assert.equal(headers.get("Accept"), "application/json");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(calls[0]?.init?.body, JSON.stringify({ token: "session-token" }));
});

test("requestJson returns undefined for 204 responses", async () => {
  const calls: FetchCall[] = [];

  installFetchMock(calls, () => new Response(null, { status: 204 }));

  const response = await requestJson<void>("http://127.0.0.1:8080", "/health");

  assert.equal(response, undefined);
  assert.equal(String(calls[0]?.input), "http://127.0.0.1:8080/health");
});

test("requestJson surfaces backend error payloads as ApiError", async () => {
  const calls: FetchCall[] = [];

  installFetchMock(calls, () => jsonResponse({ error: "username already taken" }, 409));

  await assert.rejects(
    () =>
      requestJson("http://127.0.0.1:8080", "/auth/wallet/connect", {
        method: "POST",
        json: {
          challenge_id: "challenge-id",
          signature: "signed-message",
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 409);
      assert.equal(error.message, "username already taken");
      return true;
    },
  );
});
