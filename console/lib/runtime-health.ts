export type RuntimeEnvironment = Record<string, string | undefined>;

export function accessIsReady(environment: RuntimeEnvironment = process.env): boolean {
  return Boolean(
    environment.FREQTRADE_ADMIN_USER
    && environment.FREQTRADE_ADMIN_PASSWORD
    && (environment.FREQTRADE_JWT_SECRET?.length ?? 0) >= 32,
  );
}
