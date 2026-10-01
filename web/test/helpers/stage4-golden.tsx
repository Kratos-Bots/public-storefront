/**
 * Stage 4 golden harness (spec §12, task 1). One golden per case, rendered three ways: the v0.7.0
 * entry component, the default document through RenderDoc, and a stored v0.7.0-shaped document
 * through the guard and RenderDoc. Goldens are v0.7.0's markup — never regenerate them.
 */
import { Suspense, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { RenderDoc } from '@/builder/render.tsx';
import { validateDoc } from '@/builder/guard.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import type { ComponentData, DocKey, LayoutKind, PageRootProps, PuckDoc } from '@/builder/types.ts';
import { expectGolden } from './golden.ts';

export interface Mounted { container: HTMLElement; baseElement: HTMLElement }
export interface OutletOpt { search: string; setSearch: () => void }
interface MountOpts { path: string; route?: string; outlet?: OutletOpt }

const NO_SEARCH: OutletOpt = { search: '', setSearch: () => {} };

/** QueryClient + MantineProvider(env="test") + MemoryRouter; `route` is the Route path pattern, `path` the visited URL. */
export function mountAt(ui: ReactNode, opts: MountOpts): Mounted {
  const { container, baseElement } = render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={[opts.path]}>
          <Routes>
            <Route element={<Outlet context={opts.outlet ?? NO_SEARCH} />}>
              <Route path={opts.route ?? '*'} element={<Suspense fallback={null}>{ui}</Suspense>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
  return { container, baseElement };
}

function renderGuarded(doc: unknown, docKey: DocKey, layout: LayoutKind, opts: MountOpts): Mounted {
  const guarded = validateDoc(doc, docKey, layout);
  if (!guarded.doc) throw new Error(`stage4 harness: the stored ${docKey} document was rejected: ${JSON.stringify(guarded.issues)}`);
  return mountAt(<RenderDoc doc={guarded.doc} docKey={docKey} layout={layout} />, opts);
}

/**
 * One stored v0.7.0-shaped component → a guarded doc rendered through RenderDoc. A shell document
 * must hold exactly one PageOutlet, so one is appended when `content` has none (the tests mock the
 * shell's routed column to draw nothing).
 */
export function mountDoc(docKey: DocKey, layout: LayoutKind, content: ComponentData[], opts: MountOpts & { root?: Partial<PageRootProps> }): Mounted {
  const items = docKey === 'shell' && !content.some((c) => c.type === 'PageOutlet')
    ? [...content, { type: 'PageOutlet', props: { id: 'PageOutlet-default' } }]
    : content;
  const doc: PuckDoc = { root: { props: { title: '', description: '', chrome: 'shell', ...opts.root } }, content: items, zones: {} };
  return renderGuarded(doc, docKey, layout, opts);
}

/** The default document for (docKey, layout) rendered through RenderDoc. */
export function mountDefault(docKey: DocKey, layout: LayoutKind, opts: MountOpts): Mounted {
  const doc = defaultDoc(docKey, layout);
  if (!doc) throw new Error(`stage4 harness: no default document for ${docKey} (${layout})`);
  return renderGuarded(doc, docKey, layout, opts);
}

/** `expectGolden(`stage4-${name}`, html)`. */
export function expectStage4(name: string, html: string): void {
  expectGolden(`stage4-${name}`, html);
}
