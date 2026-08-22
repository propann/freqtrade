import { chmod, mkdir, open, readFile, rename, stat, unlink } from 'fs/promises';
import path from 'path';

export type RuntimeSecrets = {
  exchange: { key: string; secret: string; password: string; uid: string };
  telegram: { enabled: boolean; token: string; chat_id: string; authorized_users: string[] };
};

export type RuntimeSecretsUpdate = {
  exchangeKey?: unknown;
  exchangeSecret?: unknown;
  exchangePassword?: unknown;
  exchangeUid?: unknown;
  telegramEnabled?: unknown;
  telegramToken?: unknown;
  telegramChatId?: unknown;
  telegramAuthorizedUsers?: unknown;
};

const SECRET_PATH = process.env.QUANT_RUNTIME_SECRETS_PATH || '/app/user_data/private/runtime-secrets.json';
const TOKEN_PATTERN = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;
const INTEGER_PATTERN = /^-?\d+$/;

export const EMPTY_RUNTIME_SECRETS: RuntimeSecrets = {
  exchange: { key: '', secret: '', password: '', uid: '' },
  telegram: { enabled: false, token: '', chat_id: '', authorized_users: [] },
};

function boundedString(value: unknown, field: string, maximum = 512): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > maximum) throw new Error(`${field} invalide`);
  return value.trim();
}

function normalized(value: unknown): RuntimeSecrets {
  const root = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const exchange = root.exchange && typeof root.exchange === 'object' ? root.exchange as Record<string, unknown> : {};
  const telegram = root.telegram && typeof root.telegram === 'object' ? root.telegram as Record<string, unknown> : {};
  return {
    exchange: {
      key: typeof exchange.key === 'string' ? exchange.key : '',
      secret: typeof exchange.secret === 'string' ? exchange.secret : '',
      password: typeof exchange.password === 'string' ? exchange.password : '',
      uid: typeof exchange.uid === 'string' ? exchange.uid : '',
    },
    telegram: {
      enabled: telegram.enabled === true,
      token: typeof telegram.token === 'string' ? telegram.token : '',
      chat_id: typeof telegram.chat_id === 'string' ? telegram.chat_id : '',
      authorized_users: Array.isArray(telegram.authorized_users)
        ? telegram.authorized_users.filter((item): item is string => typeof item === 'string' && INTEGER_PATTERN.test(item))
        : [],
    },
  };
}

export function applyRuntimeSecretsUpdate(current: RuntimeSecrets, input: RuntimeSecretsUpdate): RuntimeSecrets {
  const exchangeKey = boundedString(input.exchangeKey, 'Clé exchange');
  const exchangeSecret = boundedString(input.exchangeSecret, 'Secret exchange');
  const exchangePassword = boundedString(input.exchangePassword, 'Phrase secrète exchange');
  const exchangeUid = boundedString(input.exchangeUid, 'UID exchange', 128);
  const telegramToken = boundedString(input.telegramToken, 'Jeton Telegram');
  const telegramChatId = boundedString(input.telegramChatId, 'Chat Telegram', 64);
  const authorizedRaw = boundedString(input.telegramAuthorizedUsers, 'Utilisateurs Telegram', 512);

  const replacingExchangeKey = Boolean(exchangeKey);
  const replacingExchangeSecret = Boolean(exchangeSecret);
  if (replacingExchangeKey !== replacingExchangeSecret) {
    throw new Error('Une rotation exchange exige la nouvelle clé et le nouveau secret ensemble.');
  }
  const exchange = {
    key: replacingExchangeKey ? exchangeKey! : current.exchange.key,
    secret: replacingExchangeSecret ? exchangeSecret! : current.exchange.secret,
    password: exchangePassword || current.exchange.password,
    uid: exchangeUid || current.exchange.uid,
  };
  if (Boolean(exchange.key) !== Boolean(exchange.secret) || (exchange.key && (exchange.key.length < 8 || exchange.secret.length < 8))) {
    throw new Error('La clé et le secret exchange doivent être fournis ensemble et contenir au moins 8 caractères.');
  }

  const authorizedUsers = authorizedRaw === undefined || authorizedRaw === ''
    ? current.telegram.authorized_users
    : authorizedRaw.split(/[\s,;]+/).filter(Boolean).map((item) => {
      if (!INTEGER_PATTERN.test(item)) throw new Error('Les utilisateurs Telegram doivent être des identifiants numériques.');
      return item;
    });

  const telegram = {
    enabled: typeof input.telegramEnabled === 'boolean' ? input.telegramEnabled : current.telegram.enabled,
    token: telegramToken || current.telegram.token,
    chat_id: telegramChatId || current.telegram.chat_id,
    authorized_users: authorizedUsers,
  };
  if (telegram.enabled && (!TOKEN_PATTERN.test(telegram.token) || !INTEGER_PATTERN.test(telegram.chat_id))) {
    throw new Error('Telegram activé exige un nouveau jeton et un chat ID valides.');
  }
  return { exchange, telegram };
}

export async function readRuntimeSecrets(): Promise<RuntimeSecrets> {
  try {
    return normalized(JSON.parse(await readFile(SECRET_PATH, 'utf-8')));
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return structuredClone(EMPTY_RUNTIME_SECRETS);
    throw new Error('Coffre serveur illisible');
  }
}

export async function writeRuntimeSecrets(value: RuntimeSecrets): Promise<void> {
  const directory = path.dirname(SECRET_PATH);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${SECRET_PATH}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf-8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await chmod(temporary, 0o600);
    await rename(temporary, SECRET_PATH);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function runtimeSecretsStatus() {
  const value = await readRuntimeSecrets();
  let updatedAt: string | null = null;
  try { updatedAt = (await stat(SECRET_PATH)).mtime.toISOString(); } catch { /* not initialized */ }
  return {
    exchangeConfigured: Boolean(value.exchange.key && value.exchange.secret),
    exchangePasswordConfigured: Boolean(value.exchange.password),
    telegramConfigured: Boolean(value.telegram.token && value.telegram.chat_id),
    telegramEnabled: value.telegram.enabled,
    telegramAuthorizedUsers: value.telegram.authorized_users.length,
    updatedAt,
  };
}
