import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

const MAX_PROXY_BYTES = 5 * 1024 * 1024;

function isDisallowedProxyHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
    return true;
  }
  const match172 = host.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const octet = Number(match172[1]);
    if (octet >= 16 && octet <= 31) return true;
  }
  return false;
}

function isAllowedCoverProxyUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (isDisallowedProxyHost(parsed.hostname)) return null;
    if (parsed.pathname.includes('/storage/v1/object/sign/')) return null;

    const queryLower = parsed.search.toLowerCase();
    if (
      queryLower.includes('token=') ||
      queryLower.includes('sig=') ||
      queryLower.includes('signature=') ||
      queryLower.includes('x-amz-signature=')
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const MAX_COVER_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function fetchCoverWithValidatedRedirects(initialUrl: URL): Promise<Response> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_COVER_REDIRECTS; hop++) {
    const upstream = await fetch(currentUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MeelieFont/1.0)',
        Accept: 'image/*',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });

    if (!REDIRECT_STATUSES.has(upstream.status)) {
      return upstream;
    }

    const location = upstream.headers.get('location');
    // Discard the redirect body so the socket can be reused.
    await upstream.arrayBuffer().catch(() => undefined);
    if (!location) {
      // Redirect without a target: surface it as a failed fetch.
      return new Response(null, { status: upstream.status, statusText: upstream.statusText });
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      throw new Error('Invalid redirect target');
    }

    const validated = isAllowedCoverProxyUrl(nextUrl.toString());
    if (!validated) {
      // A permitted public URL must not be able to bounce us to a disallowed
      // (e.g. private/internal) destination.
      throw new Error('Redirect target is not allowed');
    }
    currentUrl = validated;
  }

  throw new Error('Too many redirects');
}

async function handleCoverProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): Promise<void> {
  const reqUrl = req.url || '';
  if (!reqUrl.startsWith('/__cover-proxy')) {
    next();
    return;
  }

  try {
    const requestUrl = new URL(reqUrl, 'http://localhost');
    const targetParam = requestUrl.searchParams.get('url') || '';
    const targetUrl = isAllowedCoverProxyUrl(targetParam);
    if (!targetUrl) {
      res.statusCode = 400;
      res.end('Invalid cover URL');
      return;
    }

    // Follow redirects manually so each hop is re-validated against the
    // SSRF allow-list. `redirect: 'follow'` would transparently follow a
    // permitted public URL that redirects to an internal/private target.
    const upstream = await fetchCoverWithValidatedRedirects(targetUrl);

    if (!upstream.ok) {
      res.statusCode = 502;
      res.end('Upstream cover fetch failed');
      return;
    }

    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      res.statusCode = 502;
      res.end('Upstream response is not an image');
      return;
    }

    const declaredLength = Number(upstream.headers.get('content-length') || '0');
    if (declaredLength > MAX_PROXY_BYTES) {
      res.statusCode = 502;
      res.end('Cover image exceeds size limit');
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_PROXY_BYTES) {
      res.statusCode = 502;
      res.end('Invalid cover image size');
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(buffer);
  } catch {
    res.statusCode = 502;
    res.end('Cover proxy error');
  }
}

function coverColorProxyPlugin(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    void handleCoverProxyRequest(req, res, next);
  };

  return {
    name: 'meeliefont-cover-color-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), coverColorProxyPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify; file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
