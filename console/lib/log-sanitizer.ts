const KEYED_SECRET = /(api[_-]?key|api[_-]?secret|secret|password|passwd|token|authorization)(\s*[=:]\s*|\s+)([^\s,;]+)/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const TELEGRAM_TOKEN = /\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g;

export function sanitizeLogLine(value: unknown): string {
  let line = String(value).replace(BEARER, 'Bearer [REDACTED]');
  line = line.replace(KEYED_SECRET, '$1$2[REDACTED]').replace(TELEGRAM_TOKEN, '[REDACTED]');

  const configuredSecrets = [
    process.env.FREQTRADE_PASSWORD,
    process.env.EXCHANGE_API_KEY,
    process.env.EXCHANGE_API_SECRET,
    process.env.TELEGRAM_BOT_TOKEN,
  ].filter((secret): secret is string => Boolean(secret && secret.length >= 8));
  for (const secret of configuredSecrets) line = line.split(secret).join('[REDACTED]');
  return line.slice(0, 2_000);
}
