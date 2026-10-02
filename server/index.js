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
              i.latitude, i.longitude, i.created_at,
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
  const kind = String(req.body.kind || "").trim();
  const title = String(req.body.title || "").trim();
  const message = String(req.body.message || "").trim();
  const location = String(req.body.location || "").trim();
  const eventDate = new Date(req.body.eventDate);
  const toCoord = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const latitude = toCoord(req.body.latitude);
  const longitude = toCoord(req.body.longitude);

  if (!kind) return res.status(400).json({ error: "Choose what kind of invitation this is." });
  if (!title) return res.status(400).json({ error: "Give your invitation a title." });
  if (Number.isNaN(eventDate.getTime()))
    return res.status(400).json({ error: "Pick a valid date and time." });

  const hasPin = latitude !== null && longitude !== null;
  const pinMissingHalf = (latitude === null) !== (longitude === null);
  if (
    pinMissingHalf ||
    (hasPin && !(latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180))
  )
    return res.status(400).json({ error: "The map pin is invalid. Try placing it again." });

  try {
    const slug = crypto.randomBytes(6).toString("base64url");
    const { rows } = await pool.query(
      `INSERT INTO invitations (user_id, slug, kind, title, message, event_date, location, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, slug, kind, title, message, event_date, location, latitude, longitude, created_at`,
      [req.userId, slug, kind, title, message, eventDate.toISOString(), location, latitude, longitude]
    );
    res.status(201).json({ ...rows[0], rsvps: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't create the invitation. Try again." });
  }
});

// ---------- invitations (public, for invitees) ----------

app.get("/api/public/:slug", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.kind, i.title, i.message, i.event_date, i.location, i.latitude, i.longitude, u.name AS host_name
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
      `SELECT i.id, i.title, u.name AS host_name, u.email AS host_email
       FROM invitations i JOIN users u ON u.id = i.user_id
       WHERE i.slug = $1`,
      [req.params.slug]
    );
    const invitation = rows[0];
    if (!invitation) return res.status(404).json({ error: "This invitation doesn't exist." });

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