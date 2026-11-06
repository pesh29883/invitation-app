// One-time data correction authorized by the owner. This only touches an account
// that already exists when this deployment first connects to the database.
export const OWNER_ADMIN_MIGRATION = "20261106-enable-existing-owner-admin";
const OWNER_EMAIL = "christonambowang@gmail.com";

export async function enableExistingOwnerAdmin(client) {
  const { rows: applied } = await client.query("SELECT key FROM app_data_migrations WHERE key = $1", [OWNER_ADMIN_MIGRATION]);
  if (applied[0]) return;

  const { rows } = await client.query("SELECT id, email, role, status FROM users WHERE lower(email) = $1 FOR UPDATE", [OWNER_EMAIL]);
  if (rows.length > 1) throw new Error("Owner migration requires one unambiguous existing account.");
  const user = rows[0];
  let outcome = "skipped_missing_account";
  if (user) {
    outcome = "already_admin";
    if (user.role !== "admin" || user.status !== "active") {
      await client.query(`UPDATE users SET role = 'admin', status = 'active', token_version = token_version + 1,
        password_reset_hash = NULL, password_reset_expires_at = NULL WHERE id = $1`, [user.id]);
      await client.query(`INSERT INTO admin_audit_log (actor_email, target_email, action, details)
        VALUES ($1, $2, $3, $4)`, ["owner-authorized deployment", user.email, "admin.bootstrapped",
        JSON.stringify({ migration: OWNER_ADMIN_MIGRATION, accountId: user.id })]);
      outcome = "promoted";
    }
  }
  // Record missing accounts too: a later signup with this email must never
  // inherit admin access. Later demotions also remain authoritative.
  await client.query("INSERT INTO app_data_migrations (key, details) VALUES ($1, $2)",
    [OWNER_ADMIN_MIGRATION, JSON.stringify({ outcome, accountId: user?.id ?? null })]);
}
