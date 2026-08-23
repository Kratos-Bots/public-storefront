import type { Env } from './index';

const RULES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^\/media\/products\/(\d+)\/image$/, (m) => `api/v1/products/${m[1]}/image`],
  [/^\/media\/settings\/branding\/(logo|favicon)$/, (m) => `api/v1/settings/branding/${m[1]}`],
  [/^\/media\/storefront-settings\/branding\/(logo|favicon)$/, (m) => `api/v1/storefront-settings/branding/${m[1]}`],
];

export function mediaTarget(pathname: string, search: string, backendUrl: string): URL | null {
  if (pathname.includes('..')) return null;
  for (const [re, build] of RULES) {
    const m = pathname.match(re);
    if (m) {
      const base = backendUrl.endsWith('/') ? backendUrl : backendUrl + '/';
      return new URL(base + build(m) + search);
    }
  }
  return null;
}

export async function proxyMedia(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Only GET/HEAD are ever accepted — no request body is forwarded for a
  // media fetch, so there's no `duplex: 'half'` concern here (unlike
  // proxy.ts's POST/PUT/etc. passthrough).
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
  const url = new URL(request.url);
  const target = mediaTarget(url.pathname, url.search, env.BACKEND_URL);
  if (!target) return new Response('Not found', { status: 404 });

  const cache = caches.default;
  const key = new Request(target.toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), { method: 'GET', headers: { accept: request.headers.get('accept') ?? '*/*' } });
  } catch {
    return new Response('Upstream unavailable', { status: 502 });
  }
  if (!upstream.ok) return new Response(null, { status: upstream.status === 404 ? 404 : 502 });

  const headers = new Headers();
  headers.set('content-type', upstream.headers.get('content-type') ?? 'application/octet-stream');
  headers.set('cache-control', 'public, max-age=86400');
  const etag = upstream.headers.get('etag');
  if (etag) headers.set('etag', etag);
  const res = new Response(upstream.body, { status: 200, headers });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
