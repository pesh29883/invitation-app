import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";

const {
  DATABASE_URL,
  JWT_SECRET,
  CLIENT_URL = "http://localhost:5173",
  PORT = 3001,
  SMTP_HOST,
  SMTP_PORT = 465,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
} = process.env;

if (!DATABASE_URL || !JWT_SECRET) {
  console.error("Missing DATABASE_URL or JWT_SECRET in server/.env");
  process.exit(1);
}

const app = express();
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

// Adds any columns the app needs, so database updates don't require manual SQL.
const migrated = pool
  .query(
    `ALTER TABLE invitations
       ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
       ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
       ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true`
  )
  .catch((err) => console.error("Migration failed:", err.message));

app.use(async (req, res, next) => {
  await migrated;
  next();
});

const mailer = SMTP_HOST
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

// ---------- helpers ----------

function signToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Log in to continue." });
  try {
    req.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch {
    res.status(401).json({ error: "Your session expired. Log in again." });
  }
}

async function sendRsvpEmail({ to, hostName, invitationTitle, guestName, attending }) {
  if (!mailer) {
    console.warn("SMTP not configured, skipping email.");
    return;
  }
  const status = attending ? "will be there" : "can't make it";
  await mailer.sendMail({
    from: MAIL_FROM || SMTP_USER,
    to,
    subject: `${guestName} ${status}: ${invitationTitle}`,
    text:
      `Hi ${hostName},\n\n` +
      `${guestName} replied to "${invitationTitle}" and ${status}.\n\n` +
      `See all replies in your dashboard: ${CLIENT_URL}/dashboard\n`,
  });
}

// Reads and checks the fields shared by "create" and "edit" invitation requests.
function readInvitationFields(body) {
  const kind = String(body.kind || "").trim();
  const title = String(body.title || "").trim();
  const message = String(body.message || "").trim();
  const location = String(body.location || "").trim();
  const eventDate = new Date(body.eventDate);
  const toCoord = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const latitude = toCoord(body.latitude);
  const longitude = toCoord(body.longitude);

  if (!kind) return { error: "Choose what kind of invitation this is." };
  if (!title) return { error: "Give your invitation a title." };
  if (Number.isNaN(eventDate.getTime())) return { error: "Pick a valid date and time." };

  const hasPin = latitude !== null && longitude !== null;
  const pinMissingHalf = (latitude === null) !== (longitude === null);
  if (
    pinMissingHalf ||
    (hasPin && !(latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180))
  )
    return { error: "The map pin is invalid. Try placing it again." };

  return { kind, title, message, location, eventDate, latitude, longitude };
}

// ---------- auth ----------

app.post("/api/auth/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!name) return res.status(400).json({ error: "Enter your name." });
  if (!/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8)
    return res.status(400).json({ error: "Use a password with at least 8 characters." });

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, email, hash]
    );
    res.status(201).json({ token: signToken(rows[0].id), user: rows[0] });
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ error: "That email already has an account. Log in instead." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: "Email or password is incorrect." });
    res.json({
      token: signToken(user.id),
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// ---------- invitations (creator) ----------

app.get("/api/invitations", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.slug, i.kind, i.title, i.message, i.event_date, i.location,
              i.latitude, i.longitude, i.is_open, i.created_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', r.id, 'guestName', r.guest_name,
                    'attending', r.attending, 'createdAt', r.created_at
                  ) ORDER BY r.created_at
                ) FILTER (WHERE r.id IS NOT NULL),
                '[]'
              ) AS rsvps
       FROM invitations i
       LEFT JOIN rsvps r ON r.invitation_id = i.id
       WHERE i.user_id = $1
       GROUP BY i.id
       ORDER BY i.created_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't load your invitations." });
  }
});

