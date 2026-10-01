import { isValidElement, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '@/builder/registry.ts';
import { renderBlock } from '@/builder/style/apply.tsx';
import { BOX } from '@/builder/style/model.ts';
import type { BlockRenderContext } from '@/builder/define.ts';

const SHELL_WRAP = ['Upsells', 'TopBar', 'NoticeBanners', 'CutoffBar', 'Footer'];
const FLOWS = ['ProductGrid', 'ProductList', 'ProductDetail', 'CartContents', 'CheckoutFlow',
  'LoginOptions', 'OrdersList', 'OrderDetail', 'Loyalty', 'Referrals', 'Profile', 'OrderStatus', 'PaymentSuccess',
  'PaymentCancel', 'OrderPlaced', 'VerifyForm', 'TrackingLookup', 'AccountNav'];
const ctx: BlockRenderContext = { editing: false, docKey: 'catalog', layout: 'storefront' };

/** The block's default props with every slot as a render function (renders call slots eagerly). */
function props(name: string, blockStyle?: Record<string, string>) {
  const def = BLOCKS[name]!;
  const p: Record<string, unknown> = { id: 'x', ...def.defaultProps };
  for (const s of def.slots) p[s] = () => null;
  return blockStyle ? { ...p, blockStyle } : p;
}

describe.each([...SHELL_WRAP, ...FLOWS])('%s · wrap target', (name) => {
  it('declares wrap', () => {
    expect(BLOCKS[name]!.style).toMatchObject({ target: 'wrap' });
  });
  it('unstyled: no wrapper', () => {
    const out = renderBlock(BLOCKS[name]!, props(name), ctx) as ReactElement;
    expect(isValidElement(out) && out.type === 'div' && (out.props as Record<string, unknown>)['data-sf-style']).toBeFalsy();
  });
  it('styled: one div with the marker around the unchanged render', () => {
    const out = renderBlock(BLOCKS[name]!, props(name, { bg: 'surface', padTop: 'md' }), ctx) as ReactElement<Record<string, unknown>>;
    expect(isValidElement(out) && out.type).toBe('div');
    expect(out.props).toMatchObject({ 'data-sf-style': name, 'data-sfs-bg': 'surface', 'data-sfs-pt': 'md' });
  });
});

describe('flows can never be hidden or given text controls (spec §2 #6, #8)', () => {
  it.each(FLOWS)('%s accepts exactly BOX', (name) => {
    const style = BLOCKS[name]!.style;
    expect(style && [...style.keys]).toEqual([...BOX]);
  });
  it.each(SHELL_WRAP)('%s accepts BOX and hide', (name) => {
    const style = BLOCKS[name]!.style;
    expect(style && [...style.keys]).toEqual([...BOX, 'hide']);
  });
  it('a hide on a flow never reaches the DOM', () => {
    const out = renderBlock(BLOCKS.CheckoutFlow!, props('CheckoutFlow', { hide: 'mobile' }), ctx) as ReactElement<Record<string, unknown>>;
    expect(isValidElement(out) && out.type === 'div').toBe(false);
  });
});

describe('WholesaleTable · wrap with geometry-safe keys only (sticky full-bleed WholesaleBar)', () => {
  it('drops the keys that would offset or clip the band', () => {
    const style = BLOCKS.WholesaleTable!.style;
    expect(style).toMatchObject({ target: 'wrap' });
    expect(style && [...style.keys]).toEqual(['bg', 'padTop', 'marginTop', 'marginBottom', 'shadow']);
  });
  it('styled: one wrapper; unstyled: none', () => {
    const def = BLOCKS.WholesaleTable!;
    expect(renderBlock(def, props('WholesaleTable'), ctx)).not.toMatchObject({ type: 'div' });
    const out = renderBlock(def, props('WholesaleTable', { bg: 'surface', padX: 'md' }), ctx) as ReactElement<Record<string, unknown>>;
    expect(out.props).toMatchObject({ 'data-sf-style': 'WholesaleTable', 'data-sfs-bg': 'surface' });
    expect(out.props).not.toHaveProperty('data-sfs-px');
  });
});

describe('ContactStrip · pass onto the sticky strip (no wrapper)', () => {
  it('declares pass with BOX and hide', () => {
    const style = BLOCKS.ContactStrip!.style;
    expect(style).toMatchObject({ target: 'pass' });
    expect(style && [...style.keys]).toEqual([...BOX, 'hide']);
  });
  it('the marker lands on the stripBar element itself', () => {
    const out = renderBlock(BLOCKS.ContactStrip!, props('ContactStrip', { bg: 'surface' }), ctx) as ReactElement<Record<string, unknown>>;
    expect(out.type).not.toBe('div');
    expect(out.props).toMatchObject({ styleAttrs: { 'data-sf-style': 'ContactStrip', 'data-sfs-bg': 'surface' } });
  });
});
