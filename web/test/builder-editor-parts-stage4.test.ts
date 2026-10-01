import { describe, expect, it } from 'vitest';
import type { Config } from '@puckeditor/core';
import { blockMenu, buildEditorConfig, lockedPresent } from '@/builder/editor/config.ts';
import { insertTarget, type InsertApi } from '@/builder/editor/insert-target.ts';
import { familiesOfDoc, familyOfDoc, requiredPartsOn } from '@/builder/editor/route-bound.ts';
import {
  headerNotices, partsHeading, partStates, paymentRequiredNote, requiredByParent, withDefaultArrangement,
  HEADER_FILTER_NOTICE, HEADER_TALL_NOTICE, HEADER_TOP_BAR_NOTICE,
} from '@/builder/editor/container-parts.ts';
import { fields as headerFields } from '@/builder/editor/fields/Header.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { findComponent } from '@/builder/parts.ts';
import type { ComponentData, DocKey, LayoutKind } from '@/builder/types.ts';

const cfg = (docKey: DocKey, layout: LayoutKind = 'storefront') => buildEditorConfig(docKey, layout, lockedPresent(defaultDoc(docKey, layout)!, docKey));
const allow = (c: Config, type: string, slot: string) => (c.components[type]!.fields as Record<string, { allow?: string[] }>)[slot]!.allow!;
const menu = (docKey: DocKey, layout: LayoutKind = 'storefront') => blockMenu(docKey, layout, new Set());
const names = (docKey: DocKey, title: string) => menu(docKey).find((g) => g.title === title)?.blocks.map((b) => b.name);
const header = (props: Record<string, unknown> = {}, slots: Record<string, ComponentData[]> = {}): ComponentData =>
  ({ type: 'Header', props: { id: 'h', variant: 'auto', topBar: true, sticky: true, start: [], nav: [], middle: [], end: [], ...slots, ...props } });

describe('palettes per doc', () => {
  it('familiesOfDoc lists every family in FAMILY_DOCS order; familyOfDoc the first', () => {
    expect(familiesOfDoc('cart')).toEqual(['cart', 'cart-summary']);
    expect(familiesOfDoc('account.orders')).toEqual(['account', 'orders']);
    expect(familiesOfDoc('page:about')).toEqual([]);
    expect(familyOfDoc('account.orders')).toBe('account');
  });
  it('shell shows only Header parts; cart two groups; account.orders two groups', () => {
    expect(menu('shell').filter((g) => g.category === 'part').map((g) => g.title)).toEqual(['Header parts']);
    expect(menu('cart').filter((g) => g.category === 'part').map((g) => g.title)).toEqual(['Cart parts', 'Cart summary parts']);
    expect(menu('account.orders').filter((g) => g.category === 'part').map((g) => g.title)).toEqual(['Account header parts', 'Order history parts']);
    expect(Object.keys(cfg('cart').categories ?? {})).toEqual(expect.arrayContaining(['part:cart', 'part:cart-summary']));
  });
  it('payment-success omits PaymentActions; cancel offers it', () => {
    expect(names('payment-success', 'Payment page parts')).not.toContain('PaymentActions');
    expect(names('payment-success', 'Payment page parts')).toContain('PaymentReference');
    expect(names('payment-cancel', 'Payment page parts')).toContain('PaymentActions');
  });
});

describe('locks', () => {
  it('required parts cannot be deleted or duplicated, per container', () => {
    const lock = { delete: false, duplicate: false };
    expect(cfg('shell').components.HeaderBrand!.permissions).toEqual(lock);
    expect(cfg('payment-cancel').components.PaymentActions!.permissions).toEqual(lock);
    expect(cfg('order-placed').components.PaymentActions!.permissions).toEqual(lock);
    expect(cfg('payment-success').components.PaymentActions!.permissions).toEqual({ duplicate: false });
    expect(cfg('cart').components.CartSummaryCheckout!.permissions).toEqual(lock);
    expect([...requiredPartsOn('shell', 'storefront')]).toEqual(['HeaderBrand']);
  });
});

