import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { RackAgentError, publicRackAgentError, rackAgentActivate, rackAgentGet } from './rack-agent-client';

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  url: process.env.RACK_AGENT_URL,
  token: process.env.RACK_AGENT_TOKEN,
  activateTimeout: process.env.RACK_AGENT_ACTIVATE_TIMEOUT_MS,
};

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  process.env.RACK_AGENT_URL = 'http://rack-agent:9191';
  process.env.RACK_AGENT_TOKEN = 'agent-only-token';
  process.env.RACK_AGENT_ACTIVATE_TIMEOUT_MS = '500';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnvironment('RACK_AGENT_URL', originalEnvironment.url);
  restoreEnvironment('RACK_AGENT_TOKEN', originalEnvironment.token);
  restoreEnvironment('RACK_AGENT_ACTIVATE_TIMEOUT_MS', originalEnvironment.activateTimeout);
  mock.restore();
});

describe('rackAgentGet', () => {
  test('sends the bearer token and returns JSON', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toEndWith('/profiles');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer agent-only-token' });
      return new Response(JSON.stringify({ profiles: [{ id: 'baseline' }] }), { status: 200 });
    }) as typeof fetch;
    expect(await rackAgentGet<{ profiles: unknown[] }>('/profiles')).toEqual({ profiles: [{ id: 'baseline' }] });
  });

  test('refuses when the token is missing', async () => {
    delete process.env.RACK_AGENT_TOKEN;
    await expect(rackAgentGet('/profiles')).rejects.toMatchObject<RackAgentError>({ code: 'misconfigured' });
  });

  test('classifies missing auth as unauthorized', async () => {
    globalThis.fetch = mock(async () => new Response('{}', { status: 401 })) as typeof fetch;
    await expect(rackAgentGet('/profiles')).rejects.toMatchObject<RackAgentError>({ code: 'unauthorized' });
  });
});

describe('rackAgentActivate', () => {
  test('posts the profile id to /activate', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toEndWith('/activate');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ profile_id: 'baseline' });
      return new Response(JSON.stringify({ profile_id: 'baseline', activation_status: 'healthy' }), { status: 200 });
    }) as typeof fetch;
    expect(await rackAgentActivate('baseline')).toEqual({ profile_id: 'baseline', activation_status: 'healthy' });
  });

  test('surfaces a business rejection (open trades, live mode…) as code=rejected', async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ error: 'Déploiement refusé : des positions sont ouvertes' }), { status: 409 })) as typeof fetch;
    await expect(rackAgentActivate('baseline')).rejects.toMatchObject<RackAgentError>({
      code: 'rejected',
      message: 'Déploiement refusé : des positions sont ouvertes',
    });
  });

  test('classifies an unknown profile as not_found', async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ error: 'Profil inconnu' }), { status: 404 })) as typeof fetch;
    await expect(rackAgentActivate('missing')).rejects.toMatchObject<RackAgentError>({ code: 'not_found' });
  });

  test('classifies timeouts', async () => {
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })) as typeof fetch;
    await expect(rackAgentActivate('baseline')).rejects.toMatchObject<RackAgentError>({ code: 'timeout' });
  });
});

describe('publicRackAgentError', () => {
  test('passes through known errors', () => {
    expect(publicRackAgentError(new RackAgentError('rejected', 'nope'))).toEqual({ code: 'rejected', message: 'nope' });
  });

  test('falls back to unavailable for unknown errors', () => {
    expect(publicRackAgentError(new Error('boom'))).toEqual({ code: 'unavailable', message: 'Agent du rack indisponible' });
  });
});
