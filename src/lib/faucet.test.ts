import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createFaucetClient } from "./faucet/index.ts";
import { AUTH_SESSION_STORAGE_KEY } from "./auth/session.ts";
import {
  getHeaders,
  installFetchMock,
  jsonResponse,
  originalFetch,
  type FetchCall,
} from "../../test/http.ts";

const apiBaseUrl = "http://127.0.0.1:8080";
const originalWindow = globalThis.window;

function createMemoryStorage() {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
    return;
  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
    writable: true,
  });
});

test("fetchUsdcBalance sends GET /faucet/usdc/balance", async () => {
  const client = createFaucetClient({ baseUrl: `${apiBaseUrl}/` });
  const calls: FetchCall[] = [];

  installFetchMock(calls, () =>
    jsonResponse({
      token_address: "0xusdc",
      address: "0xwallet",
      balance: "1000000",
      queried_at: "2026-04-30T10:00:00Z",
    }),
  );

  const response = await client.fetchUsdcBalance("0xwallet");

  assert.equal(response.balance, "1000000");
  assert.equal(String(calls[0]?.input), `${apiBaseUrl}/faucet/usdc/balance?address=0xwallet`);

  const headers = getHeaders(calls[0]?.init);
  assert.equal(headers.get("Accept"), "application/json");
});

test("requestUsdc sends POST /faucet/usdc with bearer auth", async () => {
  const client = createFaucetClient({ baseUrl: apiBaseUrl });
  const calls: FetchCall[] = [];

  installFetchMock(calls, () =>
    jsonResponse({
      token_address: "0xusdc",
      recipient: "0xwallet",
      wallet_account_kind: "managed",
      amount: "1000",
      balance: "2000",
      tx_hash: "0xtxhash",
      requested_at: "2026-04-30T10:00:00Z",
      next_available_at: "2026-04-30T11:00:00Z",
      cooldown_seconds: 3600,
    }),
  );

  const response = await client.requestUsdc("session-token");

  assert.equal(response.tx_hash, "0xtxhash");
  assert.equal(String(calls[0]?.input), `${apiBaseUrl}/faucet/usdc`);
  assert.equal(calls[0]?.init?.method, "POST");

  const headers = getHeaders(calls[0]?.init);
  assert.equal(headers.get("Authorization"), "Bearer session-token");
  assert.equal(headers.get("Content-Type"), null);
});

test("requestUsdc reads the stored auth session when no request payload is provided", async () => {
  const client = createFaucetClient({ baseUrl: apiBaseUrl });
  const calls: FetchCall[] = [];
  const storage = createMemoryStorage();

  storage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      token: "stored-session-token",
      user: {
        id: "660e8400-e29b-41d4-a716-446655440000",
        email: null,
        username: "guardrail",
        display_name: "Guardrail",
        avatar_url: null,
        wallet: null,
        created_at: "2026-04-30T10:00:00Z",
        updated_at: "2026-04-30T10:00:00Z",
      },
    }),
  );

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: storage,
    },
    writable: true,
  });

  installFetchMock(calls, () =>
    jsonResponse({
      token_address: "0xusdc",
      recipient: "0xwallet",
      wallet_account_kind: "managed",
      amount: "1000",
      balance: "2000",
      tx_hash: "0xtxhash",
      requested_at: "2026-04-30T10:00:00Z",
      next_available_at: "2026-04-30T11:00:00Z",
      cooldown_seconds: 3600,
    }),
  );

  const response = await client.requestUsdc();

  assert.equal(response.tx_hash, "0xtxhash");
  assert.equal(String(calls[0]?.input), `${apiBaseUrl}/faucet/usdc`);
  assert.equal(calls[0]?.init?.body, undefined);

  const headers = getHeaders(calls[0]?.init);
  assert.equal(headers.get("Authorization"), "Bearer stored-session-token");
  assert.equal(headers.get("Content-Type"), null);
});

test("requestUsdc accepts the legacy payload form by reading the stored auth session", async () => {
  const client = createFaucetClient({ baseUrl: apiBaseUrl });
  const calls: FetchCall[] = [];
  const storage = createMemoryStorage();

  storage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      token: "stored-session-token",
      user: {
        id: "660e8400-e29b-41d4-a716-446655440000",
        email: null,
        username: "guardrail",
        display_name: "Guardrail",
        avatar_url: null,
        wallet: null,
        created_at: "2026-04-30T10:00:00Z",
        updated_at: "2026-04-30T10:00:00Z",
      },
    }),
  );

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: storage,
    },
    writable: true,
  });

  installFetchMock(calls, () =>
    jsonResponse({
      token_address: "0xusdc",
      recipient: "0xwallet",
      wallet_account_kind: "managed",
      amount: "1000",
      balance: "2000",
      tx_hash: "0xtxhash",
      requested_at: "2026-04-30T10:00:00Z",
      next_available_at: "2026-04-30T11:00:00Z",
      cooldown_seconds: 3600,
    }),
  );

  const response = await client.requestUsdc({
    address: "0xwallet",
    amount: "10.5",
  });

  assert.equal(response.tx_hash, "0xtxhash");
  assert.equal(String(calls[0]?.input), `${apiBaseUrl}/faucet/usdc`);
  assert.equal(calls[0]?.init?.body, JSON.stringify({ amount: "10.5" }));

  const headers = getHeaders(calls[0]?.init);
  assert.equal(headers.get("Authorization"), "Bearer stored-session-token");
  assert.equal(headers.get("Content-Type"), "application/json");
});
