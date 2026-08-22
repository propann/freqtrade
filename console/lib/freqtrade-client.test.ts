import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { FreqtradeApiError, freqtradeGet, freqtradePost } from './freqtrade-client';

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  url: process.env.FREQTRADE_API_URL,
  username: process.env.FREQTRADE_USERNAME,
  password: process.env.FREQTRADE_PASSWORD,
  timeout: process.env.FREQTRADE_API_TIMEOUT_MS,
};

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  process.env.FREQTRADE_API_URL = 'http://freqtrade-engine:8080';
  process.env.FREQTRADE_USERNAME = 'operator';
  process.env.FREQTRADE_PASSWORD = 'server-only-password';
  process.env.FREQTRADE_API_TIMEOUT_MS = '500';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnvironment('FREQTRADE_API_URL', originalEnvironment.url);
  restoreEnvironment('FREQTRADE_USERNAME', originalEnvironment.username);
  restoreEnvironment('FREQTRADE_PASSWORD', originalEnvironment.password);
  restoreEnvironment('FREQTRADE_API_TIMEOUT_MS', originalEnvironment.timeout);
  mock.restore();
});

describe('freqtradeGet', () => {
  test('returns JSON and keeps credentials server-side', async () => {
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toHaveProperty('Authorization');
      return new Response(JSON.stringify({ status: 'pong' }), { status: 200 });
    }) as typeof fetch;

    expect(await freqtradeGet<{ status: string }>('/ping')).toEqual({ status: 'pong' });
  });

  test('sends bounded control calls as POST', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toEndWith('/api/v1/reload_config');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toHaveProperty('Authorization');
      return new Response(JSON.stringify({ status: 'reloading' }), { status: 200 });
    }) as typeof fetch;
    expect(await freqtradePost('/reload_config')).toEqual({ status: 'reloading' });
  });

  test('classifies authentication failures', async () => {
    globalThis.fetch = mock(async () => new Response('{}', { status: 401 })) as typeof fetch;
    await expect(freqtradeGet('/show_config')).rejects.toMatchObject<FreqtradeApiError>({ code: 'unauthorized' });
  });

  test('classifies invalid JSON', async () => {
    globalThis.fetch = mock(async () => new Response('not-json', { status: 200 })) as typeof fetch;
    await expect(freqtradeGet('/show_config')).rejects.toMatchObject<FreqtradeApiError>({ code: 'invalid_response' });
  });

  test('classifies timeouts', async () => {
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })) as typeof fetch;
    await expect(freqtradeGet('/health')).rejects.toMatchObject<FreqtradeApiError>({ code: 'timeout' });
  });
});
