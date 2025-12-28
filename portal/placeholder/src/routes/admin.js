const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const adminAuth = require('../middlewares/adminAuth');

const router = express.Router();

const clientRoot = process.env.CLIENTS_DIR || '/data/clients';
const defaultNetwork = process.env.DOCKER_NETWORK || 'freqtrade-aws-net';

function buildDryRunConfig(name) {
  return {
    dry_run: true,
    runmode: 'dry_run',
    exchange: {
      name: 'binance',
      key: 'changeme',
      secret: 'changeme',
    },
    stake_currency: 'USDT',
    timeframe: '5m',
    max_open_trades: 1,
    strategy: 'SampleStrategy',
    bot_name: name,
  };
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    return false;
  }
}

router.post('/sessions', adminAuth, async (req, res) => {
  const name = req.body?.name;
  const configTemplate = req.body?.configTemplate || 'dryrun';

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'invalid_name', message: 'Session name is required.' });
  }

  if (configTemplate !== 'dryrun') {
    return res.status(400).json({ error: 'invalid_template', message: 'Only "dryrun" template is supported.' });
  }

  const sessionDir = path.join(clientRoot, name);
  const configDir = path.join(sessionDir, 'configs');
  const dataDir = path.join(sessionDir, 'data');
  const logsDir = path.join(sessionDir, 'logs');
  const configPath = path.join(configDir, 'config.json');
  const containerName = `freqtrade-${name}`;

  if (await pathExists(sessionDir)) {
    return res.status(409).json({ error: 'session_exists', message: `Session ${name} already exists.` });
  }

  try {
    await fs.mkdir(configDir, { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(logsDir, { recursive: true });

    const config = buildDryRunConfig(name);
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

    const command = [
      'docker run --rm',
      `--name ${containerName}`,
      `--network ${defaultNetwork}`,
      `-v "${configDir}:/freqtrade/config"`,
      `-v "${dataDir}:/freqtrade/user_data"`,
      'freqtradeorg/freqtrade:stable',
      'trade --config /freqtrade/config/config.json --dry-run',
    ].join(' ');

    // eslint-disable-next-line no-console
    console.log('[portal] bootstrap session', {
      name,
      sessionDir,
      configPath,
      containerName,
    });

    return res.status(201).json({
      status: 'created',
      name,
      template: configTemplate,
      clientDir: sessionDir,
      configPath,
      containerName,
      command,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[portal] failed to bootstrap session', error);
    return res.status(500).json({ error: 'bootstrap_failed', detail: error.message });
  }
});

module.exports = router;
