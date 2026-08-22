import { describe, expect, test } from 'bun:test';

import { sameOriginRequest } from './request-guard';

describe('mutation request guard', () => {
  test('accepts the exact origin and rejects cross-site or missing origins', () => {
    expect(sameOriginRequest({ origin: 'https://core.example', host: 'core.example', 'sec-fetch-site': 'same-origin' })).toBe(true);
    expect(sameOriginRequest({ origin: 'https://evil.example', host: 'core.example', 'sec-fetch-site': 'cross-site' })).toBe(false);
    expect(sameOriginRequest({ host: 'core.example' })).toBe(false);
  });
});
