export async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate(pool) {
  await transaction(pool, async (client) => {
    // Serialize schema updates across serverless instances.
    await client.query("SELECT pg_advisory_xact_lock(714902)");
    await client.query(`ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS password_reset_hash TEXT,
      ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_password_reset_hash_idx
      ON users (password_reset_hash) WHERE password_reset_hash IS NOT NULL`);
    await client.query(`CREATE TABLE IF NOT EXISTS account_rate_limits (
      bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at TIMESTAMPTZ NOT NULL
    )`);
    await client.query("CREATE INDEX IF NOT EXISTS account_rate_limits_expiry_idx ON account_rate_limits (reset_at)");
    await client.query(`CREATE TABLE IF NOT EXISTS admin_audit_log (
      id BIGSERIAL PRIMARY KEY, actor_email TEXT NOT NULL, target_email TEXT NOT NULL,
      action TEXT NOT NULL, details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`ALTER TABLE invitations
      ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true`);
  });
}
