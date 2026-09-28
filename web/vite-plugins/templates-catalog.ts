import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer, type Plugin, type ViteDevServer } from 'vite';

interface CatalogBuild {
  json: unknown;
  previews: Array<{ id: string; sourceRel: string; target: string }>;
  errors: string[];
}

const MIME: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

async function loadCatalog(server: ViteDevServer): Promise<CatalogBuild> {
  const mod = (await server.ssrLoadModule('/src/templates/catalog.ts')) as { buildCatalog: () => CatalogBuild };
  return mod.buildCatalog();
}

/**
 * Emits dist/templates.json (+ preview images under dist/templates/<id>/) and serves both in dev.
 * The manifests are loaded through a throwaway Vite SSR server so the build reads exactly what
 * the app bundles. Any manifest error fails the build.
 */
export function templatesCatalog(): Plugin {
  let root = '';
  let outDir = '';
  let command: 'build' | 'serve' = 'serve';
  let built: CatalogBuild | null = null;

  return {
    name: 'sf-templates-catalog',
    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
      command = config.command;
    },
    async buildStart() {
      if (command !== 'build') return;
      const server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        resolve: { alias: { '@': path.join(root, 'src') } },
        server: { middlewareMode: true, hmr: false, watch: null },
        optimizeDeps: { noDiscovery: true, include: [] },
      });
      try {
        built = await loadCatalog(server);
      } finally {
        await server.close();
      }
      if (built.errors.length > 0) this.error(`Invalid templates:\n  ${built.errors.join('\n  ')}`);
    },
    closeBundle() {
      if (command !== 'build' || !built) return;
      writeFileSync(path.join(outDir, 'templates.json'), JSON.stringify(built.json, null, 2) + '\n');
      for (const p of built.previews) {
        const target = path.join(outDir, p.target);
        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(path.join(root, 'src/templates', p.sourceRel), target);
      }
    },
    configureServer(server) {
      // Dev: the build fails on invalid manifests; the dev server only skips them at runtime, so
      // shout once at startup (and on every /templates.json request) instead of failing silently.
      // Vitest reuses this config — skip there, the templates-catalog test covers it.
      const reportErrors = (cat: CatalogBuild) => {
        if (cat.errors.length > 0) console.error(`[templates] invalid templates (skipped at runtime, will fail the build):\n  ${cat.errors.join('\n  ')}`);
      };
      if (!process.env.VITEST) {
        server.httpServer?.once('listening', () => {
          loadCatalog(server).then(reportErrors, (err: unknown) => console.error('[templates] could not load the template catalog', err));
        });
      }
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        try {
          if (url === '/templates.json') {
            const cat = await loadCatalog(server);
            reportErrors(cat);
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(cat.json));
            return;
          }
          const m = /^\/templates\/([a-z0-9-]+)\/preview\.(webp|png|jpg|jpeg)$/.exec(url);
          if (m) {
            const cat = await loadCatalog(server);
            const hit = cat.previews.find((p) => p.id === m[1] && p.target.endsWith(`.${m[2]}`));
            const file = hit ? path.join(root, 'src/templates', hit.sourceRel) : null;
            if (file && existsSync(file)) {
              res.setHeader('Content-Type', MIME[m[2]!]!);
              res.end(readFileSync(file));
              return;
            }
          }
        } catch (err) {
          next(err);
          return;
        }
        next();
      });
    },
  };
}
