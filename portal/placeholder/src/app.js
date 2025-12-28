const express = require('express');
const path = require('path');
const requestId = require('./middlewares/requestId');
const errorHandler = require('./middlewares/errorHandler');
const indexRoutes = require('./routes/index');
const healthRoutes = require('./routes/health');
const tenantRoutes = require('./routes/tenants');
const adminRoutes = require('./routes/admin');

function buildApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(express.json());

  app.use('/', indexRoutes);
  app.use('/health', healthRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', tenantRoutes);

  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use(errorHandler);
  return app;
}

module.exports = buildApp;
