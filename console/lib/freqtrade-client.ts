const DEFAULT_API_URL = 'http://freqtrade-engine:8080';
const DEFAULT_TIMEOUT_MS = 3000;

export type FreqtradeErrorCode =
  | 'misconfigured'
  | 'timeout'
  | 'unauthorized'
  | 'unavailable'
  | 'invalid_response';

export class FreqtradeApiError extends Error {
  code: FreqtradeErrorCode;
  status?: number;

  constructor(code: FreqtradeErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'FreqtradeApiError';
    this.code = code;
    this.status = status;
  }
}

function configuration() {
  const rawUrl = process.env.FREQTRADE_API_URL || DEFAULT_API_URL;
  const username = process.env.FREQTRADE_USERNAME || '';
  const password = process.env.FREQTRADE_PASSWORD || '';
  const requestedTimeout = Number(process.env.FREQTRADE_API_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.min(10_000, Math.max(500, requestedTimeout))
    : DEFAULT_TIMEOUT_MS;

  let baseUrl: URL;
  try {
    baseUrl = new URL(rawUrl);
  } catch {
    throw new FreqtradeApiError('misconfigured', 'Adresse interne Freqtrade invalide');
  }

  if (!['http:', 'https:'].includes(baseUrl.protocol) || !username || !password) {
    throw new FreqtradeApiError('misconfigured', 'Client Freqtrade non configuré');
  }

  return {
    baseUrl: baseUrl.toString().replace(/\/$/, ''),
    authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
    timeoutMs,
  };
}

export async function freqtradeGet<T>(endpoint: string): Promise<T> {
  if (!endpoint.startsWith('/') || endpoint.startsWith('//')) {
    throw new FreqtradeApiError('misconfigured', 'Endpoint Freqtrade refusé');
  }

  const { baseUrl, authorization, timeoutMs } = configuration();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/v1${endpoint}`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: authorization },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (response.status === 401 || response.status === 403) {
      throw new FreqtradeApiError('unauthorized', 'Authentification interne Freqtrade refusée', response.status);
    }
    if (!response.ok) {
      throw new FreqtradeApiError('unavailable', `Freqtrade répond HTTP ${response.status}`, response.status);
    }

    const body = await response.text();
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new FreqtradeApiError('invalid_response', 'Réponse Freqtrade invalide');
    }
  } catch (error) {
    if (error instanceof FreqtradeApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new FreqtradeApiError('timeout', 'Délai de réponse Freqtrade dépassé');
    }
    throw new FreqtradeApiError('unavailable', 'Moteur Freqtrade injoignable');
  } finally {
    clearTimeout(timer);
  }
}

export async function freqtradePost<T>(endpoint: string, body?: unknown): Promise<T> {
  if (!endpoint.startsWith('/') || endpoint.startsWith('//')) {
    throw new FreqtradeApiError('misconfigured', 'Endpoint Freqtrade refusé');
  }

  const { baseUrl, authorization, timeoutMs } = configuration();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/v1${endpoint}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (response.status === 401 || response.status === 403) {
      throw new FreqtradeApiError('unauthorized', 'Authentification interne Freqtrade refusée', response.status);
    }
    if (!response.ok) {
      throw new FreqtradeApiError('unavailable', `Freqtrade répond HTTP ${response.status}`, response.status);
    }
    const raw = await response.text();
    if (!raw) return {} as T;
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new FreqtradeApiError('invalid_response', 'Réponse Freqtrade invalide');
    }
  } catch (error) {
    if (error instanceof FreqtradeApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new FreqtradeApiError('timeout', 'Délai de réponse Freqtrade dépassé');
    }
    throw new FreqtradeApiError('unavailable', 'Moteur Freqtrade injoignable');
  } finally {
    clearTimeout(timer);
  }
}

export function publicFreqtradeError(error: unknown) {
  if (error instanceof FreqtradeApiError) return { code: error.code, message: error.message };
  return { code: 'unavailable' as const, message: 'Moteur Freqtrade indisponible' };
}
