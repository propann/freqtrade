const express = require('express');
const { healthcheck } = require('../services/db');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    await healthcheck();
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

module.exports = router;
