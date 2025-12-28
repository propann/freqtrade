function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[portal] Missing required env var: ${name}`);
  }
  return value;
}

function optionalEnv(name) {
  return process.env[name];
}

module.exports = {
  requireEnv,
  optionalEnv,
};
