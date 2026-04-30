export interface FetchCall {
  input: RequestInfo | URL;
  init?: RequestInit;
}

export const originalFetch = globalThis.fetch;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function installFetchMock(
  calls: FetchCall[],
  handler: (call: FetchCall) => Response | Promise<Response>,
): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { input, init };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
}

export function getHeaders(init?: RequestInit): Headers {
  return new Headers(init?.headers);
}

export async function readRequestJson<T>(init?: RequestInit): Promise<T | undefined> {
  if (init?.body === undefined || init.body === null) {
    return undefined;
  }

  if (typeof init.body !== "string") {
    throw new Error("Expected request body to be a JSON string");
  }

  return JSON.parse(init.body) as T;
}
