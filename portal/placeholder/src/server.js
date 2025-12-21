const buildApp = require('./app');

const port = process.env.PORT || 8080;
const app = buildApp();

app.listen(port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Portal placeholder listening on ${port}`);
});
