import "dotenv/config";
import pg from "pg";
import { migrate, transaction } from "./migrate.js";

// Run on the API host: npm run make-admin -- owner@example.com
const email = String(process.argv[2] || "").trim().toLowerCase();
if (!email || !process.env.DATABASE_URL) {
  console.error("Run from server with DATABASE_URL configured: npm run make-admin -- existing-account@example.com");
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await migrate(pool);
    await transaction(pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(714903)");
      const { rows } = await client.query(`UPDATE users SET role = 'admin', status = 'active',
        token_version = token_version + 1, password_reset_hash = NULL, password_reset_expires_at = NULL
        WHERE email = $1 RETURNING id`, [email]);
      if (!rows[0]) throw new Error("Account not found. Register this account first, then run this command again.");
      await client.query("INSERT INTO admin_audit_log (actor_email, target_email, action) VALUES ($1, $2, $3)", ["server operator", email, "admin.bootstrapped"]);
    });
    console.log("Administrator enabled. Sign in again to open /admin.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
