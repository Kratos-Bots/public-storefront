import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as define from '@/builder/define.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { checkRules } from '@/builder/rules.ts';
import { validateDoc } from '@/builder/guard.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { RenderDoc } from '@/builder/render.tsx';
import * as runtime from '@/builder/runtime.tsx';
import * as mode from '@/builder/mode.ts';
import { sanitizeRichtext, RICHTEXT_ALLOWED_TAGS } from '@/builder/sanitize.ts';
import { FIXED_ROUTE_KEYS } from '@/builder/types.ts';

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};

/** Spec §7, in category order. The editor's fields, menus and locks are keyed by these names. */
export const SPEC_BLOCKS = [
  'PageOutlet', 'Header', 'NavLinks', 'Footer', 'TopBar', 'NoticeBanners', 'CutoffBar', 'ContactStrip', 'MobileCartBar',
  'CatalogHero', 'CategoryNav', 'SearchField', 'ProductGrid', 'ProductList', 'WholesaleTable', 'FeaturedProducts', 'Upsells',
  'ProductDetail', 'CardTile', 'CardRow',
  'CartContents', 'CartSummary', 'CheckoutFlow', 'LoginOptions', 'AccountNav', 'OrdersList', 'OrderDetail', 'Loyalty', 'Referrals', 'Profile',
  'OrderStatus', 'PaymentSuccess', 'PaymentCancel', 'OrderPlaced', 'VerifyForm', 'TrackingLookup',
  'Heading', 'RichText', 'Image', 'Button', 'Columns', 'Section', 'Spacer', 'Divider', 'FAQ', 'Testimonial', 'Video',
] as const;

describe('Plan 2 contract the editor builds on (spec §13 A7)', () => {
  it('exposes every A7 value', () => {
    expect(typeof define.defineBlock).toBe('function');
    expect(typeof checkRules).toBe('function');
    expect(typeof validateDoc).toBe('function');
    expect(typeof defaultDoc).toBe('function');
    expect(typeof RenderDoc).toBe('function');
    expect(typeof runtime.usePageSet).toBe('function');
    expect(typeof runtime.PuckShell).toBe('function');
    expect(typeof runtime.PuckPage).toBe('function');
    expect(typeof runtime.PageSetOverrideProvider).toBe('function');
    expect(typeof mode.useBuilderMode).toBe('function');
    expect(typeof mode.BuilderModeProvider).toBe('function');
    expect(typeof sanitizeRichtext).toBe('function');
    expect(RICHTEXT_ALLOWED_TAGS.length).toBeGreaterThan(0);
    expect(FIXED_ROUTE_KEYS).toHaveLength(16);
  });

  it('registers exactly the §7 blocks, each under its own name', () => {
    expect(Object.keys(BLOCKS).filter((n) => !BLOCKS[n]!.part).sort()).toEqual([...SPEC_BLOCKS].sort());
    for (const [key, def] of Object.entries(BLOCKS)) expect(def.name).toBe(key);
  });

  it('has a default doc for the shell and every fixed route of the storefront layout', () => {
    expect(defaultDoc('shell', 'storefront')).not.toBeNull();
    for (const key of FIXED_ROUTE_KEYS) expect(defaultDoc(key, 'storefront'), key).not.toBeNull();
    expect(defaultDoc('page:about', 'storefront')).toBeNull();
  });

  it('pins @puckeditor/core exactly to 0.23.0', () => {
    expect(pkg.dependencies['@puckeditor/core']).toBe('0.23.0');
  });
});
