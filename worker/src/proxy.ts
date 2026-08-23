import type { Env } from './index';

const ALLOWED_PREFIXES = ['storefront/', 'catalog', 'orders/', 'verify/'];
const CACHE_RULES: Array<[RegExp, number]> = [
  [/^storefront\/settings$/, 30],
  [/^catalog$/, 60],
  [/^catalog\/products\/\d+$/, 60],
];
const STRIP_REQUEST_HEADERS = ['cookie', 'host', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip'];

export function isAllowedApiPath(rest: string): boolean {
  if (!rest || rest.includes('..')) return false;
  return ALLOWED_PREFIXES.some((p) => (p.endsWith('/') ? rest.startsWith(p) : rest === p || rest.startsWith(p + '/')));
}

export function buildBackendUrl(backendUrl: string, rest: string, search: string): URL {
  const base = backendUrl.endsWith('/') ? backendUrl : backendUrl + '/';
  return new URL(`${base}api/v1/public/${rest}${search}`);
}

export function cacheTtlFor(rest: string): number {
  for (const [re, ttl] of CACHE_RULES) if (re.test(rest)) return ttl;
  return 0;
}

function envelope(status: number, error: string): Response {
  return new Response(JSON.stringify({ success: false, data: null, error }), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function forwardHeaders(request: Request): Headers {
  const out = new Headers();
  request.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (STRIP_REQUEST_HEADERS.includes(k) || k.startsWith('cf-')) return;
    out.set(key, value);
  });
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) out.set('X-Forwarded-For', ip);
  out.set('X-Forwarded-Proto', 'https');
  return out;
}

export async function proxyApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const rest = url.pathname.replace(/^\/api\//, '');
  if (!isAllowedApiPath(rest)) return envelope(404, 'Not found');

  const target = buildBackendUrl(env.BACKEND_URL, rest, url.search);
  const ttl = request.method === 'GET' && !request.headers.has('authorization') ? cacheTtlFor(rest) : 0;
  const cache = caches.default;
  const cacheKey = new Request(target.toString(), { method: 'GET' });

  if (ttl > 0) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const h = new Headers(hit.headers); h.set('X-SF-Cache', 'HIT');
      return new Response(hit.body, { status: hit.status, headers: h });
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: request.method,
      headers: forwardHeaders(request),
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
  } catch {
    return envelope(502, 'Backend unavailable');
  }

  const headers = new Headers(upstream.headers);
  headers.delete('set-cookie');
  headers.set('X-SF-Cache', ttl > 0 ? 'MISS' : 'BYPASS');
  headers.set('cache-control', ttl > 0 ? `public, max-age=${ttl}` : 'no-store');
  const response = new Response(upstream.body, { status: upstream.status, headers });
  if (ttl > 0 && upstream.status === 200) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
