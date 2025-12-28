const express = require('express');
const path = require('path');

const router = express.Router();

router.get('/', (_req, res) => {
  const publicDir = path.join(__dirname, '..', '..', 'public');
  res.sendFile(path.join(publicDir, 'index.html'));
});

module.exports = router;
