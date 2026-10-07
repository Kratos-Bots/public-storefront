import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Suspense } from 'react';
import type { Catalog, Product, ProductCoa } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import { baseProduct, catalogOf, FULL, MATE, SETTINGS } from './helpers/product-fixtures.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined, telegram: false, opened: [] as string[] }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: (id: number | null) => ({
    data: id == null ? undefined : state.catalog?.products.find((p) => p.id === id), isPending: false, isError: false, refetch: () => {},
  }),
}));
vi.mock('@/lib/telegram-webapp.ts', async (orig) => {
  const real = await orig<typeof import('@/lib/telegram-webapp.ts')>();
  return { ...real, isTelegramWebApp: () => state.telegram, openExternalLink: (url: string) => { state.opened.push(url); } };
});

import { Coa } from '@/features/catalog/Coa.tsx';
import { ProductDetailSheet } from '@/features/catalog/ProductDetailSheet.tsx';
import { RenderDoc } from '@/builder/render.tsx';
import { group, part } from '@/builder/parts.ts';
import type { ComponentData, LayoutKind, PuckDoc } from '@/builder/types.ts';
import { PageSetContext } from '@/builder/page-set-context.ts';
import { EMPTY_ROOT } from '@/builder/types.ts';

const KEY = '0123456789abcdef'.repeat(2);
const coa = (over: Partial<ProductCoa> = {}): ProductCoa => ({
  id: 1, lab: 'Example Labs', sampleName: 'Example Peptide', mgAmount: 10, purity: 99.957, batch: 'B-100', testDate: '12 March 2026',
  reportUrl: 'https://example.com/report/1', fileKey: null, ...over,
});
const OLDER = coa({ id: 2, lab: 'Second Labs', purity: 98.5, mgAmount: 5, batch: 'B-90', testDate: '1 January 2026', reportUrl: null, fileKey: KEY });

beforeEach(() => { state.telegram = false; state.opened = []; });
afterEach(cleanup);

