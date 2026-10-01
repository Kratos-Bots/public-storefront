import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));

import { DEFAULT_PREVIEW_AS, useEditorStore } from '@/builder/editor/store.ts';
import { EditorCanvas } from '@/builder/editor/EditorCanvas.tsx';
import { prepareDocs } from '@/builder/editor/prepare.ts';
import { toPageSet } from '@/builder/editor/page-set.ts';
import { checkRules } from '@/builder/rules.ts';
import type { ComponentData, DocKey, PuckDoc } from '@/builder/types.ts';

const root = { props: { title: '', description: '', chrome: 'shell' as const } };
const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const stored = (content: ComponentData[]): PuckDoc => ({ root, content });

/** What v0.7.0 stored: containers with no slot keys at all, the old toggles on the header. */
const SHELL = stored([
  c('Header', 'Header-default', { variant: 'auto', topBar: true, sticky: true, search: false, cartIcon: 'hide', nav: [c('Heading', 'owner-nav', { text: 'Sale' })] }),
  c('PageOutlet', 'PageOutlet-default'),
]);
const CART = stored([c('CartContents', 'CartContents-default')]);
const ORDERS = stored([c('AccountNav', 'AccountNav-default')]);

const find = (items: ComponentData[], type: string) => items.find((x) => x.type === type)!;

describe('a stored v0.7.0 shell, cart and account doc, loaded and edited', () => {
  beforeEach(() => {
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null });
  });

  it('emits full slots, leaves nav alone, maps the legacy toggles, and raises no part-required issue', () => {
    const store = useEditorStore.getState();
    store.load({ layout: 'storefront', pageSet: { schemaVersion: 1, shell: SHELL, pages: { cart: CART, 'account.orders': ORDERS } }, readOnly: false });
    // One edit per document through the store, as Puck's onChange would send it.
    for (const key of ['shell', 'cart', 'account.orders'] as DocKey[]) {
      useEditorStore.getState().selectDoc(key);
      const s = useEditorStore.getState();
      const doc = s.docs[key]!;
      s.updateDoc(key, { ...doc, root: { props: { ...doc.root.props, title: `edited ${key}` } } });
    }
    const s = useEditorStore.getState();
    const docs = prepareDocs(s.docs);
    expect(docs.shell!.root.props.title).toBe('edited shell');
    const set = toPageSet(docs, 'storefront');

    const header = find(set.shell.content, 'Header').props;
    for (const slot of ['start', 'nav', 'middle', 'end']) expect(Array.isArray(header[slot]), slot).toBe(true);
    expect((header.start as ComponentData[]).map((x) => x.type)).toEqual(['HeaderBrand']);
    expect((header.nav as ComponentData[]).map((x) => x.props.id)).toEqual(['owner-nav']);
    expect(header.middle).toEqual([]); // search: false
    const end = header.end as ComponentData[];
    expect(end.find((x) => x.type === 'HeaderCart')!.props.icon).toBe('hide');
    expect('search' in header || 'cartIcon' in header || 'accountIcon' in header).toBe(false);

    const cart = find(set.pages.cart!.content, 'CartContents').props;
    for (const slot of ['head', 'main', 'summary']) expect((cart[slot] as ComponentData[]).length, slot).toBeGreaterThan(0);
    const nav = find(set.pages['account.orders']!.content, 'AccountNav').props;
    expect((nav.head as ComponentData[]).length).toBeGreaterThan(0);
    expect(Array.isArray(nav.body)).toBe(true);

    for (const key of ['shell', 'cart', 'account.orders'] as DocKey[]) {
      const rules = checkRules(docs[key]!, key, 'storefront').map((i) => i.rule);
      expect(rules.filter((r) => r.startsWith('part-required')), key).toEqual([]);
      expect(rules, key).not.toContain('part-required:Header.HeaderBrand');
    }
  });
});

function renderCanvas(docKey: DocKey) {
  const router = createMemoryRouter([{ path: '/__builder/*', element: <EditorCanvas /> }], { initialEntries: [`/__builder/doc/${docKey}`] });
  return render(
    <MantineProvider>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

async function puckShown() {
  await vi.waitFor(() => expect(document.querySelector('[data-sf-builder-header]')).not.toBeNull());
  for (const el of document.querySelectorAll<HTMLElement>('.Puck')) el.style.visibility = 'visible';
}

describe('Add block menu on a document with two part groups', () => {
  afterEach(cleanup);

  it.each(['cart', 'account.orders'] as DocKey[])('%s: every group has its own id and React key', async (docKey) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    useEditorStore.setState({ status: 'waiting', layout: 'storefront', readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null });
    useEditorStore.getState().load({ layout: 'storefront', pageSet: null, readOnly: false });
    useEditorStore.getState().selectDoc(docKey);
    renderCanvas(docKey);
    await puckShown();
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
    const menu = screen.getByRole('menu', { name: 'Blocks to add' });
    const groups = within(menu).getAllByRole('group');
    const labelled = groups.map((g) => g.getAttribute('aria-labelledby')!);
    expect(new Set(labelled).size).toBe(labelled.length);
    for (const g of groups) expect(menu.querySelectorAll(`[id="${g.getAttribute('aria-labelledby')}"]`)).toHaveLength(1);
    // Each group is named by its own title, not the first part group's.
    for (const g of groups) expect(g).toHaveAccessibleName(g.querySelector('[id]')!.textContent!);
    expect(groups.filter((g) => /parts$/.test(g.querySelector('[id]')!.textContent!)).length).toBeGreaterThanOrEqual(2);
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key|unique "key"/);
    error.mockRestore();
  });
});
