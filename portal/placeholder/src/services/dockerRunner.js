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

const repoRoot = path.resolve(__dirname, '../../../../');
const clientsDir = process.env.CLIENTS_DIR || path.join(repoRoot, 'clients');
const templatesDir = process.env.TEMPLATES_DIR || path.join(repoRoot, 'templates');
const composeTemplatePath = path.join(templatesDir, 'client-compose.yml');
const composeBin = process.env.DOCKER_COMPOSE_BIN || 'docker';
const dryRun = String(process.env.ORCHESTRATOR_DRY_RUN || 'false') === 'true';

function sessionProjectName(tenantId, sessionId) {
  return `fta-${tenantId}-${sessionId}`;
}

async function loadComposeTemplate() {
  return fs.readFile(composeTemplatePath, 'utf8');
}

function sessionPaths(tenantId, sessionId) {
  const sessionRoot = path.join(clientsDir, tenantId, sessionId);
  return {
    root: sessionRoot,
    configs: path.join(sessionRoot, 'configs'),
    data: path.join(sessionRoot, 'data'),
    logs: path.join(sessionRoot, 'logs'),
    results: path.join(sessionRoot, 'data', 'results'),
    resultsSession: path.join(sessionRoot, 'data', 'results', sessionId),
    compose: path.join(sessionRoot, 'docker-compose.yml'),
    envFile: path.join(sessionRoot, '.env'),
    logFile: path.join(sessionRoot, 'logs', 'session.log'),
  };
}

async function ensureSessionDirs(paths) {
  await fs.mkdir(paths.configs, { recursive: true });
  await fs.mkdir(paths.data, { recursive: true });
  await fs.mkdir(paths.logs, { recursive: true });
  await fs.mkdir(paths.results, { recursive: true });
  await fs.mkdir(paths.resultsSession, { recursive: true });
}

async function writeCompose(tenantId, sessionId, sessionName) {
  const paths = sessionPaths(tenantId, sessionId);
  await ensureSessionDirs(paths);
  const compose = await loadComposeTemplate();
  const envLines = [
    `SESSION_NAME=${sessionName}`,
    `CONTAINER_NAME=fta-${tenantId}-${sessionId}`,
    `CONFIG_DIR=${paths.configs}`,
    `DATA_DIR=${paths.data}`,
    `LOGS_DIR=${paths.logs}`,
    `RESULTS_DIR=${paths.results}`,
    `MEM_LIMIT=${defaultQuotas.mem}`,
    `CPU_LIMIT=${defaultQuotas.cpu}`,
    `PIDS_LIMIT=${defaultQuotas.pids}`,
    `NETWORK_NAME=${sessionProjectName(tenantId, sessionId)}-net`,
  ];
  await fs.writeFile(paths.envFile, `${envLines.join('\n')}\n`, 'utf8');
  await fs.writeFile(paths.compose, compose, 'utf8');
  return paths.compose;
}

async function appendLog(paths, message) {
  const timestamp = new Date().toISOString();
  await fs.mkdir(paths.logs, { recursive: true });
  await fs.appendFile(paths.logFile, `[${timestamp}] ${message}\n`, 'utf8');
}

async function runCompose(tenantId, sessionId, paths, args) {
  const command = [
    composeBin,
    'compose',
    '-p',
    sessionProjectName(tenantId, sessionId),
    '--env-file',
    paths.envFile,
    '-f',
    paths.compose,
    ...args,
  ];
  if (dryRun) {
    await appendLog(paths, `DRY_RUN: ${command.join(' ')}`);
    return { dryRun: true, command: command.join(' ') };
  }
  await appendLog(paths, `COMMAND: ${command.join(' ')}`);
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
  return runCompose(tenantId, sessionId, paths, ['up', '-d']);
}

async function stopSession(tenantId, sessionId) {
  const paths = sessionPaths(tenantId, sessionId);
  await appendLog(paths, 'Stop requested');
  return runCompose(tenantId, sessionId, paths, ['down', '--remove-orphans']);
}

async function backtestSession(tenantId, sessionId, sessionName, options = {}) {
  const paths = sessionPaths(tenantId, sessionId);
  await writeCompose(tenantId, sessionId, sessionName);
  await appendLog(paths, 'Backtest requested');
  const args = [
    'run',
    '--rm',
    'freqtrade',
    'backtesting',
    '--config',
    '/freqtrade/config/config.json',
    '--logfile',
    '/freqtrade/user_data/logs/backtest.log',
  ];
  if (options.strategy) {
    args.push('--strategy', options.strategy);
  }
  if (options.timerange) {
    args.push('--timerange', options.timerange);
  }
  args.push('--export', 'trades', '--export-filename', `/freqtrade/user_data/results/${sessionId}/backtest.json`);
  return runCompose(tenantId, sessionId, paths, args);
}

async function readLogs(tenantId, sessionId, tail) {
  const paths = sessionPaths(tenantId, sessionId);
  try {
    const sources = [
      { file: paths.logFile, label: 'session.log' },
      { file: path.join(paths.logs, 'freqtrade.log'), label: 'freqtrade.log' },
      { file: path.join(paths.logs, 'backtest.log'), label: 'backtest.log' },
    ];
    const collected = [];
    for (const source of sources) {
      try {
        const content = await fs.readFile(source.file, 'utf8');
        if (!content.trim()) {
          continue;
        }
        const lines = content.trim().split('\n').map((line) => `[${source.label}] ${line}`);
        collected.push(...lines);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }
    if (!tail) {
      return collected;
    }
    return collected.slice(-tail);
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
