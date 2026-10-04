import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Suspense, type ReactNode } from 'react';
import type { OrderDetail, OrderSummary } from '@/types/orders.ts';
import type { Profile } from '@/types/profile.ts';

// The data entry points the goldens mock stay the only way these containers read data.
const s = vi.hoisted(() => ({
  profile: undefined as unknown, orders: undefined as unknown, order: undefined as unknown,
}));
vi.mock('@/features/account/queries.ts', async (orig) => ({
  ...(await orig<typeof import('@/features/account/queries.ts')>()),
  useProfile: () => s.profile, useOrders: () => s.orders, useOrder: () => s.order,
}));

import { defaultDoc } from '@/builder/defaults/index.ts';
import { BLOCKS } from '@/builder/registry.ts';
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    telegramWebApp: { mode: 'off' }, features: { layout: 'storefront', ordering: true, accounts: true },
  }),
}));

import { RenderDoc } from '@/builder/render.tsx';
import { validateDoc } from '@/builder/guard.ts';
import { checkRules } from '@/builder/rules.ts';
import { upgradeDoc, upgradeItems } from '@/builder/upgrade.ts';
import { partId, type ContainerSpec } from '@/builder/parts.ts';
import { BuilderModeProvider, type BuilderMode } from '@/builder/mode.ts';
import { AccountFamily } from '@/builder/family-account.ts';
import { OrdersFamily, type OrdersPreview } from '@/builder/family-orders.ts';
import { OrderFamily } from '@/builder/family-order.ts';
import type { ComponentData, DocKey, LayoutKind, PuckDoc } from '@/builder/types.ts';
import { STAGE4_PARTS } from './helpers/stage4-parts.ts';
import classes from '@/features/account/Account.module.css';

afterEach(cleanup);

const noop = () => {};
const ROWS: OrderSummary[] = [
  { reference: 'K4M2QP', status: 'pending', createdAt: '2026-08-12T12:00:00.000Z', totalAmount: 42.5, outstandingBalance: 12.5 },
  { reference: 'J7N1XD', status: 'confirmed', createdAt: '2026-08-13T12:00:00.000Z', totalAmount: 18, outstandingBalance: 0 },
];
const ordersQ = (rows: OrderSummary[], more = false, fetchNextPage: () => void = noop) => ({
  data: { pages: [{ data: rows, meta: { totalItems: rows.length, page: 1, hasNextPage: more } }] },
  isPending: false, isError: false, hasNextPage: more, isFetchingNextPage: false, fetchNextPage, refetch: noop,
});
const DETAIL: OrderDetail = {
  reference: 'K4M2QP', status: 'shipped', createdAt: '2026-08-12T12:00:00.000Z',
  items: [{ name: 'Oat Bar', quantity: 3, unitPrice: 4.5, lineTotal: 13.5 }],
  subtotal: 13.5, shippingAmount: 3.5, discountAmount: 0, totalAmount: 17, outstandingBalance: 5,
  payments: [{ method: 'bank_transfer', amount: 12, status: 'completed', createdAt: '2026-08-12T12:30:00.000Z' }],
  shipments: [{ status: 'shipped', carrier: 'Royal Mail', trackingNumber: 'RM1', trackingUrl: null, trackingStatusDescription: null, shippedAt: null, deliveredAt: null }],
  publicUrl: 'https://shop.example/o/K4M2QP/abc',
};
const PROFILE = { nickname: 'Ada', memberSince: '2026-03-04T12:00:00.000Z', totalOrders: 4 } as Profile;
const pending = { data: undefined, isPending: true, isError: false, refetch: noop };

beforeEach(() => { s.profile = pending; s.orders = pending; s.order = pending; });

