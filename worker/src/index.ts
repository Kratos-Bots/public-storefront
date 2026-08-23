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
  async fetch(request, env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
