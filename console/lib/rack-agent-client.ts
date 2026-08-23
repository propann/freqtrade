const DEFAULT_AGENT_URL = 'http://rack-agent:9191';
const DEFAULT_TIMEOUT_MS = 4000;
// Activation polls the engine's health a few times with its own 3s-timeout
// HTTP calls before confirming or rolling back (see scripts/rackctl.py
// deploy()) -- give that room instead of racing it. Configurable (mainly
// so tests can shrink it) the same way FREQTRADE_API_TIMEOUT_MS is.
const DEFAULT_ACTIVATE_TIMEOUT_MS = 15_000;

function activateTimeoutMs(): number {
  const requested = Number(process.env.RACK_AGENT_ACTIVATE_TIMEOUT_MS || DEFAULT_ACTIVATE_TIMEOUT_MS);
  return Number.isFinite(requested) ? Math.min(30_000, Math.max(500, requested)) : DEFAULT_ACTIVATE_TIMEOUT_MS;
}

export type RackAgentErrorCode =
  | 'misconfigured'
  | 'timeout'
  | 'unauthorized'
  | 'unavailable'
  | 'invalid_response'
  | 'rejected'
  | 'not_found';

export class RackAgentError extends Error {
  code: RackAgentErrorCode;
  status?: number;

  constructor(code: RackAgentErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'RackAgentError';
    this.code = code;
    this.status = status;
  }
}

function configuration() {
  const rawUrl = process.env.RACK_AGENT_URL || DEFAULT_AGENT_URL;
  const token = process.env.RACK_AGENT_TOKEN || '';

  let baseUrl: URL;
  try {
    baseUrl = new URL(rawUrl);
  } catch {
    throw new RackAgentError('misconfigured', 'Adresse interne du rack invalide');
  }

  if (!['http:', 'https:'].includes(baseUrl.protocol) || !token) {
    throw new RackAgentError('misconfigured', 'Agent du rack non configuré');
  }

  return { baseUrl: baseUrl.toString().replace(/\/$/, ''), token };
}

async function request<T>(method: 'GET' | 'POST', path: string, body: unknown, timeoutMs: number): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new RackAgentError('misconfigured', 'Route agent refusée');
  }

  const { baseUrl, token } = configuration();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });

    const raw = await response.text();
    let parsed: unknown = undefined;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new RackAgentError('invalid_response', 'Réponse agent invalide');
      }
    }

    if (response.status === 401) throw new RackAgentError('unauthorized', 'Authentification agent refusée', 401);
    if (response.status === 404) throw new RackAgentError('not_found', 'Ressource inconnue', 404);
    if (response.status === 409) {
      const message = parsed && typeof parsed === 'object' && 'error' in (parsed as Record<string, unknown>)
        ? String((parsed as Record<string, unknown>).error) : 'Activation refusée';
      throw new RackAgentError('rejected', message, 409);
    }
    if (!response.ok) throw new RackAgentError('unavailable', `Agent répond HTTP ${response.status}`, response.status);

    return (parsed ?? {}) as T;
  } catch (error) {
    if (error instanceof RackAgentError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RackAgentError('timeout', 'Délai de réponse agent dépassé');
    }
    throw new RackAgentError('unavailable', 'Agent du rack injoignable');
  } finally {
    clearTimeout(timer);
  }
}

export function rackAgentGet<T>(path: string): Promise<T> {
  return request<T>('GET', path, undefined, DEFAULT_TIMEOUT_MS);
}

export function rackAgentActivate<T>(profileId: string): Promise<T> {
  return request<T>('POST', '/activate', { profile_id: profileId }, activateTimeoutMs());
}

export function publicRackAgentError(error: unknown) {
  if (error instanceof RackAgentError) return { code: error.code, message: error.message };
  return { code: 'unavailable' as const, message: 'Agent du rack indisponible' };
}
