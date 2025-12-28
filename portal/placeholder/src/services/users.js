const { randomUUID } = require('crypto');
const { pool } = require('./db');

async function findUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT id, email, role, password_hash, created_at, last_login FROM users WHERE email = $1 LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

async function ensureAdminUser(email, passwordHash) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users(id, email, role, password_hash)
     VALUES($1, $2, 'admin', $3)
     ON CONFLICT (email) DO UPDATE SET role = 'admin', password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash)`,
    [id, email, passwordHash]
  );
  return findUserByEmail(email);
}

async function updateLastLogin(userId) {
  await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [userId]);
}

module.exports = {
  ensureAdminUser,
  findUserByEmail,
  updateLastLogin,
};