describe('allow lists', () => {
  it('CartContents: head excludes CartLines, summary takes CartSummary', () => {
    const c = cfg('cart');
    expect(allow(c, 'CartContents', 'head')).not.toContain('CartLines');
    expect(allow(c, 'CartContents', 'summary')).toContain('CartSummary');
    expect(allow(c, 'CartContents', 'summary')).not.toContain('CartLines');
    expect(allow(c, 'CartContents', 'main')).not.toContain('CartSummary');
  });
  it('AccountNav.body takes its own page block only', () => {
    expect(allow(cfg('account.orders'), 'AccountNav', 'body')).toContain('OrdersList');
    expect(allow(cfg('account.orders'), 'AccountNav', 'body')).not.toContain('Loyalty');
  });
  it('a container slot never takes a part another container offers', () => {
    expect(allow(cfg('payment-success'), 'PaymentSuccess', 'content')).not.toContain('PaymentActions');
    expect(allow(cfg('cart'), 'CartContents', 'main')).not.toContain('CartSummarySubtotal');
  });
});

describe('partStates and Reset', () => {
  it('PaymentSuccess omits PaymentActions', () => {
    const item = defaultDoc('payment-success', 'storefront')!.content[0]!;
    expect(partStates(item, 'storefront').map((p) => p.type)).not.toContain('PaymentActions');
  });
  it('Reset on a menu Header yields HeaderFilter; a changed variant uses the new one', () => {
    const text = (h: ComponentData) => JSON.stringify(h.props);
    expect(text(withDefaultArrangement(header({ variant: 'menu' }), 'storefront'))).toContain('HeaderFilter');
    expect(text(withDefaultArrangement(header({ variant: 'storefront' }), 'menu'))).not.toContain('HeaderFilter');
    expect(text(withDefaultArrangement(header({}), 'storefront'))).not.toContain('HeaderFilter');
  });
  it('Reset keeps slots absent from defaultSlots (Header.nav, AccountNav.body)', () => {
    const nav = [{ type: 'NavLinks', props: { id: 'n' } }] as ComponentData[];
    expect(withDefaultArrangement(header({}, { nav }), 'storefront').props.nav).toEqual(nav);
    const account = defaultDoc('account.orders', 'storefront')!.content.find((c) => c.type === 'AccountNav')!;
    expect(withDefaultArrangement(account, 'storefront').props.body).toEqual(account.props.body);
  });
  it('Reset on CartContents regenerates the nested summary', () => {
    const cart = defaultDoc('cart', 'storefront')!.content.find((c) => c.type === 'CartContents')!;
    const reset = withDefaultArrangement({ ...cart, props: { ...cart.props, summary: [] } }, 'storefront');
    expect(findComponent(reset.props.summary as ComponentData[], 'CartSummary')).toBeDefined();
  });
});

describe('notices and headings', () => {
  it('HeaderFilter in a storefront header', () => {
    const filter = { type: 'HeaderFilter', props: { id: 'f' } };
    expect(headerNotices(header({ variant: 'storefront' }, { end: [filter] }), 'menu')).toContain(HEADER_FILTER_NOTICE);
    expect(headerNotices(header({ variant: 'auto' }, { end: [filter] }), 'storefront')).toContain(HEADER_FILTER_NOTICE);
    expect(headerNotices(header({ variant: 'menu' }, { end: [filter] }), 'storefront')).not.toContain(HEADER_FILTER_NOTICE);
  });
  it('tall blocks, except NavLinks and Button', () => {
    expect(headerNotices(header({}, { nav: [{ type: 'Heading', props: { id: 'x' } }] }), 'storefront')).toContain(HEADER_TALL_NOTICE);
    expect(headerNotices(header({}, { nav: [{ type: 'NavLinks', props: { id: 'x' } }, { type: 'Button', props: { id: 'y' } }] }), 'storefront')).not.toContain(HEADER_TALL_NOTICE);
  });
  it('top bar hint while the top bar is on; the field carries it as a description', () => {
    expect(headerNotices(header(), 'storefront')).toContain(HEADER_TOP_BAR_NOTICE);
    expect(headerNotices(header({ topBar: false }), 'storefront')).not.toContain(HEADER_TOP_BAR_NOTICE);
    expect((headerFields.topBar as unknown as { description: string }).description).toBe(HEADER_TOP_BAR_NOTICE);
  });
  it('account headings name the page', () => {
    expect(partsHeading('AccountNav', 'account.orders')).toBe('Account header — Order history page');
    expect(partsHeading('AccountNav', 'account.loyalty')).not.toBe(partsHeading('AccountNav', 'account.orders'));
    expect(partsHeading('Header', 'shell')).toBe('Parts');
  });
});

