import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';

const created = vi.hoisted(() => ({ options: [] as unknown[] }));
// The plugin uses only createServer at runtime (everything else is a type); the real module can't
// load under jsdom (esbuild's TextEncoder invariant), so it is replaced outright.
vi.mock('vite', () => ({
  createServer: vi.fn(async (options: unknown) => {
    created.options.push(options);
    return {
      ssrLoadModule: async () => ({ buildCatalog: () => ({ json: { schemaVersion: 1, templates: [] }, previews: [], errors: [] }) }),
      close: async () => undefined,
    };
  }),
}));

import { templatesCatalog } from '../vite-plugins/templates-catalog.ts';

type Hook = (...args: unknown[]) => unknown;
const hook = (plugin: Plugin, name: keyof Plugin) => plugin[name] as unknown as Hook;

beforeEach(() => { created.options.length = 0; });

describe('templatesCatalog plugin', () => {
  it('loads manifests through a nested SSR server that reuses the app config\'s resolve.alias', async () => {
    const plugin = templatesCatalog();
    const alias = [{ find: '@', replacement: '/repo/web/src' }, { find: /^~lib\//, replacement: '/repo/web/lib/' }];
    hook(plugin, 'configResolved')({ root: '/repo/web', command: 'build', build: { outDir: 'dist' }, resolve: { alias } } as unknown as ResolvedConfig);
    await hook(plugin, 'buildStart').call({ error: (m: string) => { throw new Error(m); } });
    expect(created.options).toHaveLength(1);
    expect((created.options[0] as { resolve: { alias: unknown } }).resolve.alias).toBe(alias);
  });

  it('dev middleware answers only GET and HEAD; other methods fall through untouched', async () => {
    const plugin = templatesCatalog();
    let middleware!: (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => Promise<void>;
    const ssrLoadModule = vi.fn(async () => ({ buildCatalog: () => ({ json: { schemaVersion: 1, templates: [] }, previews: [], errors: [] }) }));
    const server = { httpServer: null, ssrLoadModule, middlewares: { use: (fn: typeof middleware) => { middleware = fn; } } } as unknown as ViteDevServer;
    hook(plugin, 'configResolved')({ root: '/repo/web', command: 'serve', build: { outDir: 'dist' }, resolve: { alias: [] } } as unknown as ResolvedConfig);
    hook(plugin, 'configureServer')(server);

    const call = async (method: string) => {
      const res = { setHeader: vi.fn(), end: vi.fn() };
      const next = vi.fn();
      await middleware({ method, url: '/templates.json' } as IncomingMessage, res as unknown as ServerResponse, next);
      return { res, next };
    };
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const { res, next } = await call(method);
      expect(next, method).toHaveBeenCalledWith();
      expect(res.end, method).not.toHaveBeenCalled();
    }
    expect(ssrLoadModule).not.toHaveBeenCalled();
    for (const method of ['GET', 'HEAD']) {
      const { res, next } = await call(method);
      expect(next, method).not.toHaveBeenCalled();
      expect(res.end, method).toHaveBeenCalledWith(JSON.stringify({ schemaVersion: 1, templates: [] }));
    }
  });
});
