export function resolveAuthRedirectUrl(configuredUrl: string | undefined, currentOrigin: string): string {
  const value = configuredUrl?.trim();
  if (!value) return new URL(currentOrigin).origin;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VITE_AUTH_REDIRECT_URL must be a valid absolute URL.');
  }

  const isLocalHttp = url.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('VITE_AUTH_REDIRECT_URL must use HTTPS (HTTP is allowed only for localhost).');
  }
  if (url.username || url.password) {
    throw new Error('VITE_AUTH_REDIRECT_URL must not contain credentials.');
  }

  return url.origin;
}