const NEW_PARTS = Object.keys(STAGE4_PARTS).filter((n) => /^(Account(Greeting|Tabs)|Orders?[A-Z])/.test(n));
const FAMILY_OF: Record<string, string> = { AccountGreeting: 'account', AccountTabs: 'account' };
const familyOf = (n: string) => FAMILY_OF[n] ?? (n.startsWith('Orders') ? 'orders' : 'order');
const SPECS: Record<string, ContainerSpec> = {
  AccountNav: BLOCKS.AccountNav!.container!, OrdersList: BLOCKS.OrdersList!.container!, OrderDetail: BLOCKS.OrderDetail!.container!,
};
const DOC_OF: Record<string, DocKey> = { OrdersList: 'account.orders', OrderDetail: 'account.order' };
const LAYOUTS: LayoutKind[] = ['storefront', 'menu', 'webapp'];

const root = { props: { title: '', description: '', chrome: 'shell' } } as PuckDoc['root'];
const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const doc = (content: ComponentData[]): PuckDoc => ({ root, content });
const types = (items: unknown) => (items as ComponentData[]).map((i) => i.type);
const rulesOf = (d: PuckDoc, key: DocKey = 'account.orders') => checkRules(d, key, 'storefront').map((i) => i.rule);
const p = (container: string, type: string, extra: Record<string, unknown> = {}): ComponentData => c(type, partId(container, type), extra);

function shell(ui: ReactNode, path: string, route: string, mode?: Partial<BuilderMode>) {
  const inner = mode ? <BuilderModeProvider value={{ editing: false, previewAs: null, ...mode }}>{ui}</BuilderModeProvider> : ui;
  return render(
    <QueryClientProvider client={new QueryClient()}><MantineProvider env="test"><MemoryRouter initialEntries={[path]}><Routes>
      <Route path={route} element={<Suspense fallback={null}>{inner}</Suspense>} />
    </Routes></MemoryRouter></MantineProvider></QueryClientProvider>,
  );
}
const renderOrders = (d: PuckDoc, mode?: Partial<BuilderMode>) => shell(<RenderDoc doc={d} docKey="account.orders" layout="storefront" />, '/account/orders', '/account/*', mode);
const renderOrder = (d: PuckDoc) => shell(<RenderDoc doc={d} docKey="account.order" layout="storefront" />, '/account/orders/K4M2QP', '/account/orders/:ref');
const settled = (d: PuckDoc, key: DocKey) => { const r = validateDoc(d, key, 'storefront'); return r.doc!; };

describe('contract', () => {
  it('covers every part of the three containers', () => {
    expect(NEW_PARTS.sort()).toEqual(['AccountGreeting', 'AccountTabs', 'OrderBackLink', 'OrderBalance', 'OrderHeading', 'OrderItems', 'OrderPageLink',
      'OrderPayments', 'OrderParcels', 'OrdersEmpty', 'OrdersHeading', 'OrdersMore', 'OrdersRows'].sort());
  });
  it.each(NEW_PARTS)('%s: family and style match the stage 4 table', (name) => {
    const def = BLOCKS[name]!;
    expect(def.part).toEqual({ family: familyOf(name) });
    expect(def.style).toEqual(expect.objectContaining({ target: STAGE4_PARTS[name]!.style.target }));
    expect([...(def.style ? def.style.keys : [])].sort()).toEqual([...STAGE4_PARTS[name]!.style.keys].sort());
    expect(def.slots).toEqual([]);
  });
  it('no required part carries hide', () => {
    for (const spec of Object.values(SPECS)) for (const r of spec.required) expect(BLOCKS[r]!.style && BLOCKS[r]!.style.keys).not.toContain('hide');
  });
  it.each(NEW_PARTS)('%s renders nothing outside its container', (name) => {
    const { container } = render(<>{BLOCKS[name]!.render({ id: 'x', puck: {} } as never)}</>);
    expect(container.innerHTML).toBe('');
  });
  it('the containers declare their slots, nests and required parts', () => {
    expect(BLOCKS.AccountNav!.slots).toEqual(['head', 'body']);
    expect(BLOCKS.OrdersList!.slots).toEqual(['content']);
    expect(BLOCKS.OrderDetail!.slots).toEqual(['content']);
    expect(SPECS.AccountNav!.required).toEqual(['AccountGreeting', 'AccountTabs']);
    expect(SPECS.AccountNav!.nests).toEqual(['OrdersList', 'OrderDetail', 'Loyalty', 'Referrals', 'Profile']);
    expect(SPECS.OrdersList!.required).toEqual(['OrdersRows', 'OrdersEmpty']);
    expect(SPECS.OrderDetail!.required).toEqual(['OrderHeading', 'OrderItems']);
  });
  it('default ids are at most 64 characters and unique; the defaults omit AccountNav.body', () => {
    for (const [name, spec] of Object.entries(SPECS)) {
      const slots = spec.defaultSlots({}, { layout: 'storefront', id: `${'x'.repeat(60)}` });
      const ids = Object.values(slots).flat().map((i) => String(i.props.id));
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id.length).toBeLessThanOrEqual(64);
      if (name === 'AccountNav') expect(Object.keys(slots)).toEqual(['head']);
    }
  });
  it.each(['account.orders', 'account.order'] as const)('the %s default document passes its rules in every layout', (key) => {
    for (const layout of LAYOUTS) {
      const d = upgradeDoc(defaultDoc(key, layout)!, key, layout);
      expect(checkRules(d, key, layout)).toEqual([]);
    }
  });
});

