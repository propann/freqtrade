const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const defaultQuotas = {
  cpu: process.env.DEFAULT_CPU || '1.0',
  mem: process.env.DEFAULT_MEM_LIMIT || '1024m',
  pids: parseInt(process.env.DEFAULT_PIDS_LIMIT || '256', 10),
};

const clientsDir = process.env.CLIENTS_DIR || '/data/clients';
const dockerNetwork = process.env.DOCKER_NETWORK || 'freqtrade-aws-net';
const composeBin = process.env.DOCKER_COMPOSE_BIN || 'docker';
const dryRun = String(process.env.ORCHESTRATOR_DRY_RUN || 'true') !== 'false';

function composeTemplate({ sessionName, configDir, dataDir, logsDir }) {
  return `services:\n` +
    `  ${sessionName}:\n` +
    `    image: freqtradeorg/freqtrade:stable\n` +
    `    container_name: ${sessionName}\n` +
    `    restart: unless-stopped\n` +
    `    command: trade --config /freqtrade/config/config.json --dry-run\n` +
    `    networks:\n` +
    `      - ${dockerNetwork}\n` +
    `    volumes:\n` +
    `      - ${configDir}:/freqtrade/config\n` +
    `      - ${dataDir}:/freqtrade/user_data\n` +
    `      - ${logsDir}:/freqtrade/user_data/logs\n` +
    `    deploy:\n` +
    `      resources:\n` +
    `        limits:\n` +
    `          cpus: '${defaultQuotas.cpu}'\n` +
    `          memory: ${defaultQuotas.mem}\n` +
    `    pids_limit: ${defaultQuotas.pids}\n` +
    `networks:\n` +
    `  ${dockerNetwork}:\n` +
    `    external: true\n`;
}

function sessionPaths(tenantId, sessionId) {
  const sessionRoot = path.join(clientsDir, tenantId, sessionId);
  return {
    root: sessionRoot,
    configs: path.join(sessionRoot, 'configs'),
    data: path.join(sessionRoot, 'data'),
    logs: path.join(sessionRoot, 'logs'),
    compose: path.join(sessionRoot, 'docker-compose.yml'),
    logFile: path.join(sessionRoot, 'logs', 'session.log'),
  };
}

async function ensureSessionDirs(paths) {
  await fs.mkdir(paths.configs, { recursive: true });
  await fs.mkdir(paths.data, { recursive: true });
  await fs.mkdir(paths.logs, { recursive: true });
}

async function writeCompose(tenantId, sessionId, sessionName) {
  const paths = sessionPaths(tenantId, sessionId);
  await ensureSessionDirs(paths);
  const compose = composeTemplate({
    sessionName,
    configDir: paths.configs,
    dataDir: paths.data,
    logsDir: paths.logs,
  });
  await fs.writeFile(paths.compose, compose, 'utf8');
  return paths.compose;
}

async function appendLog(paths, message) {
  const timestamp = new Date().toISOString();
  await fs.appendFile(paths.logFile, `[${timestamp}] ${message}\n`, 'utf8');
}

async function runCompose(paths, args) {
  const command = [composeBin, 'compose', '-f', paths.compose, ...args];
  if (dryRun) {
    await appendLog(paths, `DRY_RUN: ${command.join(' ')}`);
    return { dryRun: true, command: command.join(' ') };
  }
  const { stdout, stderr } = await execFileAsync(command[0], command.slice(1));
  if (stdout) {
    await appendLog(paths, stdout.trim());
  }
  if (stderr) {
    await appendLog(paths, stderr.trim());
  }
  return { dryRun: false, stdout, stderr };
}

async function prepareSession(tenantId, sessionId, sessionName) {
  const paths = sessionPaths(tenantId, sessionId);
  await ensureSessionDirs(paths);
  await writeCompose(tenantId, sessionId, sessionName);
  await appendLog(paths, 'Session scaffolded');
  return paths;
}

async function startSession(tenantId, sessionId, sessionName) {
  const paths = sessionPaths(tenantId, sessionId);
  await writeCompose(tenantId, sessionId, sessionName);
  await appendLog(paths, 'Start requested');
  return runCompose(paths, ['up', '-d']);
}

async function stopSession(tenantId, sessionId) {
  const paths = sessionPaths(tenantId, sessionId);
  await appendLog(paths, 'Stop requested');
  return runCompose(paths, ['down']);
}

async function backtestSession(tenantId, sessionId, sessionName) {
  const paths = sessionPaths(tenantId, sessionId);
  await writeCompose(tenantId, sessionId, sessionName);
  await appendLog(paths, 'Backtest requested');
  return runCompose(paths, ['run', '--rm', sessionName, 'backtesting', '--config', '/freqtrade/config/config.json']);
}

async function readLogs(tenantId, sessionId, tail) {
  const paths = sessionPaths(tenantId, sessionId);
  try {
    const content = await fs.readFile(paths.logFile, 'utf8');
    if (!content.trim()) {
      return [];
    }
    const lines = content.trim().split('\n');
    if (!tail) {
      return lines;
    }
    return lines.slice(-tail);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

module.exports = {
  defaultQuotas,
  sessionPaths,
  prepareSession,
  startSession,
  stopSession,
  backtestSession,
  readLogs,
};
