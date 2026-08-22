import { describe, expect, test } from 'bun:test';

import { createSessionToken, verifySessionToken } from './auth-session';

const secret = 'a'.repeat(32);

describe('personal session', () => {
  test('accepts an intact token during its seven-day window', () => {
    const token = createSessionToken('owner', secret, 1_000);
    expect(verifySessionToken(token, 'owner', secret, 2_000)).toBe(true);
  });

  test('rejects tampering, another owner and expiration', () => {
    const token = createSessionToken('owner', secret, 1_000);
    expect(verifySessionToken(`${token}x`, 'owner', secret, 2_000)).toBe(false);
    expect(verifySessionToken(token, 'intruder', secret, 2_000)).toBe(false);
    expect(verifySessionToken(token, 'owner', secret, 1_000 + 7 * 24 * 60 * 60 * 1000)).toBe(false);
  });
});