describe('rules', () => {
  const nav = (head: ComponentData[], body: ComponentData[] = []) => c('AccountNav', 'nav', { head, body });
  const fullHead = () => [p('nav', 'AccountGreeting'), p('nav', 'AccountTabs')];
  it.each(['AccountGreeting', 'AccountTabs'])('AccountNav: removing %s raises part-required, duplicating it too', (name) => {
    const head = fullHead();
    expect(rulesOf(doc([nav(head.filter((i) => i.type !== name))]))).toContain(`part-required:AccountNav.${name}`);
    expect(rulesOf(doc([nav([...head, { ...p('nav', name), props: { id: 'dup' } }])]))).toContain(`part-required:AccountNav.${name}`);
    expect(rulesOf(doc([nav(head)]))).not.toContain(`part-required:AccountNav.${name}`);
  });
  it.each([['OrdersList', ['OrdersRows', 'OrdersEmpty'], ['OrdersHeading', 'OrdersMore']], ['OrderDetail', ['OrderHeading', 'OrderItems'], ['OrderBackLink', 'OrderBalance', 'OrderPayments', 'OrderParcels', 'OrderPageLink']]] as const)(
    '%s: required and unique parts', (container, required, optional) => {
      const full = (): ComponentData[] => SPECS[container]!.defaultSlots({}, { layout: 'storefront', id: 'k' }).content!;
      const key = DOC_OF[container]!;
      const wrap = (content: ComponentData[]) => doc([c(container, 'k', { content })]);
      for (const r of required) {
        expect(rulesOf(wrap(full().filter((i) => i.type !== r)), key)).toContain(`part-required:${container}.${r}`);
        expect(rulesOf(wrap([...full(), c(r, 'dup')]), key)).toContain(`part-required:${container}.${r}`);
      }
      for (const o of optional) {
        expect(rulesOf(wrap([...full(), c(o, 'dup')]), key)).toContain(`part-unique:${container}.${o}`);
        expect(rulesOf(wrap(full().filter((i) => i.type !== o)), key).filter((r) => r.startsWith('part-'))).toEqual([]);
      }
    });
  it('a part inside another family container raises part-placement', () => {
    const d = doc([nav(fullHead(), [c('OrdersList', 'ol', { content: [p('ol', 'OrdersRows'), p('ol', 'OrdersEmpty'), c('AccountTabs', 'tabs2')] })])]);
    expect(rulesOf(d)).toContain('part-placement:AccountTabs');
    const d2 = doc([c('OrderDetail', 'od', { content: [p('od', 'OrderHeading'), p('od', 'OrderItems'), c('OrdersRows', 'r')] })]);
    expect(rulesOf(d2, 'account.order')).toContain('part-placement:OrdersRows');
  });
  it('the five sections nest in AccountNav.body without slot-accepts; a foreign route block does not', () => {
    const ol = c('OrdersList', 'ol', { content: [p('ol', 'OrdersRows'), p('ol', 'OrdersEmpty')] });
    expect(rulesOf(doc([nav(fullHead(), [ol])]))).not.toContain('slot-accepts:AccountNav.body');
    expect(rulesOf(doc([nav(fullHead(), [c('Section', 's', { content: [ol] })])]))).not.toContain('slot-accepts:AccountNav.body');
    expect(rulesOf(doc([nav(fullHead(), [c('ProductGrid', 'pg')])]))).toContain('slot-accepts:AccountNav.body');
  });
  it('counting stops at the nested section', () => {
    const ol = c('OrdersList', 'ol', { content: [p('ol', 'OrdersRows'), p('ol', 'OrdersEmpty'), c('OrdersRows', 'dup-rows')] });
    const rules = rulesOf(doc([nav(fullHead(), [ol])]));
    expect(rules).toContain('part-required:OrdersList.OrdersRows');
    expect(rules.filter((r) => r.includes('AccountNav'))).toEqual([]);
  });
});