describe('style hide for required placements', () => {
  it('requiredByParent follows the container the part sits in', () => {
    expect(requiredByParent('HeaderBrand', header(), 'storefront')).toBe(true);
    expect(requiredByParent('HeaderSearch', header(), 'storefront')).toBe(false);
    expect(requiredByParent('HeaderBrand', undefined, 'storefront')).toBe(false);
  });
  it('payment parts say where they are required', () => {
    expect(paymentRequiredNote('PaymentActions', 'storefront')).toBe('Required on the cancel and order-placed pages.');
    expect(paymentRequiredNote('PaymentReference', 'storefront')).toBe('Required on the success and order-placed pages.');
    expect(paymentRequiredNote('PaymentMark', 'storefront')).toBeNull();
  });
});

describe('insertTarget for header and nested parts', () => {
  const shell = defaultDoc('shell', 'storefront')!;
  const hdr = shell.content.find((c) => c.type === 'Header')!;
  const apiFor = (
    content: ComponentData[], sel: InsertApi['appState']['ui']['itemSelector'],
    items: Record<string, ComponentData>, parents: Record<string, ComponentData>, docKey: DocKey,
  ): InsertApi => ({
    config: cfg(docKey),
    appState: { ui: { itemSelector: sel }, data: { content } },
    getItemById: (id: string) => items[id],
    getParentById: (id: string) => parents[id],
    getSelectorForId: () => undefined,
  } as unknown as InsertApi);
  it('nothing selected: a header part goes to the end of Header.end', () => {
    const end = (hdr.props.end as unknown[]).length;
    expect(insertTarget(apiFor(shell.content, null, {}, {}, 'shell'), 'HeaderSearch')).toEqual({ zone: `${hdr.props.id}:end`, index: end, nested: true });
  });
  it('a part selected in Header.middle that accepts it: right after', () => {
    const api = apiFor(shell.content, { index: 0, zone: `${hdr.props.id}:middle` }, { [String(hdr.props.id)]: hdr }, {}, 'shell');
    expect(insertTarget(api, 'HeaderSearch')).toEqual({ zone: `${hdr.props.id}:middle`, index: 1, nested: true });
  });
  it('cart-summary parts selected inside the nested summary stay in it', () => {
    const cart = defaultDoc('cart', 'storefront')!;
    const contents = cart.content.find((c) => c.type === 'CartContents')!;
    const summary = findComponent(contents.props.summary as ComponentData[], 'CartSummary')!;
    const sid = String(summary.props.id);
    const slot = Object.keys(summary.props).find((s) => Array.isArray(summary.props[s]) && (summary.props[s] as unknown[]).length > 0)!;
    const api = apiFor(cart.content, { index: 0, zone: `${sid}:${slot}` }, { [sid]: summary }, { [sid]: contents }, 'cart');
    expect(insertTarget(api, 'CartSummarySubtotal').zone.startsWith(`${sid}:`)).toBe(true);
  });
  it('account parts go inside the AccountNav', () => {
    const doc = defaultDoc('account.orders', 'storefront')!;
    const nav = doc.content.find((c) => c.type === 'AccountNav')!;
    const nid = String(nav.props.id);
    const api = apiFor(doc.content, null, { [nid]: nav }, {}, 'account.orders');
    expect(insertTarget(api, 'AccountTabs').zone.startsWith(`${nid}:`)).toBe(true);
  });
});
