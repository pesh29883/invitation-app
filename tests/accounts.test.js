import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import bcrypt from "../server/node_modules/bcryptjs/index.js";
import jwt from "../server/node_modules/jsonwebtoken/index.js";
import { createApp } from "../server/app.js";
import { migrate } from "../server/migrate.js";

const secret = "isolated-account-test-secret-never-used-in-production";
const password = "A-long-test-password-42";
let db, pool, server, baseUrl, hash, sent, mailFailure;
const users = {};

// A one-connection pg.Pool adapter. Tests execute real PostgreSQL SQL and rollback semantics.
function testPool(database) {
  let queue = Promise.resolve();
  const connect = async () => {
    const previous = queue;
    let release;
    queue = new Promise((resolve) => { release = resolve; });
    await previous;
    return { query: (sql, params) => database.query(sql, params), release };
  };
  return { connect, async query(sql, params) { const client = await connect(); try { return await client.query(sql, params); } finally { client.release(); } } };
}

async function request(path, { token, method = "GET", body, origin = baseUrl } = {}) {
  const response = await fetch(`${origin}${path}`, { method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, headers: response.headers, data: await response.json() };
}
const tokenFor = (user, version = 0) => jwt.sign({ id: user.id, version }, secret, { expiresIn: "1h" });
const edit = (user, changes = {}) => ({ name: user.name, email: user.email, role: user.role, status: user.status, currentPassword: password, ...changes });
const resetToken = () => new URLSearchParams(new URL(sent.at(-1).text.match(/https:\/\/[^\s]+/)[0]).hash.slice(1)).get("token");
async function addUser(name, role = "user") {
  const { rows } = await pool.query("INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *", [name, `${name.toLowerCase()}@example.com`, hash, role]);
  return rows[0];
}

describe("Account administration and recovery with PostgreSQL", () => {
  before(async () => {
    db = new PGlite();
    await db.exec(`CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
      CREATE TABLE invitations (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), slug TEXT UNIQUE,
        kind TEXT, title TEXT, message TEXT, event_date TIMESTAMPTZ, location TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE rsvps (id SERIAL PRIMARY KEY, invitation_id INTEGER REFERENCES invitations(id), guest_name TEXT, attending BOOLEAN, created_at TIMESTAMPTZ DEFAULT NOW());`);
    pool = testPool(db);
    await migrate(pool);
    hash = await bcrypt.hash(password, 4);
    const app = createApp({ pool, jwtSecret: secret, clientUrl: "https://invitations.example", mailFrom: "hello@example.com", resetDelayMs: 0,
      mailer: { async sendMail(message) { if (mailFailure) throw new Error("Simulated SMTP failure"); sent.push(message); } },
    });
    server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  beforeEach(async () => {
    await db.exec("TRUNCATE rsvps, invitations, users, account_rate_limits, admin_audit_log RESTART IDENTITY CASCADE");
    sent = []; mailFailure = false;
    users.admin = await addUser("Owner", "admin");
    users.member = await addUser("Member");
  });
  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (db) await db.close();
  });

  test("migrations are repeatable and preserve existing accounts", async () => {
    await migrate(pool);
    const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM users");
    assert.equal(rows[0].count, 2);
  });

  test("recovery explicitly reports unavailable email when SMTP is not configured", async () => {
    const app = createApp({ pool, jwtSecret: secret });
    const listener = await new Promise((resolve) => { const result = app.listen(0, "127.0.0.1", () => resolve(result)); });
    const origin = `http://127.0.0.1:${listener.address().port}`;
    try {
      const result = await request("/api/auth/forgot-password", { origin, method: "POST", body: { email: users.member.email } });
      assert.equal(result.status, 503);
      assert.match(result.data.error, /not available/);
      assert.equal((await request("/api/admin/overview", { origin, token: tokenFor(users.admin) })).data.recoveryAvailable, false);
      assert.equal(sent.length, 0);
    } finally { await new Promise((resolve) => listener.close(resolve)); }
  });

  test("invitation creation, editing, listing, public replies, closing, and deletion still work", async () => {
    const token = tokenFor(users.member);
    const fields = { kind: "Dinner", title: "Friday dinner", eventDate: "2027-01-02T10:00:00Z", location: "Home", message: "See you soon" };
    const created = await request("/api/invitations", { token, method: "POST", body: fields });
    assert.equal(created.status, 201);
    const { id, slug } = created.data;
    assert.equal((await request(`/api/invitations/${id}`, { token, method: "PUT", body: { ...fields, title: "Saturday dinner" } })).status, 200);
    assert.equal((await request(`/api/public/${slug}`)).data.title, "Saturday dinner");
    assert.equal((await request(`/api/public/${slug}/rsvp`, { method: "POST", body: { guestName: "Guest", attending: true } })).status, 201);
    const listed = await request("/api/invitations", { token });
    assert.equal(listed.status, 200);
    assert.equal(listed.data[0].rsvps[0].guestName, "Guest");
    assert.equal((await request(`/api/invitations/${id}`, { token: tokenFor(users.admin), method: "PATCH", body: { isOpen: false } })).status, 404);
    assert.equal((await request(`/api/invitations/${id}`, { token, method: "PATCH", body: { isOpen: false } })).status, 200);
    assert.equal((await request(`/api/public/${slug}/rsvp`, { method: "POST", body: { guestName: "Late Guest", attending: true } })).status, 403);
    await pool.query("DELETE FROM rsvps WHERE invitation_id = $1", [id]);
    assert.equal((await request(`/api/invitations/${id}`, { token, method: "DELETE" })).status, 200);
    assert.equal((await request(`/api/public/${slug}`)).status, 404);
  });

  test("registration ignores forged admin fields and never exposes credentials", async () => {
    const result = await request("/api/auth/register", { method: "POST", body: { name: "New", email: " NEW@example.com ", password, role: "admin", status: "active" } });
    assert.equal(result.status, 201);
    assert.equal(result.data.user.role, "user");
    assert.equal(result.data.user.email, "new@example.com");
    assert.equal(result.data.user.password_hash, undefined);
    assert.equal(result.data.user.password_reset_hash, undefined);
    assert.equal(jwt.verify(result.data.token, secret).version, 0);
  });

  test("every admin endpoint rejects guests and ordinary members", async () => {
    for (const [path, method] of [["/overview", "GET"], ["/users", "GET"], ["/activity", "GET"], [`/users/${users.member.id}`, "PATCH"], [`/users/${users.member.id}/reset-password`, "POST"]]) {
      assert.equal((await request(`/api/admin${path}`, { method, body: method === "GET" ? undefined : {} })).status, 401);
      assert.equal((await request(`/api/admin${path}`, { method, token: tokenFor(users.member), body: method === "GET" ? undefined : {} })).status, 403);
    }
  });

  test("admin listing supports literal search, filters, counts, and pagination", async () => {
    for (let index = 0; index < 21; index++) await addUser(`Guest${index}`);
    const token = tokenFor(users.admin);
    const first = await request("/api/admin/users", { token });
    assert.equal(first.data.total, 23);
    assert.equal(first.data.users.length, 20);
    assert.equal((await request("/api/admin/users?page=2", { token })).data.users.length, 3);
    assert.equal((await request("/api/admin/users?role=admin", { token })).data.total, 1);
    assert.equal((await request("/api/admin/users?search=MEMBER", { token })).data.users[0].id, users.member.id);
    assert.equal((await request("/api/admin/users?search=%25", { token })).data.total, 0);
    assert.equal((await request("/api/admin/overview", { token })).data.active, 23);
    assert.equal(first.data.users.some((user) => "password_hash" in user || "token_version" in user), false);
    assert.equal(first.headers.get("cache-control"), "no-store");
  });

  test("account changes require the acting admin password", async () => {
    const result = await request(`/api/admin/users/${users.member.id}`, { token: tokenFor(users.admin), method: "PATCH", body: edit(users.member, { role: "admin", currentPassword: "wrong" }) });
    assert.equal(result.status, 400);
    assert.equal((await pool.query("SELECT role FROM users WHERE id = $1", [users.member.id])).rows[0].role, "user");
  });

  test("suspension revokes existing sessions, blocks login and public invitations, and is audited", async () => {
    await pool.query("INSERT INTO invitations (user_id, slug, title) VALUES ($1, 'hello', 'Hello')", [users.member.id]);
    const token = tokenFor(users.admin);
    assert.equal((await request(`/api/admin/users/${users.member.id}`, { token, method: "PATCH", body: edit(users.member, { status: "suspended" }) })).status, 200);
    assert.equal((await request("/api/me", { token: tokenFor(users.member) })).status, 401);
    assert.equal((await request("/api/invitations", { token: tokenFor(users.member) })).status, 401);
    assert.equal((await request("/api/auth/login", { method: "POST", body: { email: users.member.email, password } })).status, 401);
    assert.equal((await request("/api/public/hello")).status, 404);
    assert.equal((await request("/api/public/hello/rsvp", { method: "POST", body: { guestName: "Friend", attending: true } })).status, 404);
    const activity = await request("/api/admin/activity", { token });
    assert.equal(activity.data[0].action, "account.updated");
    assert.equal(activity.data[0].details.after.status, "suspended");
    assert.equal(activity.data[0].actor_email, users.admin.email);
  });

  test("reactivation preserves data and does not revive old sessions", async () => {
    const token = tokenFor(users.admin);
    await request(`/api/admin/users/${users.member.id}`, { token, method: "PATCH", body: edit(users.member, { status: "suspended" }) });
    assert.equal((await request(`/api/admin/users/${users.member.id}`, { token, method: "PATCH", body: edit(users.member) })).status, 200);
    assert.equal((await request("/api/me", { token: tokenFor(users.member) })).status, 401);
    const login = await request("/api/auth/login", { method: "POST", body: { email: users.member.email, password } });
    assert.equal(login.status, 200);
    assert.ok(login.data.user.last_login_at);
    assert.equal((await request("/api/me", { token: login.data.token })).status, 200);
  });

  test("self suspension and self demotion cannot remove the final administrator", async () => {
    for (const changes of [{ role: "user" }, { status: "suspended" }]) {
      const result = await request(`/api/admin/users/${users.admin.id}`, { token: tokenFor(users.admin), method: "PATCH", body: edit(users.admin, changes) });
      assert.equal(result.status, 400);
    }
    assert.equal((await request("/api/admin/overview", { token: tokenFor(users.admin) })).data.admins, 1);
  });

  test("concurrent administrator demotions leave an active administrator", async () => {
    const second = await addUser("Second", "admin");
    const results = await Promise.all([
      request(`/api/admin/users/${second.id}`, { token: tokenFor(users.admin), method: "PATCH", body: edit(second, { role: "user" }) }),
      request(`/api/admin/users/${users.admin.id}`, { token: tokenFor(second), method: "PATCH", body: edit(users.admin, { role: "user" }) }),
    ]);
    assert.equal(results.filter((result) => result.status === 200).length, 1);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND status = 'active'")).rows[0].count, 1);
  });

  test("duplicate emails roll back the whole update and leave no success audit", async () => {
    const result = await request(`/api/admin/users/${users.member.id}`, { token: tokenFor(users.admin), method: "PATCH", body: edit(users.member, { email: users.admin.email, status: "suspended" }) });
    assert.equal(result.status, 409);
    assert.equal((await pool.query("SELECT status FROM users WHERE id = $1", [users.member.id])).rows[0].status, "active");
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM admin_audit_log")).rows[0].count, 0);
  });

  test("recovery returns the same message for known, unknown, and suspended accounts", async () => {
    const known = await request("/api/auth/forgot-password", { method: "POST", body: { email: users.member.email } });
    const unknown = await request("/api/auth/forgot-password", { method: "POST", body: { email: "nobody@example.com" } });
    await pool.query("UPDATE users SET status = 'suspended' WHERE id = $1", [users.member.id]);
    const suspended = await request("/api/auth/forgot-password", { method: "POST", body: { email: users.member.email } });
    assert.equal(known.status, 200);
    assert.deepEqual(known.data, unknown.data);
    assert.deepEqual(known.data, suspended.data);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, users.member.email);
    const token = resetToken();
    const stored = (await pool.query("SELECT password_reset_hash, password_reset_expires_at FROM users WHERE id = $1", [users.member.id])).rows[0];
    assert.notEqual(stored.password_reset_hash, token);
    assert.equal(stored.password_reset_hash, crypto.createHash("sha256").update(token).digest("hex"));
    assert.ok(new Date(stored.password_reset_expires_at) > new Date());
    assert.equal("token" in known.data, false);
  });

  test("reset links are single-use and invalidate previous sessions and passwords", async () => {
    await request("/api/auth/forgot-password", { method: "POST", body: { email: users.member.email } });
    const token = resetToken();
    const body = { token, password: "A-different-password-43" };
    assert.equal((await request("/api/auth/reset-password", { method: "POST", body })).status, 200);
    assert.equal((await request("/api/auth/reset-password", { method: "POST", body })).status, 400);
    assert.equal((await request("/api/me", { token: tokenFor(users.member) })).status, 401);
    assert.equal((await request("/api/auth/login", { method: "POST", body: { email: users.member.email, password } })).status, 401);
    assert.equal((await request("/api/auth/login", { method: "POST", body: { email: users.member.email, password: body.password } })).status, 200);
  });

  test("simultaneous uses of one reset link allow exactly one password change", async () => {
    await request("/api/auth/forgot-password", { method: "POST", body: { email: users.member.email } });
    const token = resetToken();
    const results = await Promise.all(["One-new-password-42", "Another-new-password-43"].map((nextPassword) => request("/api/auth/reset-password", { method: "POST", body: { token, password: nextPassword } })));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 400]);
  });

  test("expired, malformed, and suspended-account reset links are rejected", async () => {
    await request("/api/auth/forgot-password", { method: "POST", body: { email: users.member.email } });
    const token = resetToken();
    await pool.query("UPDATE users SET password_reset_expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [users.member.id]);
    assert.equal((await request("/api/auth/reset-password", { method: "POST", body: { token, password } })).status, 400);
    assert.equal((await request("/api/auth/reset-password", { method: "POST", body: { token: "bad", password } })).status, 400);
    await pool.query("UPDATE users SET status = 'suspended', password_reset_expires_at = NOW() + INTERVAL '10 minutes' WHERE id = $1", [users.member.id]);
    assert.equal((await request("/api/auth/reset-password", { method: "POST", body: { token, password } })).status, 400);
  });

  test("reset mail cooldown avoids repeated emails while keeping the public response identical", async () => {
    for (let index = 0; index < 5; index++) assert.equal((await request("/api/auth/forgot-password", { method: "POST", body: { email: users.member.email } })).status, 200);
    assert.equal(sent.length, 1);
  });

  test("IP throttling is stored in the database and survives app requests", async () => {
    for (let index = 0; index < 10; index++) await request("/api/auth/forgot-password", { method: "POST", body: { email: "nobody@example.com" } });
    const blocked = await request("/api/auth/forgot-password", { method: "POST", body: { email: "nobody@example.com" } });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "900");
    assert.ok((await pool.query("SELECT COUNT(*)::int AS count FROM account_rate_limits")).rows[0].count > 0);
  });

  test("SMTP failure leaves no usable reset token and does not reveal the account", async () => {
    mailFailure = true;
    const result = await request("/api/auth/forgot-password", { method: "POST", body: { email: users.member.email } });
    assert.equal(result.status, 200);
    assert.equal((await pool.query("SELECT password_reset_hash FROM users WHERE id = $1", [users.member.id])).rows[0].password_reset_hash, null);
  });

  test("admin reset emails require reauthentication and produce an activity entry", async () => {
    const path = `/api/admin/users/${users.member.id}/reset-password`;
    assert.equal((await request(path, { token: tokenFor(users.admin), method: "POST", body: {} })).status, 400);
    assert.equal((await request(path, { token: tokenFor(users.admin), method: "POST", body: { currentPassword: password } })).status, 200);
    assert.equal(sent.length, 1);
    assert.equal((await request("/api/admin/activity", { token: tokenFor(users.admin) })).data[0].action, "password.reset_requested");
  });

  test("password change rotates the current token and ends other sessions", async () => {
    const oldToken = tokenFor(users.member);
    const result = await request("/api/me/password", { token: oldToken, method: "PATCH", body: { currentPassword: password, newPassword: "A-new-profile-password-44" } });
    assert.equal(result.status, 200);
    assert.equal((await request("/api/me", { token: oldToken })).status, 401);
    assert.equal((await request("/api/me", { token: result.data.token })).status, 200);
    assert.equal(result.data.user.role, "user");
  });

  test("profile updates retain roles and invalidate reset links after an email change", async () => {
    await request("/api/auth/forgot-password", { method: "POST", body: { email: users.admin.email } });
    const token = resetToken();
    const result = await request("/api/me", { token: tokenFor(users.admin), method: "PATCH", body: { name: "Owner", email: "newowner@example.com", currentPassword: password, role: "user" } });
    assert.equal(result.status, 200);
    assert.equal(result.data.role, "admin");
    assert.equal((await request("/api/me", { token: tokenFor(users.admin) })).status, 401);
    assert.equal((await request("/api/me", { token: result.data.token })).status, 200);
    assert.equal((await request("/api/auth/reset-password", { method: "POST", body: { token, password } })).status, 400);
  });

  test("password setters reject bcrypt truncation", async () => {
    assert.equal((await request("/api/auth/register", { method: "POST", body: { name: "TooLong", email: "long@example.com", password: "a".repeat(73) } })).status, 400);
    assert.equal((await request("/api/me/password", { method: "PATCH", token: tokenFor(users.member), body: { currentPassword: password, newPassword: "😀".repeat(20) } })).status, 400);
  });
});
