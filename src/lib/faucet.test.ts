import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createFaucetClient } from "./faucet/index.ts";
import {
  getHeaders,
  installFetchMock,
  jsonResponse,
  originalFetch,
  type FetchCall,
} from "../../test/http.ts";

const apiBaseUrl = "http://127.0.0.1:8080";

afterEach(() => {
  globalThis.fetch = originalFetch;
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
