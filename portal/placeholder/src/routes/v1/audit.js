const express = require('express');
const { pool } = require('../../services/db');
const { requireAuth } = require('../../middlewares/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const rawLimit = Number(req.query?.limit);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
  const sessionId = req.query?.session_id;

  try {
    const query = sessionId
      ? 'SELECT id, tenant_id, session_id, action, meta, created_at FROM audit_logs WHERE tenant_id = $1 AND session_id = $2 ORDER BY created_at DESC LIMIT $3'
      : 'SELECT id, tenant_id, session_id, action, meta, created_at FROM audit_logs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2';
    const params = sessionId ? [tenantId, sessionId, limit] : [tenantId, limit];
    const { rows } = await pool.query(query, params);
    return res.json({ entries: rows });
  } catch (error) {
    return res.status(500).json({ error: 'audit_lookup_failed', detail: error.message });
  }
});

module.exports = router;
