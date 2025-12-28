const fs = require('fs/promises');
const buildApp = require('./app');
const { requireEnv } = require('./config/env');
const { ensureSchema } = require('./services/migrations');

const port = Number(requireEnv('PORT'));
const clientsDir = requireEnv('CLIENTS_DIR');
const app = buildApp();

Promise.resolve()
  .then(() => fs.mkdir(clientsDir, { recursive: true }))
  .then(() => ensureSchema())
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      // eslint-disable-next-line no-console
      console.log(`Portal placeholder listening on ${port}`);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[portal] failed to apply migrations', error);
    process.exit(1);
  });
