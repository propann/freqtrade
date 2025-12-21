const express = require('express');
const { execSync } = require('child_process');
const path = require('path');
const { healthcheck } = require('../services/db');

const router = express.Router();

function getGitHash() {
  try {
    const rootDir = path.join(__dirname, '..', '..');
    return execSync('git rev-parse --short HEAD', { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch (error) {
    return 'unknown';
  }
}

function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs}h ${mins}m ${secs}s`;
}

router.get('/', async (_req, res) => {
  const env = process.env.NODE_ENV || 'development';
  const uptime = formatDuration(process.uptime());
  const gitHash = getGitHash();
  let infraStatus = 'unknown';

  try {
    await healthcheck();
    infraStatus = 'healthy';
  } catch (error) {
    infraStatus = `degraded (${error.message})`;
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Freqtrade AWS Portal</title>
  <style>
    :root { font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif; color: #0f172a; background: #0b1220; }
    body { margin: 0; padding: 0; background: linear-gradient(135deg, #0b1220 0%, #0f172a 50%, #0b1220 100%); min-height: 100vh; display: flex; justify-content: center; align-items: center; }
    .card { background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); border-radius: 20px; padding: 32px; max-width: 880px; width: 92%; color: #e2e8f0; backdrop-filter: blur(12px); }
    h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: -0.5px; color: #f8fafc; }
    .subtitle { margin: 0 0 24px; color: #94a3b8; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .pill { padding: 10px 12px; border-radius: 12px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.07); color: #e2e8f0; font-size: 14px; }
    .pill strong { display: block; color: #cbd5e1; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .links a { display: inline-flex; align-items: center; gap: 8px; color: #38bdf8; text-decoration: none; padding: 10px 12px; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 12px; margin-right: 10px; transition: background 150ms ease, transform 150ms ease; }
    .links a:hover { background: rgba(56, 189, 248, 0.1); transform: translateY(-2px); }
    .footer { margin-top: 16px; color: #94a3b8; font-size: 13px; }
    .status-ok { color: #34d399; }
    .status-warn { color: #fbbf24; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Freqtrade AWS Portal</h1>
    <p class="subtitle">SaaS control-plane for tenant provisioning &amp; monitoring.</p>
    <div class="grid">
      <div class="pill"><strong>Infra</strong><span class="${infraStatus.startsWith('healthy') ? 'status-ok' : 'status-warn'}">${infraStatus}</span></div>
      <div class="pill"><strong>Git</strong><span>${gitHash}</span></div>
      <div class="pill"><strong>Uptime</strong><span>${uptime}</span></div>
      <div class="pill"><strong>Environment</strong><span>${env}</span></div>
    </div>
    <div class="links">
      <a href="/health" target="_blank" rel="noreferrer">/health</a>
      <a href="/api/clients" target="_blank" rel="noreferrer">/api</a>
    </div>
    <div class="footer">Requests are served from ${env} mode. Health endpoint performs a live PostgreSQL check.</div>
  </div>
</body>
</html>`;

  res.type('html').send(html);
});

module.exports = router;
