export type RuntimeEnvironment = Record<string, string | undefined>;

const PLACEHOLDERS = ['change-me', 'changeme', 'replace-me', 'example', 'your-'];

function strong(value: string | undefined, minimum: number): boolean {
  if (!value || value.length < minimum) return false;
  const lowered = value.toLowerCase();
  return !PLACEHOLDERS.some((placeholder) => lowered.includes(placeholder));
}

export function accessIsReady(environment: RuntimeEnvironment = process.env): boolean {
  return Boolean(
    strong(environment.FREQTRADE_ADMIN_USER, 3)
    && strong(environment.FREQTRADE_ADMIN_PASSWORD, 16)
    && strong(environment.FREQTRADE_JWT_SECRET, 32),
  );
}
