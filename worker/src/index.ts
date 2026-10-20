import { proxyApi } from './proxy';
import { proxyMedia } from './media';
import { getAppIdentity, rewriteHtml, serveAppIcon, serveManifest } from './app-shell';

interface EnvBindings {
  ASSETS: Fetcher;
  BACKEND_URL: string;
}

export type Env = EnvBindings;

// Merges the bindings into the global Cloudflare.Env namespace so `import {
// env } from 'cloudflare:test'` (used in worker/test/*) is typed with them.
// (Named EnvBindings, not Env, to avoid `interface Env extends Env {}`
// resolving as a circular self-reference under this module's `declare global`.)
declare global {
  namespace Cloudflare {
    interface Env extends EnvBindings {}
  }
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    // Post-deploy check (Spec 3): unauthenticated, no backend round-trip —
    // only proves the Worker itself is up and serving.
    if (pathname === '/healthz') {
      return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
    }
    if (pathname === '/api' || pathname.startsWith('/api/')) return proxyApi(request, env, ctx);
    if (pathname.startsWith('/media/')) return proxyMedia(request, env, ctx);
    if (pathname === '/manifest.webmanifest') return serveManifest(request, env, ctx);
    if (pathname === '/apple-touch-icon.png' || pathname.startsWith('/app-icon/')) return serveAppIcon(request, env, ctx);
    // Every other path is a static asset (or the SPA fallback). Only HTML gets the injected head tag;
    // the identity (edge-cached) is looked up only once we know the response is HTML.
    if (request.method !== 'GET') return env.ASSETS.fetch(request);
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 200 || !(asset.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) return asset;
    return rewriteHtml(asset, await getAppIdentity(env, ctx));
  },
} satisfies ExportedHandler<Env>;