describe('upgrade (spec section 8)', () => {
  const stored = (type: string, props: Record<string, unknown>) => [c(type, `${type}-default`, props)];
  it('AccountNav: absent head is filled, body is untouched', () => {
    const body = [c('OrdersList', 'ol')];
    const out = upgradeItems(stored('AccountNav', { body }), 'storefront')[0]!;
    expect(types(out.props.head)).toEqual(['AccountGreeting', 'AccountTabs']);
    expect(types(out.props.body)).toEqual(['OrdersList']);
    // the nested section is upgraded too
    expect(types((out.props.body as ComponentData[])[0]!.props.content)).toEqual(['OrdersHeading', 'OrdersRows', 'OrdersMore', 'OrdersEmpty']);
  });
  it.each([['OrdersList', ['OrdersHeading', 'OrdersRows', 'OrdersMore', 'OrdersEmpty']],
    ['OrderDetail', ['OrderBackLink', 'OrderHeading', 'OrderBalance', 'OrderItems', 'OrderPayments', 'OrderParcels', 'OrderPageLink']]] as const)(
    '%s: absent content equals the defaults, [] is untouched, a second pass is idempotent', (type, expected) => {
      const once = upgradeItems(stored(type, {}), 'storefront');
      expect(types(once[0]!.props.content)).toEqual(expected);
      expect(once[0]!.props.content).toEqual(SPECS[type]!.defaultSlots({}, { layout: 'storefront', id: `${type}-default` }).content);
      expect(upgradeItems(once, 'storefront')).toBe(once);
      const present = stored(type, { content: [] });
      expect(upgradeItems(present, 'storefront')).toBe(present);
    });
  it('AccountNav head [] is never refilled', () => {
    const present = stored('AccountNav', { head: [], body: [] });
    expect(upgradeItems(present, 'storefront')).toBe(present);
  });
});

