type JsonObject = Record<string, unknown>;

const TOOL_STATES = new Set(['on', 'job', 'warm', 'off']);

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : undefined;
}

function finite(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function names(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 80)).slice(0, 50)
    : [];
}

export function publicRackState(value: unknown) {
  const source = object(value);
  const budget = object(source.budget);
  const tools = object(source.tools);
  return {
    status: 'configured' as const,
    schema_version: finite(source.schema_version),
    profile_id: text(source.profile_id),
    label: text(source.label),
    strategy: text(source.strategy),
    timeframe: text(source.timeframe),
    pair_limit: finite(source.pair_limit),
    budget: {
      cpu: finite(budget.cpu),
      memory_mb: finite(budget.memory_mb),
      max_parallel_jobs: finite(budget.max_parallel_jobs),
    },
    indicators: names(source.indicators),
    protections: names(source.protections),
    tools: Object.fromEntries(
      Object.entries(tools)
        .filter(([name, state]) => name.length <= 80 && typeof state === 'string' && TOOL_STATES.has(state))
        .slice(0, 30),
    ),
    config_applied: source.config_applied === true,
    restart_required: source.restart_required === true,
    activation_status: text(source.activation_status),
    updated_at: text(source.updated_at),
  };
}
