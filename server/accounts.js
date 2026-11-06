import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { setTimeout as delay } from "node:timers/promises";
import { transaction } from "./migrate.js";

const PUBLIC_FIELDS = "id, name, email, role, status, created_at, last_login_at";
const RESET_MESSAGE = "If an active account uses that email, a password reset link will arrive shortly. Check your spam folder too.";
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const validEmail = (value) => value.length <= 254 && /^\S+@\S+\.\S+$/.test(value);
// bcrypt stores at most 72 bytes. Reject truncation in every password-setting flow.
const validPassword = (value) => value.length >= 8 && Buffer.byteLength(value, "utf8") <= 72;
const PASSWORD_MESSAGE = "Use at least 8 characters and no more than 72 bytes for your password.";
const safeUser = (user) => Object.fromEntries(PUBLIC_FIELDS.split(", ").map((key) => [key, user[key]]));
const httpError = (status, message) => Object.assign(new Error(message), { status });
const route = (handler) => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next);

export function installAccountRoutes(app, { pool, mailer, jwtSecret, clientUrl, mailFrom, resetDelayMs }) {
  const signToken = (user) => jwt.sign({ id: user.id, version: user.token_version }, jwtSecret, { expiresIn: "7d" });

  async function takeLimit(key, maximum, seconds = 900) {
    await pool.query("DELETE FROM account_rate_limits WHERE reset_at <= NOW()");
    const { rows } = await pool.query(`INSERT INTO account_rate_limits (bucket, attempts, reset_at)
      VALUES ($1, 1, NOW() + $2 * INTERVAL '1 second')
      ON CONFLICT (bucket) DO UPDATE SET
        attempts = CASE WHEN account_rate_limits.reset_at <= NOW() THEN 1 ELSE account_rate_limits.attempts + 1 END,
        reset_at = CASE WHEN account_rate_limits.reset_at <= NOW() THEN EXCLUDED.reset_at ELSE account_rate_limits.reset_at END
      RETURNING attempts`, [digest(key), seconds]);
    return rows[0].attempts <= maximum;
  }

  const rateLimit = (scope, maximum) => (req, res, next) => {
    takeLimit(`${scope}:${req.ip}`, maximum).then((allowed) => {
      if (allowed) return next();
      res.set("Retry-After", "900");
      next(httpError(429, "Too many attempts. Please try again in 15 minutes."));
    }).catch(next);
  };

  const requireAuth = (req, res, next) => {
    (async () => {
      const header = req.headers.authorization || "";
      let payload;
      try {
        if (!header.startsWith("Bearer ")) throw new Error();
        payload = jwt.verify(header.slice(7), jwtSecret, { algorithms: ["HS256"] });
        if (!payload.id) throw new Error();
      } catch { throw httpError(401, "Your session expired. Log in again."); }
      const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [payload.id]);
      const user = rows[0];
      if (!user || user.status !== "active" || (payload.version ?? 0) !== user.token_version)
        throw httpError(401, "Your session ended. Log in again or contact an administrator.");
      req.user = user;
      req.userId = user.id;
      next();
    })().catch(next);
  };
  const requireAdmin = (req, res, next) => req.user.role === "admin" ? next() : next(httpError(403, "Administrator access is required."));

  async function verifyAdminPassword(req) {
    if (!(await takeLimit(`admin:${req.userId}`, 15))) throw httpError(429, "Too many attempts. Please try again in 15 minutes.");
    if (!(await bcrypt.compare(String(req.body.currentPassword || ""), req.user.password_hash)))
      throw httpError(400, "Enter your current password to confirm this action.");
  }

  async function audit(client, actor, target, action, details = {}) {
    await client.query("INSERT INTO admin_audit_log (actor_email, target_email, action, details) VALUES ($1, $2, $3, $4)",
      [actor, target, action, JSON.stringify(details)]);
  }

  async function sendReset(user) {
    const token = crypto.randomBytes(32).toString("hex");
    const hash = digest(token);
    // A concurrent request cannot replace a just-issued link across API instances.
    const { rows } = await pool.query(`UPDATE users SET password_reset_hash = $1,
      password_reset_expires_at = NOW() + INTERVAL '30 minutes'
      WHERE id = $2 AND status = 'active' AND email = $3
        AND (password_reset_hash IS NULL OR password_reset_expires_at < NOW() + INTERVAL '29 minutes')
      RETURNING id`, [hash, user.id, user.email]);
    if (!rows[0]) return false;
    const url = new URL("/reset-password", clientUrl);
    // Fragments stay out of web server logs and Referer headers.
    url.hash = `token=${token}`;
    try {
      await mailer.sendMail({ from: mailFrom, to: user.email, subject: "Reset your Invitations password",
        text: `Hi ${user.name},\n\nReset your password here:\n${url.href}\n\nThis link expires in 30 minutes and can be used once. If you did not request this, you can ignore this email.\n` });
    } catch (error) {
      await pool.query("UPDATE users SET password_reset_hash = NULL, password_reset_expires_at = NULL WHERE id = $1 AND password_reset_hash = $2", [user.id, hash]);
      throw error;
    }
    return true;
  }

  app.post("/api/auth/register", rateLimit("register", 20), route(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!name || name.length > 100) throw httpError(400, "Enter a name of up to 100 characters.");
    if (!validEmail(email)) throw httpError(400, "Enter a valid email address.");
    if (!validPassword(password)) throw httpError(400, PASSWORD_MESSAGE);
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query("INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING *", [name, email, hash]);
    res.status(201).json({ token: signToken(rows[0]), user: safeUser(rows[0]) });
  }));

  app.post("/api/auth/login", rateLimit("login", 40), route(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!(await takeLimit(`login-email:${email}`, 15))) throw httpError(429, "Too many attempts. Please try again in 15 minutes.");
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = rows[0];
    // Do comparable bcrypt work for unknown email addresses.
    const matches = await bcrypt.compare(password, user?.password_hash || "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy");
    if (!user || !matches || user.status !== "active") throw httpError(401, "Email or password is incorrect, or this account is unavailable.");
    const { rows: updated } = await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1 RETURNING *", [user.id]);
    res.json({ token: signToken(updated[0]), user: safeUser(updated[0]) });
  }));

  app.post("/api/auth/forgot-password", rateLimit("forgot", 10), route(async (req, res) => {
    const started = Date.now();
    if (!mailer || !mailFrom) throw httpError(503, "Password recovery email is not available yet. Please contact an administrator.");
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!validEmail(email)) throw httpError(400, "Enter a valid email address.");
    try {
      const allowed = await takeLimit(`forgot-email:${email}`, 3);
      const { rows } = await pool.query("SELECT id, name, email FROM users WHERE email = $1 AND status = 'active'", [email]);
      if (allowed && rows[0]) await sendReset(rows[0]);
    } catch (error) {
      // Preserve the public response for delivery failures and unknown accounts.
      console.error("Password recovery failed:", error.code || "delivery unavailable");
    }
    await delay(Math.max(0, resetDelayMs - (Date.now() - started)));
    res.json({ message: RESET_MESSAGE });
  }));

  app.post("/api/auth/reset-password", rateLimit("reset", 20), route(async (req, res) => {
    const token = String(req.body.token || "");
    const password = String(req.body.password || "");
    if (!/^[a-f0-9]{64}$/.test(token)) throw httpError(400, "This reset link is invalid or has expired. Request a new one.");
    if (!validPassword(password)) throw httpError(400, PASSWORD_MESSAGE);
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(`UPDATE users SET password_hash = $1, token_version = token_version + 1,
      password_reset_hash = NULL, password_reset_expires_at = NULL
      WHERE password_reset_hash = $2 AND password_reset_expires_at > NOW() AND status = 'active' RETURNING id`, [hash, digest(token)]);
    if (!rows[0]) throw httpError(400, "This reset link is invalid or has expired. Request a new one.");
    res.json({ ok: true });
  }));

  app.get("/api/me", requireAuth, (req, res) => res.json(safeUser(req.user)));
  app.patch("/api/me", requireAuth, route(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!name || name.length > 100) throw httpError(400, "Enter a name of up to 100 characters.");
    if (!validEmail(email)) throw httpError(400, "Enter a valid email address.");
    if (email !== req.user.email) {
      if (!(await takeLimit(`profile:${req.userId}`, 15))) throw httpError(429, "Too many attempts. Please try again later.");
      if (!(await bcrypt.compare(String(req.body.currentPassword || ""), req.user.password_hash)))
        throw httpError(400, "Enter your current password to change your email.");
    }
    const emailChanged = email !== req.user.email;
    const { rows } = await pool.query(`UPDATE users SET name = $1, email = $2,
      token_version = token_version + $4,
      password_reset_hash = CASE WHEN email <> $2 THEN NULL ELSE password_reset_hash END,
      password_reset_expires_at = CASE WHEN email <> $2 THEN NULL ELSE password_reset_expires_at END
      WHERE id = $3 AND token_version = $5 AND status = 'active' RETURNING *`,
    [name, email, req.userId, emailChanged ? 1 : 0, req.user.token_version]);
    if (!rows[0]) throw httpError(401, "Your session ended. Log in again.");
    res.json({ ...safeUser(rows[0]), ...(emailChanged ? { token: signToken(rows[0]) } : {}) });
  }));

  app.patch("/api/me/password", requireAuth, rateLimit("change-password", 15), route(async (req, res) => {
    const password = String(req.body.newPassword || "");
    if (!validPassword(password)) throw httpError(400, PASSWORD_MESSAGE);
    if (!(await bcrypt.compare(String(req.body.currentPassword || ""), req.user.password_hash))) throw httpError(400, "Your current password is incorrect.");
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(`UPDATE users SET password_hash = $1, token_version = token_version + 1,
      password_reset_hash = NULL, password_reset_expires_at = NULL
      WHERE id = $2 AND token_version = $3 AND status = 'active' RETURNING *`, [hash, req.userId, req.user.token_version]);
    if (!rows[0]) throw httpError(401, "Your session ended. Log in again.");
    res.json({ ok: true, token: signToken(rows[0]), user: safeUser(rows[0]) });
  }));

  app.use("/api/admin", requireAuth, requireAdmin);
  app.get("/api/admin/overview", route(async (req, res) => {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active,
      COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended,
      COUNT(*) FILTER (WHERE role = 'admin' AND status = 'active')::int AS admins FROM users`);
    res.json({ ...rows[0], recoveryAvailable: Boolean(mailer && mailFrom) });
  }));

  app.get("/api/admin/users", route(async (req, res) => {
    const search = String(req.query.search || "").trim().slice(0, 100);
    const role = ["user", "admin"].includes(req.query.role) ? req.query.role : "";
    const status = ["active", "suspended"].includes(req.query.status) ? req.query.status : "";
    const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    const where = "WHERE (name ILIKE $1 OR email ILIKE $1) AND ($2 = '' OR role = $2) AND ($3 = '' OR status = $3)";
    const params = [pattern, role, status];
    const { rows: counts } = await pool.query(`SELECT COUNT(*)::int AS total FROM users ${where}`, params);
    const { rows } = await pool.query(`SELECT ${PUBLIC_FIELDS},
      (SELECT COUNT(*)::int FROM invitations WHERE user_id = users.id) AS invitation_count
      FROM users ${where} ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET $4`, [...params, (page - 1) * 20]);
    res.json({ users: rows, total: counts[0].total, page, pageSize: 20 });
  }));

  app.patch("/api/admin/users/:id", route(async (req, res) => {
    await verifyAdminPassword(req);
    const id = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const { role, status } = req.body;
    if (!Number.isSafeInteger(id) || id <= 0) throw httpError(400, "Choose a valid account.");
    if (!name || name.length > 100 || !validEmail(email)) throw httpError(400, "Enter a valid name and email address.");
    if (!["user", "admin"].includes(role) || !["active", "suspended"].includes(status)) throw httpError(400, "Choose a valid role and status.");
    const updated = await transaction(pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(714903)");
      // Recheck after the lock so simultaneous demotions cannot bypass authorization.
      const { rows: actors } = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [req.userId]);
      const actor = actors[0];
      if (!actor || actor.role !== "admin" || actor.status !== "active" || actor.token_version !== req.user.token_version) throw httpError(403, "Your administrator access changed. Refresh this page.");
      const { rows } = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [id]);
      const target = rows[0];
      if (!target) throw httpError(404, "Account not found.");
      if (String(id) === String(req.userId) && (role !== "admin" || status !== "active")) throw httpError(400, "You cannot remove your own administrator access or suspend yourself.");
      if (target.role === "admin" && target.status === "active" && (role !== "admin" || status !== "active")) {
        const { rows: admins } = await client.query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'admin' AND status = 'active'");
        if (admins[0].total <= 1) throw httpError(400, "Keep at least one active administrator.");
      }
      const changedAccess = role !== target.role || status !== target.status || email !== target.email;
      const { rows: saved } = await client.query(`UPDATE users SET name = $1, email = $2, role = $3, status = $4,
        token_version = token_version + $5, password_reset_hash = NULL, password_reset_expires_at = NULL
        WHERE id = $6 RETURNING ${PUBLIC_FIELDS}`, [name, email, role, status, changedAccess ? 1 : 0, id]);
      await audit(client, actor.email, target.email, "account.updated", {
        before: { name: target.name, email: target.email, role: target.role, status: target.status },
        after: { name, email, role, status },
      });
      return saved[0];
    });
    res.json(updated);
  }));

  app.post("/api/admin/users/:id/reset-password", route(async (req, res) => {
    await verifyAdminPassword(req);
    if (!mailer || !mailFrom) throw httpError(503, "Configure SMTP and MAIL_FROM to send password reset emails.");
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw httpError(400, "Choose a valid account.");
    const { rows } = await pool.query("SELECT id, name, email FROM users WHERE id = $1 AND status = 'active'", [id]);
    if (!rows[0]) throw httpError(404, "An active account was not found.");
    if (!(await sendReset(rows[0]))) throw httpError(429, "A reset link was just sent. Wait one minute before sending another.");
    await audit(pool, req.user.email, rows[0].email, "password.reset_requested");
    res.json({ message: "Password reset email sent. The link expires in 30 minutes." });
  }));

  app.get("/api/admin/activity", route(async (req, res) => {
    const { rows } = await pool.query("SELECT id, actor_email, target_email, action, details, created_at FROM admin_audit_log ORDER BY created_at DESC, id DESC LIMIT 50");
    res.json(rows);
  }));

  app.use((err, req, res, next) => {
    if (!req.path.startsWith("/api/auth") && !req.path.startsWith("/api/me") && !req.path.startsWith("/api/admin")) return next(err);
    if (!err.status && err.code !== "23505") console.error("Account request failed:", err.code || err.name);
    const status = err.code === "23505" ? 409 : err.status || 500;
    res.status(status).json({ error: err.code === "23505" ? "That email already has an account." : status < 500 || status === 503 ? err.message : "Something went wrong. Try again." });
  });

  return { requireAuth };
}