describe('arrangement and state ownership', () => {
  const ready = async <T extends { container: HTMLElement }>(r: T): Promise<T> => {
    await waitFor(() => expect(r.container.querySelector(`.${classes.account}`)).not.toBeNull());
    return r;
  };
  const accountDoc = (head: ComponentData[] | undefined, body: ComponentData[]): PuckDoc =>
    doc([c('AccountNav', 'nav', { ...(head ? { head } : {}), body })]);
  const sectionDoc = (content: ComponentData[] | undefined) => accountDoc(undefined, [c('OrdersList', 'ol', content ? { content } : {})]);
  const asOrders = (d: PuckDoc) => settled(d, 'account.orders');
  const defaultOrders = () => asOrders(defaultDoc('account.orders', 'storefront')!);
  const defaultOrder = () => settled(defaultDoc('account.order', 'storefront')!, 'account.order');

  it('AccountNav default: the tabs sit below the greeting', async () => {
    s.profile = { data: PROFILE, isPending: false, isError: false };
    await ready(renderOrders(defaultOrders()));
    const h1 = screen.getByRole('heading', { level: 1 });
    const nav = screen.getByRole('navigation', { name: 'Account sections' });
    expect(h1).toHaveTextContent('Ada');
    expect(h1.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('AccountNav: tabs above the greeting with rich text between them', async () => {
    s.profile = { data: PROFILE, isPending: false, isError: false };
    const head = [p('nav', 'AccountTabs'), c('RichText', 'rt', { bodyHtml: '<p>between</p>', width: 'narrow' }), p('nav', 'AccountGreeting')];
    const { container } = await ready(renderOrders(asOrders(accountDoc(head, [c('OrdersList', 'ol')]))));
    expect([...container.querySelectorAll('nav, h1')].map((e) => e.tagName)).toEqual(['NAV', 'H1']);
    const html = container.innerHTML;
    expect(html.indexOf('<nav')).toBeLessThan(html.indexOf('between'));
    expect(html.indexOf('between')).toBeLessThan(html.indexOf('<h1'));
  });
  it('AccountNav: the keyed body wrapper stays container markup and follows the head', async () => {
    const { container } = await ready(renderOrders(asOrders(accountDoc([p('nav', 'AccountGreeting'), p('nav', 'AccountTabs')], [c('OrdersList', 'ol')]))));
    const account = container.querySelector(`.${classes.account}`)!;
    expect(account.children).toHaveLength(3);
    expect(account.lastElementChild!.tagName).toBe('DIV');
  });

  it('empty orders: only the empty state draws and there is no div.body', async () => {
    s.orders = ordersQ([]);
    const { container } = await ready(renderOrders(defaultOrders()));
    expect(await screen.findByText('Browse the catalogue')).toBeInTheDocument();
    expect(container.querySelector(`.${classes.body}`)).toBeNull();
    expect(container.querySelector(`.${classes.orders}`)).toBeNull();
    expect(container.querySelector(`.${classes.sectionHead}`)).toBeNull();
  });
  it('rows reordered and interleaved with rich text; a removed optional part is absent', async () => {
    s.orders = ordersQ(ROWS, true);
    const d = asOrders(sectionDoc([p('ol', 'OrdersRows'), c('RichText', 'rt', { bodyHtml: '<p>between</p>', width: 'narrow' }), p('ol', 'OrdersHeading'), p('ol', 'OrdersEmpty')]));
    const { container } = await ready(renderOrders(d));
    const body = await waitFor(() => { const b = container.querySelector(`.${classes.body}`); expect(b).not.toBeNull(); return b!; });
    const kids = [...body.children].map((e) => e.className);
    expect(kids[0]).toContain(classes.orders);
    expect(body.textContent).toContain('between');
    expect(kids[2]).toContain(classes.sectionHead);
    // OrdersMore was removed from the arrangement: no load-more button although a next page exists
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });
  it('the load-more button calls fetchNextPage', async () => {
    const fetchNextPage = vi.fn();
    s.orders = ordersQ(ROWS, true, fetchNextPage);
    await ready(renderOrders(defaultOrders()));
    fireEvent.click(await screen.findByRole('button', { name: /load more/i }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
  it('the container keeps its pending skeleton and error screen before any slot', async () => {
    const d = defaultOrders();
    const { container } = await ready(renderOrders(d));
    expect(container.querySelector(`.${classes.orders}`)).toBeNull();
    cleanup();
    const refetch = vi.fn();
    s.orders = { data: undefined, isPending: false, isError: true, refetch };
    await ready(renderOrders(d));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('order detail: parcels before items, and a removed part is absent', async () => {
    s.order = { data: DETAIL, isPending: false, isError: false, refetch: noop };
    const d = settled(accountDoc(undefined, [c('OrderDetail', 'od', { content: [p('od', 'OrderHeading'), p('od', 'OrderParcels'), p('od', 'OrderItems')] })]), 'account.order');
    const { container } = await ready(renderOrder(d));
    await waitFor(() => expect(container.querySelectorAll('section').length).toBe(2));
    expect([...container.querySelectorAll('section')].map((e) => e.getAttribute('aria-label'))).toEqual(['Parcels', 'Items']);
    expect(container.querySelector(`.${classes.back}`)).toBeNull();
    expect(container.querySelector(`.${classes.cta}`)).toBeNull();
    expect(container.querySelector(`.${classes.body}`)).not.toBeNull();
  });
  it('order detail default: balance and page link draw', async () => {
    s.order = { data: DETAIL, isPending: false, isError: false, refetch: noop };
    const { container } = await ready(renderOrder(defaultOrder()));
    await waitFor(() => expect(container.querySelector(`.${classes.band}`)).not.toBeNull());
    expect(container.querySelector(`.${classes.cta}`)).toHaveAttribute('href', DETAIL.publicUrl);
    expect(container.querySelector('h2')).toHaveTextContent('K4M2QP');
  });
  it('names a payment by the shop’s name for the method, falling back to the id as words on an older backend', async () => {
    const payments = [
      { method: 'stripe', methodLabel: 'Pay by card', amount: 5, status: 'completed', createdAt: '2026-08-12T12:30:00.000Z' },
      { method: 'bank_transfer', amount: 12, status: 'completed', createdAt: '2026-08-12T12:31:00.000Z' },
    ];
    s.order = { data: { ...DETAIL, payments }, isPending: false, isError: false, refetch: noop };
    await ready(renderOrder(defaultOrder()));
    expect(await screen.findByText('Pay by card')).toBeInTheDocument();
    expect(screen.getByText(/bank transfer/i)).toBeInTheDocument();
  });
  it('a settled order draws no balance band and no link without a public url', async () => {
    s.order = { data: { ...DETAIL, outstandingBalance: 0, publicUrl: null, payments: [], shipments: [] }, isPending: false, isError: false, refetch: noop };
    const { container } = await ready(renderOrder(defaultOrder()));
    await waitFor(() => expect(container.querySelector('h2')).not.toBeNull());
    expect(container.querySelector(`.${classes.band}`)).toBeNull();
    expect(container.querySelector(`.${classes.cta}`)).toBeNull();
    expect(container.querySelectorAll('section')).toHaveLength(1);
  });

  describe('preview states', () => {
    const fixture: OrdersPreview = { rows: ROWS, hasNextPage: false };
    const mode = (state: string): Partial<BuilderMode> => ({ previewStates: { OrdersList: state }, previewFixtures: { OrdersList: fixture } });
    it('none renders the empty state while the query is still pending', async () => {
      await ready(renderOrders(defaultOrders(), mode('none')));
      expect(await screen.findByText('Browse the catalogue')).toBeInTheDocument();
    });
    it('orders and more draw the fixture rows without the query', async () => {
      await ready(renderOrders(defaultOrders(), mode('orders')));
      expect(await screen.findByText('K4M2QP')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
      cleanup();
      await ready(renderOrders(defaultOrders(), mode('more')));
      expect(await screen.findByRole('button', { name: /load more/i })).toBeInTheDocument();
    });
    it('shoppers (no preview state) take the query path', async () => {
      s.orders = ordersQ(ROWS);
      await ready(renderOrders(defaultOrders(), { previewStates: null, previewFixtures: null }));
      expect(await screen.findByText('J7N1XD')).toBeInTheDocument();
    });
  });
});

describe('family views', () => {
  it('a view reads its data from the container', () => {
    const Probe = () => <b>{AccountFamily.useData().name}</b>;
    expect(() => render(<Probe />)).toThrow(/outside its container/);
    expect(typeof OrdersFamily.useData).toBe('function');
    expect(typeof OrderFamily.useData).toBe('function');
  });
});

describe('css (spec section 9)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/features/account/Account.module.css'), 'utf8').replaceAll(String.fromCharCode(13), '');
  it.each(['.eyebrow', '.name', '.tab', '.sectionTitle', '.ref', '.total', '.date', '.due', '.ghost', '.back', '.detailRef', '.band',
    '.itemName', '.rowLabel', '.eventName', '.tracking', '.cta', '.note'])('%s takes the fg and text-size variables', (sel) => {
    const m = new RegExp(`\\n\\${sel} \\{\\n([\\s\\S]*?)\\n\\}`).exec(css)!;
    expect(m[1]).toContain('var(--sf-block-fg,');
    expect(m[1]).toMatch(/--sf-text-scale/);
  });
});
