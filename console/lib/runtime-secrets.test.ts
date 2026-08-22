import { describe, expect, test } from 'bun:test';

import { applyRuntimeSecretsUpdate, EMPTY_RUNTIME_SECRETS } from './runtime-secrets';

describe('runtime secrets', () => {
  test('accepts a complete exchange and Telegram replacement', () => {
    const value = applyRuntimeSecretsUpdate(EMPTY_RUNTIME_SECRETS, {
      exchangeKey: 'exchange-key', exchangeSecret: 'exchange-secret',
      telegramEnabled: true, telegramToken: '12345:abcdefghijklmnopqrstuvwxyz',
      telegramChatId: '12345', telegramAuthorizedUsers: '12345, 67890',
    });
    expect(value.exchange.key).toBe('exchange-key');
    expect(value.telegram.authorized_users).toEqual(['12345', '67890']);
  });

  test('preserves blank secret inputs and rejects partial pairs', () => {
    const current = applyRuntimeSecretsUpdate(EMPTY_RUNTIME_SECRETS, {
      exchangeKey: 'exchange-key', exchangeSecret: 'exchange-secret',
    });
    expect(applyRuntimeSecretsUpdate(current, { exchangeKey: '', exchangeSecret: '' })).toEqual(current);
    expect(() => applyRuntimeSecretsUpdate(EMPTY_RUNTIME_SECRETS, { exchangeKey: 'exchange-key' })).toThrow();
  });

  test('refuses enabling incomplete Telegram configuration', () => {
    expect(() => applyRuntimeSecretsUpdate(EMPTY_RUNTIME_SECRETS, { telegramEnabled: true })).toThrow();
  });
});
