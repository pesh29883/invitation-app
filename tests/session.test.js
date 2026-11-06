import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { clearSession, getToken, readSession, saveSession, updateSessionUser } from "../src/session.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const user = { id: 4, name: "Alex Rivera", email: "alex@example.com" };
const tokenWithExpiry = (seconds) => `header.${Buffer.from(JSON.stringify({ id: user.id, exp: Math.floor(Date.now() / 1000) + seconds })).toString("base64url")}.signature`;

describe("Browser sessions", () => {
beforeEach(() => {
  globalThis.window = { localStorage: createStorage(), sessionStorage: createStorage() };
  clearSession();
});
afterEach(() => { clearSession(); delete globalThis.window; });

test("remembered sign-in persists the token and user together", () => {
  const token = tokenWithExpiry(3600);
  saveSession(token, user, true);
  assert.equal(window.localStorage.getItem("invitations-token"), token);
  assert.equal(window.sessionStorage.getItem("invitations-token"), null);
  assert.deepEqual(readSession(), { token, user });
});

test("unchecking keep-signed-in replaces an existing persistent session", () => {
  saveSession(tokenWithExpiry(3600), user, true);
  const token = tokenWithExpiry(7200);
  saveSession(token, user, false);
  assert.equal(window.localStorage.getItem("invitations-token"), null);
  assert.equal(window.localStorage.getItem("invitations-user"), null);
  assert.equal(window.sessionStorage.getItem("invitations-token"), token);
  assert.equal(getToken(), token);
});

test("expired tokens clear both stored identity and credentials", () => {
  saveSession(tokenWithExpiry(-60), user);
  assert.equal(readSession(), null);
  assert.equal(window.localStorage.getItem("invitations-user"), null);
  assert.equal(window.localStorage.getItem("invitations-token"), null);
});

test("malformed tokens never restore an authenticated session", () => {
  saveSession("not-a-token", user);
  assert.equal(getToken(), undefined);
  assert.equal(readSession(), null);
});

test("a cached user without a token cannot restore a session", () => {
  window.localStorage.setItem("invitations-user", JSON.stringify(user));
  assert.equal(readSession(), null);
});

test("profile changes preserve the selected session storage", () => {
  const token = tokenWithExpiry(3600);
  saveSession(token, user, false);
  const updated = { ...user, name: "Alex Chen" };
  updateSessionUser(updated);
  assert.deepEqual(readSession(), { token, user: updated });
  assert.equal(JSON.parse(window.sessionStorage.getItem("invitations-user")).name, updated.name);
  assert.equal(window.localStorage.getItem("invitations-token"), null);
});

test("sign-in and sign-out still work when browser storage is blocked", () => {
  Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage disabled"); } });
  Object.defineProperty(window, "sessionStorage", { get() { throw new Error("Storage disabled"); } });
  const token = tokenWithExpiry(3600);
  assert.doesNotThrow(() => saveSession(token, user));
  assert.equal(getToken(), token);
  clearSession();
  assert.equal(readSession(), null);
});
});
