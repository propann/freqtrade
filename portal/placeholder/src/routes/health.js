const express = require('express');
const { healthcheck } = require('../services/db');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    await healthcheck();
    res.json({ status: 'ok', service: 'portal', db: 'ok' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[portal] healthcheck failed', error);
    res.status(500).json({ status: 'error', db: 'down', error: error.message });
  }
});

module.exports = router;
