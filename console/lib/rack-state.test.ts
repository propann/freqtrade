import { describe, expect, test } from 'bun:test';

import { publicRackState } from './rack-state';

describe('public rack state', () => {
  test('keeps operational fields and rejects unknown or invalid data', () => {
    const result = publicRackState({
      profile_id: 'baseline',
      budget: { cpu: 1, memory_mb: 1024, password: 'hidden' },
      indicators: ['ema_50', 42],
      tools: { backtest: 'job', injected: 'root' },
      secret: 'must-not-leak',
    });
    expect(result.profile_id).toBe('baseline');
    expect(result.indicators).toEqual(['ema_50']);
    expect(result.tools).toEqual({ backtest: 'job' });
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    expect(JSON.stringify(result)).not.toContain('hidden');
  });
});
