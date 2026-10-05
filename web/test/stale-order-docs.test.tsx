import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense } from 'react';
import type { OrderDetail } from '@/types/orders.ts';

// Stored documents outlive the code that wrote them: these pin what a page set saved while the
// key-based order page existed does now that the page and its blocks are gone.
const s = vi.hoisted(() => ({ order: undefined as unknown }));
vi.mock('@/features/account/queries.ts', async (orig) => ({
  ...(await orig<typeof import('@/features/account/queries.ts')>()),
  useOrder: () => s.order,
}));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    telegramWebApp: { mode: 'off' }, features: { layout: 'storefront', ordering: true, accounts: true },
  }),
}));

import { RenderDoc } from '@/builder/render.tsx';
import { validateDoc } from '@/builder/guard.ts';
import { partId } from '@/builder/parts.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { resolveDoc } from '@/builder/runtime.tsx';
import { docsFromPageSet, toPageSet } from '@/builder/editor/page-set.ts';
import { FIXED_ROUTE_KEYS, type ComponentData, type PageSet, type PuckDoc } from '@/builder/types.ts';
import classes from '@/features/account/Account.module.css';
import orderClasses from '@/features/account/OrderDetail.module.css';

afterEach(cleanup);

const DETAIL: OrderDetail = {
  reference: 'K4M2QP', status: 'shipped', createdAt: '2026-08-12T12:00:00.000Z',
  items: [{ name: 'Oat Bar', quantity: 3, unitPrice: 4.5, lineTotal: 13.5 }],
  subtotal: 13.5, shippingAmount: 3.5, discountAmount: 0, totalAmount: 17, outstandingBalance: 0,
  payments: [], shipments: [],
};
const root = { props: { title: '', description: '', chrome: 'shell' } } as PuckDoc['root'];
const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const part = (type: string): ComponentData => c(type, partId('od', type));

describe('a stored order detail that still holds the removed link block', () => {
  const stored = (): PuckDoc => ({
    root,
    content: [c('OrderDetail', 'od', { content: [part('OrderHeading'), part('OrderItems'), c('OrderPageLink', 'link')] })],
  });

  it('reports the block as unknown and drops it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = validateDoc(stored(), 'account.order', 'storefront');
    warn.mockRestore();
    expect(result.issues.map((i) => i.rule)).toContain('drop:unknown-block');
    const detail = result.doc!.content[0]!;
    expect((detail.props.content as ComponentData[]).map((i) => i.type)).toEqual(['OrderHeading', 'OrderItems']);
  });

  it('renders the heading and the items and throws nothing', async () => {
    s.order = { data: DETAIL, isPending: false, isError: false, refetch: () => {} };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = validateDoc(stored(), 'account.order', 'storefront').doc!;
    warn.mockRestore();
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}><MantineProvider env="test"><MemoryRouter initialEntries={['/account/orders/K4M2QP']}><Routes>
        <Route path="/account/orders/:ref" element={<Suspense fallback={null}><RenderDoc doc={doc} docKey="account.order" layout="storefront" /></Suspense>} />
      </Routes></MemoryRouter></MantineProvider></QueryClientProvider>,
    );
    await waitFor(() => expect(container.querySelector(`.${orderClasses.overview}`)).not.toBeNull());
    expect(container.querySelector('h1')).toHaveTextContent('K4M2QP');
    expect(container.textContent).toContain('Oat Bar');
    expect(container.querySelector(`.${classes.cta}`)).toBeNull();
  });
});

describe('a page set that still carries an order-status page', () => {
  const staleDoc: PuckDoc = { root, content: [c('OrderStatus', 'os')] };
  const withStale = (): PageSet => ({
    schemaVersion: 1,
    shell: defaultDoc('shell', 'storefront')!,
    pages: { 'order-status': staleDoc } as unknown as PageSet['pages'],
  });
  const without = (): PageSet => ({ ...withStale(), pages: {} });

  it('resolves every remaining route exactly as a page set without it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const key of FIXED_ROUTE_KEYS) {
      expect(resolveDoc(withStale(), key, 'storefront')).toEqual(resolveDoc(without(), key, 'storefront'));
    }
    warn.mockRestore();
  });

  it('loads in the editor without an order-status doc and without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let docs: ReturnType<typeof docsFromPageSet> = {};
    expect(() => { docs = docsFromPageSet(withStale(), 'storefront'); }).not.toThrow();
    warn.mockRestore();
    expect(Object.keys(docs)).not.toContain('order-status');
    expect(() => toPageSet(docs, 'storefront')).not.toThrow();
    expect(Object.keys(toPageSet(docs, 'storefront').pages)).not.toContain('order-status');
  });
});
