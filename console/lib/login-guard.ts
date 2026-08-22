const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
let failures: number[] = [];

function recentFailures(now: number): number[] {
  failures = failures.filter((timestamp) => now - timestamp < WINDOW_MS);
  return failures;
}

export function loginAllowance(now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const recent = recentFailures(now);
  if (recent.length < MAX_FAILURES) return { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - recent[0])) / 1000)),
  };
}

export function recordLoginFailure(now = Date.now()): void {
  recentFailures(now).push(now);
}

export function clearLoginFailures(): void {
  failures = [];
}
