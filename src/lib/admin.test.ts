import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createAdminClient } from "./admin/index.ts";
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
    username: "guardrail-admin",
    display_name: "Guardrail Admin",
    avatar_url: null,
    wallet: {
      wallet_address: "0xadmin",
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

test("createWalletChallenge posts /admin/auth/wallet/challenge", async () => {
  const client = createAdminClient({ baseUrl: `${apiBaseUrl}/` });
  const calls: FetchCall[] = [];

  installFetchMock(calls, () =>
    jsonResponse({
      challenge_id: challengeId,
      message: "Sign this admin message",
      expires_at: "2026-04-30T10:05:00Z",
    }),
  );

  const response = await client.createWalletChallenge({
    wallet_address: "0xadmin",
  });

  assert.equal(response.challenge_id, challengeId);
  assert.equal(String(calls[0]?.input), `${apiBaseUrl}/admin/auth/wallet/challenge`);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(await readRequestJson(calls[0]?.init), {
    wallet_address: "0xadmin",
  });
});

test("connectWallet posts /admin/auth/wallet/connect", async () => {
  const client = createAdminClient({ baseUrl: apiBaseUrl });
  const calls: FetchCall[] = [];

  installFetchMock(calls, () =>
    jsonResponse({
      token: "admin-token",
      user: sampleUser(),
    }),
  );

  const response = await client.connectWallet({
    challenge_id: challengeId,
    signature: "signed-message",
    username: "guardrail-admin",
  });

  assert.equal(response.user.username, "guardrail-admin");
  assert.equal(String(calls[0]?.input), `${apiBaseUrl}/admin/auth/wallet/connect`);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(await readRequestJson(calls[0]?.init), {
    challenge_id: challengeId,
    signature: "signed-message",
    username: "guardrail-admin",
  });
});

test("fetchMe sends GET /admin/me with bearer auth", async () => {
  const client = createAdminClient({ baseUrl: apiBaseUrl });
  const calls: FetchCall[] = [];

  installFetchMock(calls, () =>
    jsonResponse({
      user: sampleUser(),
      monad_chain_id: 10143,
    }),
  );

  const response = await client.fetchMe("admin-session");

  assert.equal(response.monad_chain_id, 10143);
  assert.equal(String(calls[0]?.input), `${apiBaseUrl}/admin/me`);

  const headers = getHeaders(calls[0]?.init);
  assert.equal(headers.get("Authorization"), "Bearer admin-session");
  assert.equal(headers.get("Accept"), "application/json");
});

test("uploadImage posts multipart data to /admin/uploads/images", async () => {
  const client = createAdminClient({ baseUrl: apiBaseUrl });
  const calls: FetchCall[] = [];

  installFetchMock(calls, () =>
    jsonResponse({
      asset: {
        id: "upload-1",
        storage_provider: "filebase",
        bucket_name: "guardrail-assets",
        scope: "branding",
        file_name: "logo.png",
        content_type: "image/png",
        size_bytes: 12,
        cid: "bafy123",
        ipfs_url: "ipfs://bafy123",
        gateway_url: "https://ipfs.filebase.io/ipfs/bafy123",
        created_at: "2026-04-30T10:10:00Z",
      },
    }),
  );

  const response = await client.uploadImage("admin-session", {
    file: new Blob(["hello world"], { type: "image/png" }),
    file_name: "logo.png",
    scope: "branding",
  });

  assert.equal(response.asset.cid, "bafy123");
  assert.equal(String(calls[0]?.input), `${apiBaseUrl}/admin/uploads/images`);
  assert.equal(calls[0]?.init?.method, "POST");

  const headers = getHeaders(calls[0]?.init);
  assert.equal(headers.get("Authorization"), "Bearer admin-session");
  assert.equal(headers.get("Accept"), "application/json");
  assert.equal(headers.get("Content-Type"), null);

  assert.ok(calls[0]?.init?.body instanceof FormData);
  const formData = calls[0].init.body;
  const file = formData.get("file");
  assert.ok(file instanceof File);
  assert.equal(file.name, "logo.png");
  assert.equal(await file.text(), "hello world");
  assert.equal(formData.get("scope"), "branding");
  assert.equal(formData.get("folder"), null);
});
