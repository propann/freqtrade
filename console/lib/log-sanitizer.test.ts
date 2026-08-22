import { afterEach, describe, expect, test } from 'bun:test';

import { sanitizeLogLine } from './log-sanitizer';

describe('log sanitizer', () => {
  afterEach(() => { delete process.env.EXCHANGE_API_SECRET; });

  test('redacts keyed, bearer, Telegram and configured values', () => {
    process.env.EXCHANGE_API_SECRET = 'configured-secret-value';
    const line = sanitizeLogLine(
      'password=hunter2 Authorization: Bearer abc.def 123456:abcdefghijklmnopqrstuvwxyz configured-secret-value',
    );
    expect(line).not.toContain('hunter2');
    expect(line).not.toContain('abc.def');
    expect(line).not.toContain('123456:abcdefghijklmnopqrstuvwxyz');
    expect(line).not.toContain('configured-secret-value');
  });

  test('bounds each public line', () => {
    expect(sanitizeLogLine('x'.repeat(3_000))).toHaveLength(2_000);
  });
});
