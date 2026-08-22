export function sameOriginRequest(headers: Record<string, string | string[] | undefined>): boolean {
  const fetchSite = headers['sec-fetch-site'];
  if (fetchSite && fetchSite !== 'same-origin') return false;

  const origin = headers.origin;
  const host = headers.host;
  if (typeof origin !== 'string' || typeof host !== 'string') return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
