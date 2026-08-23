import { proxyApi } from './proxy';
import { proxyMedia } from './media';

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
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
