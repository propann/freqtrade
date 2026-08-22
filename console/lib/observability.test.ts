import { describe, expect, test } from 'bun:test';
import { publicObservabilitySummary } from './observability';

describe('publicObservabilitySummary', () => {
  test('exposes only operational fields', () => {
    const result = publicObservabilitySummary({
      schema_version: 1,
      window_hours: 168,
      generated_at: '2026-08-22T00:00:00Z',
      samples: 12,
      status_counts: { healthy: 10, degraded: 2, injected: 99 },
      cpu_average_pct: { average: 12, max: 42 },
      ram_pct: { average: 31, max: 52 },
      exchange_errors: { max_in_log_window: 3, samples_with_errors: 2, max_consecutive_alert_samples: 1 },
      modes: ['dry_run', 'invalid'],
      token: 'must-not-leak',
      logs: ['must-not-leak'],
    });
    expect(result.samples).toBe(12);
    expect(result.exchangeErrors.maxInLogWindow).toBe(3);
    expect(result.modes).toEqual(['dry_run']);
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
  });

  test('normalizes malformed values', () => {
    const result = publicObservabilitySummary(null);
    expect(result.samples).toBeNull();
    expect(result.statusCounts).toEqual({ healthy: 0, degraded: 0, critical: 0 });
  });
});
