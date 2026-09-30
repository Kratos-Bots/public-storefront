import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { z } from 'zod';
import { defineBlock, slot, type AnyBlock } from '@/builder/define.ts';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

const guard = vi.hoisted(() => ({ calls: 0, fail: false, real: false }));
vi.mock('@/builder/guard.ts', async (orig) => {
  const actual = (await orig()) as typeof import('@/builder/guard.ts');
  return {
    ...actual,
    validateDoc: (doc: PuckDoc, ...rest: [never, never]) => {
      guard.calls += 1;
      if (guard.real) return actual.validateDoc(doc, ...rest);
      return guard.fail ? { doc: null, issues: [] } : { doc, issues: [] };
    },
  };
});
vi.mock('@/builder/registry.ts', async (orig) => {
  const real = (await orig()) as { BLOCKS: Record<string, AnyBlock> };
  const { CardTileFamily } = await import('@/builder/families.ts');
  const frame = defineBlock<{ id: string; content: ComponentData[] }>({
    name: 'TestFrame', label: 'Frame', category: 'catalogue', layouts: 'all', routeBound: true, slots: ['content'], style: false,
    schema: z.object({ content: slot() }), defaultProps: { content: [] },
    render: (p) => <CardTileFamily.PartHost name="TestFrame" props={p as Record<string, unknown>} />,
  });
  const name = defineBlock<{ id: string }>({
    name: 'TestName', label: 'Name', category: 'part', part: { family: 'card-tile' }, layouts: 'all', routeBound: false, slots: [], style: false,
    schema: z.object({}), defaultProps: {}, render: (p) => <CardTileFamily.PartHost name="TestName" props={p as Record<string, unknown>} />,
  });
  return { ...real, BLOCKS: { ...real.BLOCKS, TestFrame: frame as AnyBlock, TestName: name as AnyBlock } };
});

// PuckShell mount (fix round 1): a bare frame so the test sees only the providers around it.
vi.mock('@/app/layout.ts', () => ({ useEffectiveLayout: () => 'storefront' }));
vi.mock('@/api/pages.ts', () => ({ fetchPageSet: () => new Promise(() => {}), fetchPublished: () => new Promise(() => {}) }));
vi.mock('@/layouts/Chromeless.tsx', async () => {
  const { Outlet } = await import('react-router');
  return { Chromeless: () => <div data-mark="chromeless"><Outlet /></div> };
});

import { compileCard } from '@/builder/cards.ts';
import { CardDesignBoundary, CardDesignProvider, resetCardDesignLog, useCardDesign } from '@/builder/card-design.tsx';
import { CardTileFamily, type CardData } from '@/builder/families.ts';
import { baseProduct } from './helpers/product-fixtures.ts';
import { PageSetOverrideProvider, PuckShell } from '@/builder/runtime.tsx';
import { usePageSetContext } from '@/builder/page-set-context.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { PageSet } from '@/builder/types.ts';

const tileDoc = (): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content: [
  { type: 'TestFrame', props: { id: 'f', content: [{ type: 'TestName', props: { id: 'n' } }] } },
] });
const VIEWS = {
  TestFrame: ({ props }: { props: Record<string, unknown> }) => <article>{(props.content as () => unknown)() as never}</article>,
  TestName: () => <h3>{CardTileFamily.useData().product.displayName}</h3>,
};
const data = (id: number, name: string): CardData => ({ product: baseProduct({ id, displayName: name }), eager: false, hasSiblingImages: true, index: 0 });

afterEach(() => { cleanup(); guard.calls = 0; guard.fail = false; guard.real = false; resetCardDesignLog(); });

