import { isValidElement, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '@/builder/registry.ts';
import { renderBlock } from '@/builder/style/apply.tsx';
import { BOX } from '@/builder/style/model.ts';
import type { BlockRenderContext } from '@/builder/define.ts';

const SHELL_WRAP = ['Upsells', 'TopBar', 'NoticeBanners', 'CutoffBar', 'ContactStrip', 'Footer'];
const FLOWS = ['ProductGrid', 'ProductList', 'WholesaleTable', 'ProductDetail', 'CartContents', 'CartSummary', 'CheckoutFlow',
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
