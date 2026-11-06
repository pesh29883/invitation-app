import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/api.js";
import { clearSession, saveSession, SESSION_EXPIRED } from "../src/session.js";

describe("API requests", () => {
beforeEach(() => { globalThis.window = new EventTarget(); });
afterEach(() => { clearSession(); delete globalThis.window; mock.restoreAll(); });

test("authenticated requests include the token and JSON body", async () => {
  const token = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.signature`;
  saveSession(token, { id: 1, name: "Alex", email: "alex@example.com" });
  const request = mock.method(globalThis, "fetch", async () => Response.json({ ok: true }));
  assert.deepEqual(await api("/api/invitations", { auth: true, method: "POST", body: { title: "Dinner" } }), { ok: true });
  const [url, options] = request.mock.calls[0].arguments;
  assert.equal(url, "http://localhost:3001/api/invitations");
  assert.equal(options.headers.Authorization, `Bearer ${token}`);
  assert.equal(options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(options.body), { title: "Dinner" });
});

test("expired API authorization triggers sign-out across protected pages", async () => {
  let expired = false;
  window.addEventListener(SESSION_EXPIRED, () => { expired = true; });
  mock.method(globalThis, "fetch", async () => Response.json({ error: "Your session expired." }, { status: 401 }));
  await assert.rejects(api("/api/invitations", { auth: true }), { status: 401, message: "Your session expired." });
  assert.equal(expired, true);
});

test("an incorrect login shows its error without triggering session expiry", async () => {
  let expired = false;
  window.addEventListener(SESSION_EXPIRED, () => { expired = true; });
  mock.method(globalThis, "fetch", async () => Response.json({ error: "Email or password is incorrect." }, { status: 401 }));
  await assert.rejects(api("/api/auth/login", { method: "POST", body: {} }), { status: 401 });
  assert.equal(expired, false);
});

test("a delayed rejection for an old token cannot sign out a newly rotated session", async () => {
  const token = (expiry) => `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiry })).toString("base64url")}.signature`;
  const user = { id: 1, name: "Alex", email: "alex@example.com" };
  saveSession(token(3600), user);
  let finish;
  mock.method(globalThis, "fetch", () => new Promise((resolve) => { finish = resolve; }));
  let expired = false;
  window.addEventListener(SESSION_EXPIRED, () => { expired = true; });
  const request = api("/api/me", { auth: true });
  saveSession(token(7200), user);
  finish(Response.json({ error: "Session ended." }, { status: 401 }));
  await assert.rejects(request, { status: 401 });
  assert.equal(expired, false);
});

test("network failures retain a useful message and original cause", async () => {
  const cause = new TypeError("Failed to fetch");
  mock.method(globalThis, "fetch", async () => { throw cause; });
  await assert.rejects(api("/api/health"), (error) => error.cause === cause && error.message.includes("Can't reach the server"));
});

test("a timeout gives the user a retry message", async () => {
  mock.method(globalThis, "fetch", async () => { throw new DOMException("Timed out", "TimeoutError"); });
  await assert.rejects(api("/api/health"), /took too long/);
});

test("navigation cancellation is passed through instead of shown as a network failure", async () => {
  const controller = new AbortController();
  controller.abort();
  mock.method(globalThis, "fetch", async (_url, options) => { options.signal.throwIfAborted(); });
  await assert.rejects(api("/api/invitations", { signal: controller.signal }), { name: "AbortError" });
});
});