describe('compileCard (spec §6.3)', () => {
  it('guards and compiles once per document object and layout, however many cards render', () => {
    const doc = tileDoc();
    const design = compileCard(doc, 'tile', 'storefront')!;
    for (let i = 0; i < 500; i += 1) expect(compileCard(doc, 'tile', 'storefront')).toBe(design);
    expect(guard.calls).toBe(1);
    const { container } = render(<>{Array.from({ length: 500 }, (_, i) => <div key={i}>{design.render(data(i, `P${i}`), VIEWS)}</div>)}</>);
    expect(container.querySelectorAll('article')).toHaveLength(500);
    expect(guard.calls).toBe(1);
  });
  it('each card shows its own product (shared elements, distinct providers — Review Focus 3)', () => {
    const design = compileCard(tileDoc(), 'tile', 'storefront')!;
    const { container } = render(<>{design.render(data(1, 'Oats'), VIEWS)}{design.render(data(2, 'Tin'), VIEWS)}</>);
    expect([...container.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Oats', 'Tin']);
  });
  it('a new document object compiles again; a guard failure is null', () => {
    compileCard(tileDoc(), 'tile', 'storefront');
    compileCard(tileDoc(), 'tile', 'storefront');
    expect(guard.calls).toBe(2);
    guard.fail = true;
    expect(compileCard(tileDoc(), 'tile', 'storefront')).toBeNull();
    expect(compileCard('not a doc', 'tile', 'storefront')).toBeNull();
  });
});

describe('compileCard tolerates what the public read lets through (cardsOf checks only an array content)', () => {
  const malformed = (): unknown[] => [
    { content: [{ type: 'TestFrame', props: { id: 'f', content: [{ type: 'TestName', props: { id: 'n' } }] } }] },
    { root: 'nope', content: [{ type: 'TestFrame', props: { id: 'f', content: [{ type: 'TestName', props: { id: 'n' } }] } }] },
    { root: { props: 7 }, content: [{ type: 'TestFrame', props: { content: [{ type: 'TestName', props: {} }] } }] },
    { root: { props: {} }, content: [{ type: 'TestFrame' }, { type: 'TestName', props: null }, null, 'x', { props: { id: 'q' } }] },
    { root: null, content: [{ type: 'TestFrame', props: { id: 'f', content: 'not a slot' } }] },
    { content: [] },
  ];
  it.each([true, false])('never throws, compiling or rendering (real guard: %s)', (real) => {
    guard.real = real;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const doc of malformed()) {
      let design: ReturnType<typeof compileCard> = null;
      expect(() => { design = compileCard(doc, 'tile', 'storefront'); }).not.toThrow();
      const { container } = render(
        <CardDesignProvider cards={{ tile: doc as PuckDoc }} layout="storefront">
          <CardDesignBoundary kind="tile"><Consumer /></CardDesignBoundary>
        </CardDesignProvider>,
      );
      if (design === null) expect(container.textContent).toBe('built-in');
      cleanup();
    }
    error.mockRestore();
  });
});

function Consumer({ throwing = false }: { throwing?: boolean }) {
  const design = useCardDesign('tile');
  const Boom = () => { throw new Error('boom'); };
  return design ? <>{design.render(data(1, 'Oats'), throwing ? { ...VIEWS, TestName: Boom } : VIEWS)}</> : <p>built-in</p>;
}

describe('CardDesignProvider / CardDesignBoundary', () => {
  it('no cards ⇒ no design; a card doc ⇒ its design', () => {
    expect(render(<CardDesignProvider cards={undefined} layout="storefront"><Consumer /></CardDesignProvider>).container.textContent).toBe('built-in');
    cleanup();
    expect(render(<CardDesignProvider cards={{ tile: tileDoc() }} layout="storefront"><Consumer /></CardDesignProvider>).container.textContent).toBe('Oats');
  });
  it('a design that throws falls back to built-in for every list, logged once', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <CardDesignProvider cards={{ tile: tileDoc() }} layout="storefront">
        <CardDesignBoundary kind="tile"><Consumer throwing /></CardDesignBoundary>
        <CardDesignBoundary kind="tile"><Consumer /></CardDesignBoundary>
      </CardDesignProvider>,
    );
    expect(container.textContent).toBe('built-inbuilt-in');
    expect(error.mock.calls.filter((c) => String(c[0]).includes('[builder] card design')).length).toBe(1);
    error.mockRestore();
  });
  it('useCardDesign outside a provider is null', () => {
    expect(render(<Consumer />).container.textContent).toBe('built-in');
  });
});

describe('PuckShell mounts the card design and page-set providers (spec §6.2)', () => {
  function PageProbe() {
    const ctx = usePageSetContext();
    return <><Consumer /><i data-mark="ctx">{ctx ? `${ctx.layout}:${ctx.pageSet ? 'set' : 'none'}` : 'no-context'}</i></>;
  }
  const mountShell = (pageSet: PageSet) => render(
    <QueryClientProvider client={new QueryClient()}>
      <PageSetOverrideProvider pageSet={pageSet}>
        <RouterProvider router={createMemoryRouter([{
          path: '/', element: <PuckShell />,
          children: [{ path: 'pages/:slug', handle: { routeKey: 'page' }, element: <PageProbe /> }],
        }], { initialEntries: ['/pages/plain'] })} />
      </PageSetOverrideProvider>
    </QueryClientProvider>,
  );
  it('a chrome:none page renders the published tile design and has page-set context', () => {
    const set: PageSet = {
      schemaVersion: 1,
      shell: { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [] },
      pages: { 'page:plain': { root: { props: { title: '', description: '', chrome: 'none' } }, content: [] } },
      cards: { tile: tileDoc() },
    };
    const { container } = mountShell(set);
    expect(container.querySelector('[data-mark="chromeless"]')).not.toBeNull();
    expect(container.querySelector('h3')?.textContent).toBe('Oats');
    expect(container.querySelector('[data-mark="ctx"]')?.textContent).toBe('storefront:set');
  });
});
