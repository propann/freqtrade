const express = require('express');
const fs = require('fs/promises');
const { constants } = require('fs');
const { requireEnv } = require('../config/env');
const { healthcheck } = require('../services/db');

const router = express.Router();
const clientsDir = requireEnv('CLIENTS_DIR');
const templatesDir = requireEnv('TEMPLATES_DIR');

router.get('/', async (_req, res) => {
  const errors = {};
  let dbStatus = 'ok';
  let fsStatus = 'ok';

  try {
    await healthcheck();
  } catch (error) {
    dbStatus = 'down';
    errors.db = error?.message || 'db_unavailable';
  }

  try {
    await fs.access(clientsDir, constants.R_OK | constants.W_OK);
    await fs.access(templatesDir, constants.R_OK);
  } catch (error) {
    fsStatus = 'down';
    errors.fs = error?.message || 'fs_unavailable';
  }

  if (dbStatus === 'ok' && fsStatus === 'ok') {
    return res.json({
      status: 'ok',
      service: 'portal',
      api: 'ok',
      db: 'ok',
      fs: 'ok',
    });
  }

  // eslint-disable-next-line no-console
  console.error('[portal] healthcheck failed', errors);
  return res.status(500).json({
    status: 'error',
    service: 'portal',
    api: 'ok',
    db: dbStatus,
    fs: fsStatus,
    errors,
  });
});

module.exports = router;