describe('Coa', () => {
  it('draws the latest report as a list of facts with a link out', () => {
    render(<Coa coas={[coa()]} />);
    const facts = screen.getAllByRole('term').map((t) => t.textContent);
    expect(facts).toEqual(['Lab', 'Sample', 'Amount', 'Purity', 'Batch', 'Tested']);
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['Example Labs', 'Example Peptide', '10 mg', '99.957%', 'B-100', '12 March 2026']);
    const link = screen.getByRole('link', { name: /View report/ });
    expect(link).toHaveAttribute('href', 'https://example.com/report/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('data-sf-part', 'button');
    expect(screen.queryByText(/Previous reports/)).toBeNull();
  });

  it('shows only the latest while there is no history', () => {
    render(<Coa coas={[coa()]} />);
    expect(screen.queryByText('Second Labs')).toBeNull();
    expect(document.querySelector('details')).toBeNull();
  });

  it('folds earlier reports under a closed disclosure, each with its own link', () => {
    const { container } = render(<Coa coas={[coa(), OLDER]} />);
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(within(details).getByText('Previous reports (1)')).toBeTruthy();
    const row = within(details).getByRole('listitem');
    expect(row).toHaveTextContent('1 January 2026');
    expect(row).toHaveTextContent('Second Labs');
    expect(row).toHaveTextContent('Purity 98.5%');
    expect(row).toHaveTextContent('5 mg');
    expect(row).toHaveTextContent('Batch B-90');
    expect(within(row).getByRole('link', { name: /View report: 1 January 2026/ })).toHaveAttribute('href', `/media/coas/2/${KEY}`);
    // The latest report stays outside the disclosure.
    expect(within(details).queryByText('99.957%')).toBeNull();
  });

  it('omits values the report does not have, and still shows the link', () => {
    render(<Coa coas={[coa({ lab: null, sampleName: ' ', mgAmount: null, purity: 99.5, batch: null, testDate: null })]} />);
    expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual(['Purity']);
    expect(screen.getByRole('link', { name: /View report/ })).toBeTruthy();
  });

  it('shows the facts without a link when the report has no address', () => {
    render(<Coa coas={[coa({ reportUrl: null, fileKey: null })]} />);
    expect(screen.getAllByRole('term')).toHaveLength(6);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows a link without facts when only the address is known', () => {
    render(<Coa coas={[coa({ lab: null, sampleName: null, mgAmount: null, purity: null, batch: null, testDate: null })]} />);
    expect(screen.queryByRole('term')).toBeNull();
    expect(screen.getByRole('link', { name: /View report/ })).toBeTruthy();
  });

  it('drops entries with nothing displayable before choosing the latest', () => {
    const empty = coa({ id: 9, lab: null, sampleName: null, mgAmount: null, purity: null, batch: null, testDate: null, reportUrl: null, fileKey: null });
    render(<Coa coas={[empty, coa({ id: 3, lab: 'Third Labs' })]} />);
    expect(screen.getByText('Third Labs')).toBeTruthy();
    expect(document.querySelector('details')).toBeNull();
  });

  it('names an earlier report without date or lab by its sample, else a plain "Report"', () => {
    render(<Coa coas={[coa(), coa({ id: 4, lab: null, testDate: null, sampleName: 'Sample Z', purity: null, mgAmount: null, batch: null }),
      coa({ id: 5, lab: null, testDate: null, sampleName: null, purity: null, mgAmount: null, batch: null, reportUrl: 'https://example.com/r/5' })]} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Sample Z');
    expect(rows[1]).toHaveTextContent('Report');
  });

  it.each([[undefined], [null], [[]], [[coa({ lab: null, sampleName: null, mgAmount: null, purity: null, batch: null, testDate: null, reportUrl: null })]]])(
    'renders nothing for %j', (coas) => {
      const { container } = render(<Coa coas={coas as ProductCoa[] | undefined} />);
      expect(container.innerHTML).toBe('');
    },
  );

  it('opens links through Telegram with an absolute address', () => {
    state.telegram = true;
    render(<Coa coas={[coa({ reportUrl: null, fileKey: KEY })]} />);
    const link = screen.getByRole('link', { name: /View report/ });
    expect(fireEvent.click(link)).toBe(false); // default prevented: the page does not navigate
    expect(state.opened).toEqual([`${window.location.origin}/media/coas/1/${KEY}`]);
  });

  it('leaves links alone outside Telegram', () => {
    render(<Coa coas={[coa()]} />);
    expect(fireEvent.click(screen.getByRole('link', { name: /View report/ }))).toBe(true);
    expect(state.opened).toEqual([]);
  });
});

/* ------------------------------------------------------------------ placement */

const withCoas = (coas: ProductCoa[] | undefined): Product => {
  const p = { ...FULL };
  if (coas) p.coas = coas;
  else delete p.coas;
  return p;
};
const setup = (product: Product) => {
  state.settings = SETTINGS;
  state.catalog = catalogOf(product, MATE);
};
const slotDoc = (slots: Record<string, ComponentData[]>, id = 'pd'): PuckDoc => ({ root: { props: { ...EMPTY_ROOT } },
  content: [{ type: 'ProductDetail', props: { id, sku: 'inherit', top: [], media: [], main: [], below: [], ...slots } }] });
const p = (type: string, id = 'pd') => part(type, id);
const main = (id: string, withCoa: boolean | 'nested'): ComponentData[] => {
  const priceRow = group('ProductGroup', id, 'priceRow', [p('ProductPrice', id), p('ProductStock', id)]);
  const coaPart = p('ProductCoa', id);
  return [p('ProductTitle', id), withCoa === 'nested' ? group('ProductGroup', id, 'identityText', [coaPart]) : priceRow,
    ...(withCoa === 'nested' ? [p('ProductPrice', id)] : []), p('ProductAddToCart', id), p('ProductDescription', id), ...(withCoa === true ? [coaPart] : []), p('ProductAsk', id)];
};

function renderPage(doc: PuckDoc, layout: LayoutKind = 'storefront') {
  return render(
    <QueryClientProvider client={new QueryClient()}><MantineProvider env="test"><MemoryRouter initialEntries={['/p/1']}><Routes>
      <Route path="/p/:id" element={<Suspense fallback={null}><RenderDoc doc={doc} docKey="product" layout={layout} /></Suspense>} />
    </Routes></MemoryRouter></MantineProvider></QueryClientProvider>,
  );
}
const coaSections = (root: ParentNode) => [...root.querySelectorAll('h2, h3')].filter((h) => h.textContent === 'Certificate of analysis');

describe('ProductDetail page placement', () => {
  it('draws the report itself, after the main content, when the document has no ProductCoa', async () => {
    setup(withCoas([coa()]));
    const { container } = renderPage(slotDoc({ main: main('pd', false) }));
    await screen.findByRole('heading', { level: 1 });
    const sections = coaSections(container);
    expect(sections).toHaveLength(1);
    const detail = sections[0]!.closest('section')!.parentElement!;
    // It sits in the same column as the owner's parts, last.
    expect(detail.lastElementChild).toBe(sections[0]!.closest('section'));
    expect(within(detail).getByRole('heading', { level: 1 })).toBeTruthy();
  });

  it('draws only the placed part, never twice', async () => {
    setup(withCoas([coa()]));
    const { container } = renderPage(slotDoc({ main: main('pd', true) }));
    await screen.findByRole('heading', { level: 1 });
    expect(coaSections(container)).toHaveLength(1);
    expect(container.querySelectorAll('a[href="https://example.com/report/1"]')).toHaveLength(1);
    // Placed between the description and the ask block, where the owner put it.
    const section = coaSections(container)[0]!.closest('section')!;
    expect(section.nextElementSibling?.querySelector('#ask-heading')).toBeTruthy();
  });

  it('a placed part inside a group still counts as placed', async () => {
    setup(withCoas([coa()]));
    const { container } = renderPage(slotDoc({ main: main('pd', 'nested') }));
    await screen.findByRole('heading', { level: 1 });
    expect(coaSections(container)).toHaveLength(1);
  });

  it('a placed part in another slot also stops the automatic one', async () => {
    setup(withCoas([coa()]));
    const { container } = renderPage(slotDoc({ main: main('pd', false), below: [p('ProductCoa')] }));
    await screen.findByRole('heading', { level: 1 });
    expect(coaSections(container)).toHaveLength(1);
  });

  it('draws nothing, and no wrapper, for a product without a displayable COA', async () => {
    const doc = () => slotDoc({ main: main('pd', false) });
    setup(withCoas(undefined));
    const none = renderPage(doc());
    await screen.findByRole('heading', { level: 1 });
    const baseline = none.container.innerHTML;
    expect(coaSections(none.container)).toHaveLength(0);
    cleanup();

    setup(withCoas([]));
    const empty = renderPage(doc());
    await screen.findByRole('heading', { level: 1 });
    expect(empty.container.innerHTML).toBe(baseline);
    cleanup();

    setup(withCoas([coa({ lab: null, sampleName: null, mgAmount: null, purity: null, batch: null, testDate: null, reportUrl: null })]));
    const blank = renderPage(doc());
    await screen.findByRole('heading', { level: 1 });
    expect(blank.container.innerHTML).toBe(baseline);
  });

  it('a placed ProductCoa on a product without COAs renders nothing', async () => {
    setup(withCoas(undefined));
    const { container } = renderPage(slotDoc({ main: main('pd', true) }));
    await screen.findByRole('heading', { level: 1 });
    expect(coaSections(container)).toHaveLength(0);
    expect(container.querySelector('[class*="Coa"]')).toBeNull();
  });

  it('the default document gets the automatic report too', async () => {
    setup(withCoas([coa(), OLDER]));
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}><MantineProvider env="test"><MemoryRouter initialEntries={['/p/1']}><Routes>
        <Route path="/p/:id" element={<Suspense fallback={null}><RenderDoc doc={slotDoc({ main: main('pd', false) })} docKey="product" layout="storefront" /></Suspense>} />
      </Routes></MemoryRouter></MantineProvider></QueryClientProvider>,
    );
    await screen.findByRole('heading', { level: 1 });
    expect(coaSections(container)).toHaveLength(1);
    expect(screen.getByText('Previous reports (1)')).toBeTruthy();
  });
});

