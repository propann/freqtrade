import { describe, expect, test } from 'bun:test';

import { accessIsReady } from './runtime-health';

describe('runtime health', () => {
  test('is ready only when every access secret is usable', () => {
    expect(accessIsReady({
      FREQTRADE_ADMIN_USER: 'owner',
      FREQTRADE_ADMIN_PASSWORD: 'strong-password',
      FREQTRADE_JWT_SECRET: 'a'.repeat(32),
    })).toBe(true);

    expect(accessIsReady({ FREQTRADE_ADMIN_USER: 'owner' })).toBe(false);
    expect(accessIsReady({
      FREQTRADE_ADMIN_USER: 'owner',
      FREQTRADE_ADMIN_PASSWORD: 'strong-password',
      FREQTRADE_JWT_SECRET: 'too-short',
    })).toBe(false);
  });
});
