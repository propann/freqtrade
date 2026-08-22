import { beforeEach, describe, expect, test } from 'bun:test';

import { clearLoginFailures, loginAllowance, recordLoginFailure } from './login-guard';

describe('login guard', () => {
  beforeEach(clearLoginFailures);

  test('temporarily blocks repeated failures and later releases access', () => {
    for (let index = 0; index < 8; index += 1) recordLoginFailure(1_000 + index);
    expect(loginAllowance(2_000).allowed).toBe(false);
    expect(loginAllowance(1_000 + 15 * 60 * 1000).allowed).toBe(true);
  });
});
