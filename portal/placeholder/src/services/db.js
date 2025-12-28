const { Pool } = require('pg');
const { requireEnv } = require('../config/env');

const pool = new Pool({
  host: requireEnv('POSTGRES_HOST'),
  port: Number(requireEnv('POSTGRES_PORT')),
  database: requireEnv('POSTGRES_DB'),
  user: requireEnv('POSTGRES_USER'),
  password: requireEnv('POSTGRES_PASSWORD'),
  max: 2,
});

async function healthcheck() {
  return pool.query('SELECT 1');
}

module.exports = {
  pool,
  healthcheck,
};