app.post("/api/invitations", requireAuth, async (req, res) => {
  const parsed = readInvitationFields(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { kind, title, message, location, eventDate, latitude, longitude } = parsed;

  try {
    const slug = crypto.randomBytes(6).toString("base64url");
    const { rows } = await pool.query(
      `INSERT INTO invitations (user_id, slug, kind, title, message, event_date, location, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, slug, kind, title, message, event_date, location, latitude, longitude, is_open, created_at`,
      [req.userId, slug, kind, title, message, eventDate.toISOString(), location, latitude, longitude]
    );
    res.status(201).json({ ...rows[0], rsvps: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't create the invitation. Try again." });
  }
});

app.put("/api/invitations/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid invitation." });

  const parsed = readInvitationFields(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { kind, title, message, location, eventDate, latitude, longitude } = parsed;

  try {
    const { rows } = await pool.query(
      `UPDATE invitations
       SET kind = $1, title = $2, message = $3, event_date = $4,
           location = $5, latitude = $6, longitude = $7
       WHERE id = $8 AND user_id = $9
       RETURNING id, slug, kind, title, message, event_date, location, latitude, longitude, is_open, created_at`,
      [kind, title, message, eventDate.toISOString(), location, latitude, longitude, id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Invitation not found." });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't save your changes. Try again." });
  }
});

app.patch("/api/invitations/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid invitation." });
  if (typeof req.body.isOpen !== "boolean")
    return res.status(400).json({ error: "Say whether to open or close the invitation." });

  try {
    const { rows } = await pool.query(
      "UPDATE invitations SET is_open = $1 WHERE id = $2 AND user_id = $3 RETURNING id, is_open",
      [req.body.isOpen, id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Invitation not found." });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't update the invitation. Try again." });
  }
});

app.delete("/api/invitations/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid invitation." });

  try {
    const { rows } = await pool.query(
      "DELETE FROM invitations WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Invitation not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't delete the invitation. Try again." });
  }
});

// ---------- profile ----------

app.patch("/api/me", requireAuth, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const currentPassword = String(req.body.currentPassword || "");

  if (!name) return res.status(400).json({ error: "Enter your name." });
  if (!/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ error: "Enter a valid email address." });

  try {
    const { rows: found } = await pool.query("SELECT * FROM users WHERE id = $1", [req.userId]);
    const user = found[0];
    if (!user) return res.status(404).json({ error: "Account not found." });

    if (email !== user.email && !(await bcrypt.compare(currentPassword, user.password_hash)))
      return res.status(400).json({ error: "Enter your current password to change your email." });

    const { rows } = await pool.query(
      "UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING id, name, email",
      [name, email, req.userId]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ error: "That email is already used by another account." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.patch("/api/me/password", requireAuth, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");

  if (newPassword.length < 8)
    return res.status(400).json({ error: "Use a new password with at least 8 characters." });

  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.userId]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash)))
      return res.status(400).json({ error: "Your current password is incorrect." });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// ---------- invitations (public, for invitees) ----------

app.get("/api/public/:slug", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.kind, i.title, i.message, i.event_date, i.location, i.latitude, i.longitude, i.is_open, u.name AS host_name
       FROM invitations i JOIN users u ON u.id = i.user_id
       WHERE i.slug = $1`,
      [req.params.slug]
    );
    if (!rows[0]) return res.status(404).json({ error: "This invitation doesn't exist." });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.post("/api/public/:slug/rsvp", async (req, res) => {
  const guestName = String(req.body.guestName || "").trim();
  const attending = req.body.attending;

  if (!guestName) return res.status(400).json({ error: "Enter your name." });
  if (typeof attending !== "boolean")
    return res.status(400).json({ error: "Tell the host if you can make it." });

  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.title, i.is_open, u.name AS host_name, u.email AS host_email
       FROM invitations i JOIN users u ON u.id = i.user_id
       WHERE i.slug = $1`,
      [req.params.slug]
    );
    const invitation = rows[0];
    if (!invitation) return res.status(404).json({ error: "This invitation doesn't exist." });
    if (!invitation.is_open)
      return res.status(403).json({ error: "This invitation is closed and isn't taking replies." });

    await pool.query(
      "INSERT INTO rsvps (invitation_id, guest_name, attending) VALUES ($1, $2, $3)",
      [invitation.id, guestName, attending]
    );

    // The reply is saved. A mail failure shouldn't make the guest's reply fail.
    // We wait for the email here because a serverless function can be paused
    // as soon as the response is sent, which would cut the email off.
    try {
      await sendRsvpEmail({
        to: invitation.host_email,
        hostName: invitation.host_name,
        invitationTitle: invitation.title,
        guestName,
        attending,
      });
    } catch (err) {
      console.error("Email failed:", err.message);
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't save your reply. Try again." });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

// On Vercel the platform runs the app for us, so we only listen when running locally.
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
}

export default app;