import type { Env } from './index';
import { buildBackendUrl } from './proxy';

/** How long the backend's app identity (manifest + icons) is kept at the edge. */
const IDENTITY_TTL = 300;
/** A failed identity fetch is remembered briefly so an outage is not retried on every page view. */
const FALLBACK_TTL = 30;
const ICON_VARIANT = /^(?:192|512|maskable-512|apple-180|badge)$/;

export interface AppIdentity extends Record<string, unknown> {
  name: string;
}

const FALLBACK_MANIFEST = { name: 'Shop', short_name: 'Shop', display: 'standalone', start_url: '/', icons: [] as unknown[] };

function jsonResponse(body: unknown, ttl: number): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${ttl}` },
  });
}

/**
 * The backend's app identity (name, colours, icons), cached 300 s in the edge cache. One fetch feeds both
 * the manifest route and the HTML rewriter. Any failure yields the plain "Shop" fallback.
 */
export async function getAppIdentity(env: Env, ctx: ExecutionContext): Promise<AppIdentity> {
  const target = buildBackendUrl(env.BACKEND_URL, 'storefront/app-manifest', '');
  const cache = caches.default;
  const key = new Request(target.toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) {
    try {
      const data = (await hit.json()) as AppIdentity;
      if (data && typeof data.name === 'string') return data;
    } catch { /* fall through to a fresh fetch */ }
  }
  try {
    const res = await fetch(target.toString(), { headers: { accept: 'application/json' } });
    if (res.ok) {
      const raw = (await res.json()) as { data?: unknown } & Record<string, unknown>;
      // The backend wraps responses in { success, data }; accept a bare object too.
      const body = (raw && typeof raw.data === 'object' && raw.data ? raw.data : raw) as AppIdentity;
      if (body && typeof body.name === 'string' && body.name) {
        ctx.waitUntil(cache.put(key, jsonResponse(body, IDENTITY_TTL)));
        return body;
      }
    }
  } catch { /* backend unreachable */ }
  ctx.waitUntil(cache.put(key, jsonResponse(FALLBACK_MANIFEST, FALLBACK_TTL)));
  return FALLBACK_MANIFEST as AppIdentity;
}

export async function serveManifest(_request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const identity = await getAppIdentity(env, ctx);
  const manifest = { ...identity, id: '/', start_url: '/', scope: '/', display: 'standalone' };
  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': `public, max-age=${IDENTITY_TTL}` },
  });
}

/** `/app-icon/<variant>.png` and `/apple-touch-icon.png` (variant `apple-180`), proxied from the backend. */
export async function serveAppIcon(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { pathname } = new URL(request.url);
  const variant = pathname === '/apple-touch-icon.png'
    ? 'apple-180'
    : /^\/app-icon\/([a-z0-9-]+)\.png$/.exec(pathname)?.[1] ?? '';
  if (!ICON_VARIANT.test(variant)) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });

  const target = buildBackendUrl(env.BACKEND_URL, `storefront/app-icon/${variant}.png`, '');
  const cache = caches.default;
  const key = new Request(target.toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString());
  } catch {
    return new Response('Backend unavailable', { status: 502, headers: { 'cache-control': 'no-store' } });
  }
  if (!upstream.ok) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  const response = new Response(upstream.body, {
    status: 200,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'image/png', 'cache-control': `public, max-age=${IDENTITY_TTL}` },
  });
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

/** Attribute-safe escaping for text placed inside a double-quoted HTML attribute. */
export function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Adds the iOS home-screen title to an HTML response's head; everything else is left alone. Non-HTML
 * responses (and bodiless ones) are returned untouched, byte for byte.
 */
export function rewriteHtml(response: Response, identity: Pick<AppIdentity, 'name'>): Response {
  const type = response.headers.get('content-type') ?? '';
  if (!type.toLowerCase().includes('text/html') || !response.body) return response;
  const tag = `<meta name="apple-mobile-web-app-title" content="${escapeAttr(identity.name)}">`;
  return new HTMLRewriter()
    .on('head', { element(el) { el.append(tag, { html: true }); } })
    .transform(response);
}
