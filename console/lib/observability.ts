type JsonObject = Record<string, any>;

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metric(value: unknown) {
  const item = object(value);
  return { average: finite(item.average), max: finite(item.max) };
}

export function publicObservabilitySummary(value: unknown) {
  const source = object(value);
  const counts = object(source.status_counts);
  const exchange = object(source.exchange_errors);
  return {
    status: 'configured' as const,
    schemaVersion: finite(source.schema_version),
    windowHours: finite(source.window_hours),
    generatedAt: typeof source.generated_at === 'string' ? source.generated_at : null,
    from: typeof source.from === 'string' ? source.from : null,
    to: typeof source.to === 'string' ? source.to : null,
    samples: finite(source.samples),
    statusCounts: {
      healthy: finite(counts.healthy) || 0,
      degraded: finite(counts.degraded) || 0,
      critical: finite(counts.critical) || 0,
    },
    cpuAveragePct: metric(source.cpu_average_pct),
    ramPct: metric(source.ram_pct),
    freshnessAgeSeconds: metric(source.freshness_age_seconds),
    maxOpenTrades: finite(source.max_open_trades),
    restartCountLowerBound: finite(source.restart_count_lower_bound),
    exchangeErrors: {
      maxInLogWindow: finite(exchange.max_in_log_window) || 0,
      samplesWithErrors: finite(exchange.samples_with_errors) || 0,
      maxConsecutiveAlertSamples: finite(exchange.max_consecutive_alert_samples) || 0,
    },
    strategies: Array.isArray(source.strategies)
      ? source.strategies.filter((item: unknown) => typeof item === 'string').slice(0, 20)
      : [],
    modes: Array.isArray(source.modes)
      ? source.modes.filter((item: unknown) => ['dry_run', 'live', 'unknown'].includes(String(item)))
      : [],
  };
}