describe('ProductDetail sheet placement', () => {
  const sheet = (set: PuckDoc | null) => render(
    <QueryClientProvider client={new QueryClient()}><MantineProvider env="test"><MemoryRouter>
      <PageSetContext.Provider value={{ layout: 'menu', pageSet: set ? { schemaVersion: 1, shell: { root: { props: { ...EMPTY_ROOT } }, content: [], zones: {} }, pages: { product: set } } : null }}>
        <ProductDetailSheet productId={1} onClose={() => {}} onSelect={() => {}} />
      </PageSetContext.Provider>
    </MemoryRouter></MantineProvider></QueryClientProvider>,
  );
  const sheetCoas = () => coaSections(document.body);

  it('the built-in sheet gets the report before the upsells', () => {
    setup(withCoas([coa()]));
    sheet(null);
    const heads = sheetCoas();
    expect(heads).toHaveLength(1);
    const upsells = [...document.querySelectorAll('h3')].find((h) => h.textContent === 'Often bought with this');
    if (upsells) expect(heads[0]!.compareDocumentPosition(upsells) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a document that places the part draws it once', () => {
    setup(withCoas([coa()]));
    sheet(slotDoc({ main: main('pd', true) }));
    expect(sheetCoas()).toHaveLength(1);
  });

  it('a document without the part gets the automatic one, once', () => {
    setup(withCoas([coa(), OLDER]));
    sheet(slotDoc({ main: main('pd', false) }));
    expect(sheetCoas()).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /View report/ }).length).toBe(2);
  });

  it('an older backend (no coas field) draws nothing and does not throw', () => {
    const product = baseProduct({ id: 1 });
    expect('coas' in product).toBe(false);
    setup(product);
    sheet(null);
    expect(sheetCoas()).toHaveLength(0);
  });
});
