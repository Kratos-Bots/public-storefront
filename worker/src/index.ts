import { proxyApi } from './proxy';

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
    if (pathname === '/api' || pathname.startsWith('/api/')) return proxyApi(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
