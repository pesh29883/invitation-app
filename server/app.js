import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { installAccountRoutes } from "./accounts.js";

export function createApp({ pool, mailer = null, jwtSecret, clientUrl = "http://localhost:5173", mailFrom, resetDelayMs = 1000, trustProxyHops = 0 }) {
  const app = express();
  app.disable("x-powered-by");
  // Only trust a known number of reverse-proxy hops, never arbitrary forwarded headers.
  if (trustProxyHops > 0) app.set("trust proxy", trustProxyHops);
  app.use(cors({ origin: clientUrl }));
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  const { requireAuth } = installAccountRoutes(app, { pool, mailer, jwtSecret, clientUrl, mailFrom, resetDelayMs });

  async function sendRsvpEmail({ to, hostName, invitationTitle, guestName, attending }) {
    if (!mailer) {
      console.warn("SMTP not configured, skipping email.");
      return;
    }
    const status = attending ? "will be there" : "can't make it";
    await mailer.sendMail({
      from: mailFrom,
      to,
      subject: `${guestName} ${status}: ${invitationTitle}`,
      text:
        `Hi ${hostName},\n\n` +
        `${guestName} replied to "${invitationTitle}" and ${status}.\n\n` +
        `See all replies in your dashboard: ${clientUrl}/dashboard\n`,
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


  // ---------- invitations (public, for invitees) ----------

  app.get("/api/public/:slug", async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT i.kind, i.title, i.message, i.event_date, i.location, i.latitude, i.longitude, i.is_open, u.name AS host_name
         FROM invitations i JOIN users u ON u.id = i.user_id
         WHERE i.slug = $1 AND u.status = 'active'`,
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
         WHERE i.slug = $1 AND u.status = 'active'`,
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


  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error("Request failed:", err.message);
    res.status(status).json({ error: err.type === "entity.parse.failed" ? "Send a valid JSON request." : status === 413 ? "This request is too large." : status < 500 ? err.message : "Something went wrong. Try again." });
  });
  return app;
}
