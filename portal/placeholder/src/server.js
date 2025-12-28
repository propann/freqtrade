const buildApp = require('./app');
const { ensureSchema } = require('./services/migrations');

const port = process.env.PORT || 8080;
const app = buildApp();

ensureSchema()
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
