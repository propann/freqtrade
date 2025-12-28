const express = require('express');
const crypto = require('crypto');
const { pool } = require('../../services/db');
const { requireAuth } = require('../../middlewares/auth');
const {
  prepareSession,
  startSession,
  stopSession,
  backtestSession,
  readLogs,
  sessionPaths,
} = require('../../services/dockerRunner');

const router = express.Router();

async function getSession(tenantId, sessionId) {
  const { rows } = await pool.query(
    'SELECT id, tenant_id, name, status, meta, created_at, updated_at FROM sessions WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [sessionId, tenantId]
  );
  return rows[0];
}

async function latestJob(sessionId) {
  const { rows } = await pool.query(
    'SELECT id, session_id, job_type, status, logs_path, created_at, updated_at, started_at, finished_at, meta FROM jobs WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1',
    [sessionId]
  );
  return rows[0];
}

async function createJob(sessionId, jobType, status, logsPath, meta = {}) {
  const id = crypto.randomUUID();
  const now = new Date();
  await pool.query(
    'INSERT INTO jobs(id, session_id, job_type, status, logs_path, meta, created_at, updated_at, started_at) VALUES($1, $2, $3, $4, $5, $6, $7, $7, $7)',
    [id, sessionId, jobType, status, logsPath, meta, now]
  );
  return { id, status, job_type: jobType, logs_path: logsPath, created_at: now };
}

async function updateJobStatus(jobId, status) {
  const finishedAt = status === 'completed' || status === 'failed' ? new Date() : null;
  await pool.query(
    'UPDATE jobs SET status = $1, updated_at = NOW(), finished_at = COALESCE($2, finished_at) WHERE id = $3',
    [status, finishedAt, jobId]
  );
}

async function audit(tenantId, sessionId, action, meta = {}) {
  await pool.query(
    'INSERT INTO audit_logs(tenant_id, session_id, action, meta) VALUES($1, $2, $3, $4)',
    [tenantId, sessionId, action, meta]
  );
}

router.use(requireAuth);

router.get('/', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const { rows } = await pool.query(
    'SELECT id, tenant_id, name, status, meta, created_at, updated_at FROM sessions WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  res.json({ sessions: rows });
});

router.post('/', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const name = req.body?.name;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'invalid_name', message: 'Session name is required.' });
  }
  const id = crypto.randomUUID();
  const now = new Date();
  const meta = req.body?.meta || {};
  try {
    await pool.query(
      'INSERT INTO sessions(id, tenant_id, name, status, meta, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [id, tenantId, name, 'stopped', meta, now]
    );
    await prepareSession(tenantId, id, name);
    await audit(tenantId, id, 'session_created', { name });
    const session = await getSession(tenantId, id);
    return res.status(201).json({ session });
  } catch (error) {
    return res.status(500).json({ error: 'session_create_failed', detail: error.message });
  }
});

router.get('/:id', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const session = await getSession(tenantId, req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }
  const job = await latestJob(session.id);
  return res.json({ session, latest_job: job });
});

router.put('/:id', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const session = await getSession(tenantId, req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }
  const name = req.body?.name || session.name;
  const meta = req.body?.meta || session.meta || {};
  await pool.query(
    'UPDATE sessions SET name = $1, meta = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4',
    [name, meta, session.id, tenantId]
  );
  await audit(tenantId, session.id, 'session_updated', { name });
  const updated = await getSession(tenantId, session.id);
  return res.json({ session: updated });
});

router.delete('/:id', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const session = await getSession(tenantId, req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }
  await pool.query('DELETE FROM sessions WHERE id = $1 AND tenant_id = $2', [session.id, tenantId]);
  await audit(tenantId, session.id, 'session_deleted');
  return res.json({ status: 'deleted' });
});

router.post('/:id/start', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const session = await getSession(tenantId, req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }
  const paths = sessionPaths(tenantId, session.id);
  const job = await createJob(session.id, 'start', 'running', paths.logFile, { source: 'api' });
  await audit(tenantId, session.id, 'session_start');
  try {
    const result = await startSession(tenantId, session.id, session.name);
    await pool.query('UPDATE sessions SET status = $1, updated_at = NOW() WHERE id = $2', ['running', session.id]);
    await updateJobStatus(job.id, 'completed');
    return res.json({ status: 'started', job: { ...job, result } });
  } catch (error) {
    await updateJobStatus(job.id, 'failed');
    await pool.query('UPDATE sessions SET status = $1, updated_at = NOW() WHERE id = $2', [session.status, session.id]);
    return res.status(500).json({ error: 'start_failed', detail: error.message });
  }
});

router.post('/:id/stop', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const session = await getSession(tenantId, req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }
  const paths = sessionPaths(tenantId, session.id);
  const job = await createJob(session.id, 'stop', 'running', paths.logFile, { source: 'api' });
  await audit(tenantId, session.id, 'session_stop');
  try {
    const result = await stopSession(tenantId, session.id);
    await pool.query('UPDATE sessions SET status = $1, updated_at = NOW() WHERE id = $2', ['stopped', session.id]);
    await updateJobStatus(job.id, 'completed');
    return res.json({ status: 'stopped', job: { ...job, result } });
  } catch (error) {
    await updateJobStatus(job.id, 'failed');
    await pool.query('UPDATE sessions SET status = $1, updated_at = NOW() WHERE id = $2', [session.status, session.id]);
    return res.status(500).json({ error: 'stop_failed', detail: error.message });
  }
});

router.post('/:id/backtest', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const session = await getSession(tenantId, req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }
  const paths = sessionPaths(tenantId, session.id);
  const meta = {
    timerange: req.body?.timerange,
    strategy: req.body?.strategy,
  };
  const job = await createJob(session.id, 'backtest', 'running', paths.logFile, meta);
  await pool.query('UPDATE sessions SET status = $1, updated_at = NOW() WHERE id = $2', ['backtest', session.id]);
  await audit(tenantId, session.id, 'session_backtest', meta);
  try {
    const result = await backtestSession(tenantId, session.id, session.name, {
      timerange: meta.timerange,
      strategy: meta.strategy,
    });
    await pool.query('UPDATE sessions SET status = $1, updated_at = NOW() WHERE id = $2', ['stopped', session.id]);
    await updateJobStatus(job.id, 'completed');
    return res.json({ status: 'backtest_started', job: { ...job, result } });
  } catch (error) {
    await updateJobStatus(job.id, 'failed');
    await pool.query('UPDATE sessions SET status = $1, updated_at = NOW() WHERE id = $2', [session.status, session.id]);
    return res.status(500).json({ error: 'backtest_failed', detail: error.message });
  }
});

router.get('/:id/status', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const session = await getSession(tenantId, req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }
  const job = await latestJob(session.id);
  return res.json({ session, latest_job: job });
});

router.get('/:id/logs', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const session = await getSession(tenantId, req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }
  const tailValue = Number(req.query?.tail);
  const tail = Number.isFinite(tailValue) ? tailValue : 200;
  const lines = await readLogs(tenantId, session.id, tail);
  return res.json({ session_id: session.id, lines });
});

module.exports = router;
