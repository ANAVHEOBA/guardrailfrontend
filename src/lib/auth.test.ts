import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createAuthClient } from "./auth/index.ts";
import {
  getHeaders,
  installFetchMock,
  jsonResponse,
  originalFetch,
  readRequestJson,
  type FetchCall,
} from "../../test/http.ts";

const apiBaseUrl = "http://127.0.0.1:8080";
const challengeId = "550e8400-e29b-41d4-a716-446655440000";

function sampleUser() {
  return {
    id: "660e8400-e29b-41d4-a716-446655440000",
    email: "admin@example.com",
    username: "guardrail",
    display_name: "Guardrail",
    avatar_url: null,
    wallet: {
      wallet_address: "0x1234",
      chain_id: 10143,
      account_kind: "managed",
      owner_address: null,
      owner_provider: null,
      factory_address: "0xfactory",
      entry_point_address: "0xentry",
      created_at: "2026-04-30T10:00:00Z",
    },
    created_at: "2026-04-30T10:00:00Z",
    updated_at: "2026-04-30T10:00:00Z",
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("signInWithGoogle posts /auth/google/sign-in", async () => {
  const client = createAuthClient({ baseUrl: `${apiBaseUrl}/` });
  const calls: FetchCall[] = [];

  installFetchMock(calls, () =>
    jsonResponse({
      token: "jwt-token",
      user: sampleUser(),
    }),
  );

  const response = await client.signInWithGoogle({
    credential: "google-credential",
    g_csrf_token: "csrf-token",
    client_id: "client-id",
  });

  assert.equal(response.token, "jwt-token");
  assert.equal(String(calls[0]?.input), `${apiBaseUrl}/auth/google/sign-in`);
  assert.equal(calls[0]?.init?.method, "POST");

  const headers = getHeaders(calls[0]?.init);
  assert.equal(headers.get("Accept"), "application/json");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.deepEqual(await readRequestJson(calls[0]?.init), {
    credential: "google-credential",
    g_csrf_token: "csrf-token",
    client_id: "client-id",
  });
});

test("createWalletChallenge posts /auth/wallet/challenge", async () => {
  const client = createAuthClient({ baseUrl: apiBaseUrl });
  const calls: FetchCall[] = [];

  installFetchMock(calls, () =>
    jsonResponse({
      challenge_id: challengeId,
      message: "Sign this message",
      expires_at: "2026-04-30T10:05:00Z",
    }),
  );

  const response = await client.createWalletChallenge({
    wallet_address: "0x1234",
  });

  assert.equal(response.challenge_id, challengeId);
  assert.equal(String(calls[0]?.input), `${apiBaseUrl}/auth/wallet/challenge`);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(await readRequestJson(calls[0]?.init), {
    wallet_address: "0x1234",
  });
});

test("connectWallet posts /auth/wallet/connect", async () => {
  const client = createAuthClient({ baseUrl: apiBaseUrl });
  const calls: FetchCall[] = [];

  installFetchMock(calls, () =>
    jsonResponse({
      token: "wallet-token",
      user: sampleUser(),
    }),
  );

  const response = await client.connectWallet({
    challenge_id: challengeId,
    signature: "signed-message",
    username: "guardrail",
  });

  assert.equal(response.user.username, "guardrail");
  assert.equal(String(calls[0]?.input), `${apiBaseUrl}/auth/wallet/connect`);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(await readRequestJson(calls[0]?.init), {
    challenge_id: challengeId,
    signature: "signed-message",
    username: "guardrail",
  });
});

test("fetchMe sends GET /auth/me with bearer auth", async () => {
  const client = createAuthClient({ baseUrl: apiBaseUrl });
  const calls: FetchCall[] = [];

  installFetchMock(calls, () =>
    jsonResponse({
      user: sampleUser(),
    }),
  );

  const response = await client.fetchMe("session-token");

  assert.equal(response.user.id, sampleUser().id);
  assert.equal(String(calls[0]?.input), `${apiBaseUrl}/auth/me`);

  const headers = getHeaders(calls[0]?.init);
  assert.equal(headers.get("Accept"), "application/json");
  assert.equal(headers.get("Authorization"), "Bearer session-token");
  assert.equal(headers.get("Content-Type"), null);
});
