import "dotenv/config";
import pg from "pg";
import nodemailer from "nodemailer";
import { createApp } from "./app.js";
import { migrate } from "./migrate.js";

const { DATABASE_URL, JWT_SECRET, CLIENT_URL = "http://localhost:5173", PORT = 3001,
  SMTP_HOST, SMTP_PORT = 465, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

if (!DATABASE_URL || !JWT_SECRET) throw new Error("Missing DATABASE_URL or JWT_SECRET in server/.env");

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
const mailer = SMTP_HOST ? nodemailer.createTransport({
  host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465,
  ...(SMTP_USER ? { auth: { user: SMTP_USER, pass: SMTP_PASS } } : {}),
  connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
}) : null;
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? (process.env.VERCEL ? 1 : 0));
if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) throw new Error("TRUST_PROXY_HOPS must be a number from 0 to 10");
const app = createApp({ pool, mailer, jwtSecret: JWT_SECRET, clientUrl: CLIENT_URL, mailFrom: MAIL_FROM || SMTP_USER, trustProxyHops });
// Fail closed if the schema cannot be updated; never serve partially migrated auth routes.
const ready = migrate(pool);
ready.catch((err) => console.error("Migration failed:", err.message));
const handler = (req, res) => ready.then(() => app(req, res)).catch(() => {
  res.statusCode = 503;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "The service is temporarily unavailable. Try again shortly." }));
});

if (!process.env.VERCEL) {
  await ready;
  const { createServer } = await import("node:http");
  createServer(handler).listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
}

export default handler;
