import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { z } from 'zod';
import {
  defineBlock, PALETTE_TOKENS, parseBlockPropsDetailed, SPACING, type BlockRenderContext,
} from '@/builder/define.ts';
import { renderBlock, styleAttrs } from '@/builder/style/apply.tsx';
import {
  BOX, parseBlockStyle, STYLE_ATTR, STYLE_KEY_ORDER, STYLE_KEYS, STYLE_SPACE, STYLE_TOKENS, styleSupport, TEXT, VIS,
  type StyleSupport,
} from '@/builder/style/model.ts';
import { STYLE_LABELS } from '@/builder/style/labels.ts';

const ALL: StyleSupport = styleSupport('root', [...BOX, ...TEXT, ...VIS]);
const HEADING: StyleSupport = styleSupport('root', [...BOX, 'fg', 'textSize', ...VIS]);

/**
 * Verbatim copy of the backend's BLOCK_STYLE_VALUES
 * (ecommerce-backend src/modules/storefront-pages/schemas.ts). The two must match exactly —
 * keys, order and values — or a value the storefront emits makes every save a 400.
 * Change both together, backend first.
 */
const STYLE_PALETTE = ['bg', 'bg-deep', 'surface', 'surface-2', 'surface-3', 'line', 'line-strong',
  'text', 'muted', 'faint', 'primary', 'primary-soft', 'success', 'warn', 'danger'] as const;
const BACKEND_STYLE_SPACE = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const;
const BACKEND_BLOCK_STYLE_VALUES = {
  bg: STYLE_PALETTE,
  fg: STYLE_PALETTE,
  padTop: BACKEND_STYLE_SPACE,
  padBottom: BACKEND_STYLE_SPACE,
  padX: BACKEND_STYLE_SPACE,
  marginTop: BACKEND_STYLE_SPACE,
  marginBottom: BACKEND_STYLE_SPACE,
  border: ['thin', 'medium', 'thick'],
  borderColor: STYLE_PALETTE,
  borderStyle: ['solid', 'dashed', 'dotted'],
  radius: ['none', 'sm', 'md', 'lg', 'card', 'pill'],
  shadow: ['card', 'raised'],
  textSize: ['sm', 'lg', 'xl'],
  align: ['start', 'center', 'end'],
  maxWidth: ['narrow', 'text', 'wide'],
  hide: ['mobile', 'desktop'],
} as const;

describe('style model', () => {
  it('has the spec §3.1 keys in canonical order, 16 of them', () => {
    expect(STYLE_KEY_ORDER).toEqual(['bg', 'fg', 'padTop', 'padBottom', 'padX', 'marginTop', 'marginBottom', 'border',
      'borderColor', 'borderStyle', 'radius', 'shadow', 'textSize', 'align', 'maxWidth', 'hide']);
    expect(Object.keys(STYLE_KEYS)).toEqual(STYLE_KEY_ORDER);
  });
  it('mirrors the backend BLOCK_STYLE_VALUES exactly (keys, order, values)', () => {
    expect(Object.keys(STYLE_KEYS)).toEqual(Object.keys(BACKEND_BLOCK_STYLE_VALUES));
    for (const k of STYLE_KEY_ORDER) expect([...STYLE_KEYS[k]]).toEqual([...BACKEND_BLOCK_STYLE_VALUES[k]]);
  });
  it('colour tokens are the palette without none; spacing steps are SPACING keys', () => {
    expect([...STYLE_TOKENS]).toEqual(PALETTE_TOKENS.filter((t) => t !== 'none'));
    expect([...STYLE_SPACE]).toEqual(Object.keys(SPACING));
  });
  it('groups cover every key exactly once', () => {
    expect([...BOX, ...TEXT, ...VIS].sort()).toEqual([...STYLE_KEY_ORDER].sort());
    expect(new Set([...BOX, ...TEXT, ...VIS]).size).toBe(16);
  });
  it('styleSupport keeps canonical order and applies exclusions', () => {
    expect(styleSupport('wrap', ['hide', 'bg', 'padTop'])).toEqual({ target: 'wrap', keys: ['bg', 'padTop', 'hide'] });
    expect(styleSupport('root', [...BOX], ['bg', 'maxWidth']).keys).not.toContain('bg');
  });
  it('every key has an attribute suffix and a label', () => {
    for (const k of STYLE_KEY_ORDER) {
      expect(STYLE_ATTR[k]).toMatch(/^[a-z]+$/);
      expect(STYLE_LABELS[k].length).toBeGreaterThan(0);
    }
    expect(STYLE_ATTR).toMatchObject({ padTop: 'pt', padBottom: 'pb', padX: 'px', marginTop: 'mt', marginBottom: 'mb', borderColor: 'bc', borderStyle: 'bs', textSize: 'text', maxWidth: 'max' });
  });
});

describe('parseBlockStyle (spec §10.1)', () => {
  it('absent → nothing, no issue', () => {
    expect(parseBlockStyle(ALL, undefined)).toEqual({ issues: [] });
  });
  it.each([null, 'surface', 3, true, [], [{ bg: 'surface' }]])('not a plain object (%j) → issue on blockStyle', (raw) => {
    expect(parseBlockStyle(ALL, raw)).toEqual({ issues: ['blockStyle'] });
  });
  it('unknown keys are dropped silently', () => {
    expect(parseBlockStyle(ALL, { bg: 'surface', glow: 'lots' })).toEqual({ style: { bg: 'surface' }, issues: [] });
  });
  it('a key the block does not accept is dropped with an issue', () => {
    expect(parseBlockStyle(HEADING, { align: 'center', bg: 'surface' })).toEqual({ style: { bg: 'surface' }, issues: ['blockStyle.align'] });
  });
  it('an invalid value is dropped with an issue', () => {
    expect(parseBlockStyle(ALL, { bg: '#ff0000', padTop: 'inherit', radius: 'card' })).toEqual({ style: { radius: 'card' }, issues: ['blockStyle.bg', 'blockStyle.padTop'] });
  });
  it('nothing left → no blockStyle; {} → no blockStyle and no issue', () => {
    expect(parseBlockStyle(HEADING, { align: 'end' })).toEqual({ issues: ['blockStyle.align'] });
    expect(parseBlockStyle(ALL, {})).toEqual({ issues: [] });
  });
  it('support false: every known key is an issue', () => {
    expect(parseBlockStyle(false, { bg: 'surface', hide: 'mobile', other: 'x' })).toEqual({ issues: ['blockStyle.bg', 'blockStyle.hide'] });
  });
  it('writes keys in canonical order', () => {
    const { style } = parseBlockStyle(ALL, { hide: 'mobile', radius: 'card', bg: 'surface-2', padTop: 'lg' });
    expect(Object.keys(style!)).toEqual(['bg', 'padTop', 'radius', 'hide']);
  });
  it('treats an undefined value as absent', () => {
    expect(parseBlockStyle(ALL, { bg: undefined, fg: 'text' })).toEqual({ style: { fg: 'text' }, issues: [] });
  });
  // Review Focus 1: hostile input never pollutes or throws.
  it('ignores __proto__ / constructor / toString keys and non-string values', () => {
    const raw = JSON.parse('{"__proto__":{"polluted":"yes"},"constructor":"x","toString":"y","bg":"surface","padTop":2,"radius":null,"shadow":["card"]}');
    const out = parseBlockStyle(ALL, raw);
    expect(out).toEqual({ style: { bg: 'surface' }, issues: ['blockStyle.padTop', 'blockStyle.radius', 'blockStyle.shadow'] });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(out.style)).toBe(Object.prototype);
  });
  it('accepts a null-prototype object', () => {
    const raw = Object.assign(Object.create(null) as Record<string, unknown>, { bg: 'surface' });
    expect(parseBlockStyle(ALL, raw)).toEqual({ style: { bg: 'surface' }, issues: [] });
  });
});

const ctx: BlockRenderContext = { editing: false, docKey: 'page:x', layout: 'storefront' };
const rootDef = defineBlock<{ id: string; text: string }>({
  name: 'RootBox', label: 'Root box', category: 'content', layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', ['bg', 'padTop', 'hide']),
  schema: z.object({ text: z.string() }), defaultProps: { text: '' }, render: () => null,
});
const wrapDef = { ...rootDef, name: 'WrapBox', style: styleSupport('wrap', ['bg', 'hide']) };
const offDef = { ...rootDef, name: 'Off', style: false as const };

describe('styleAttrs (spec §5.1)', () => {
  it.each([undefined, null, {}, { align: 'center' }, { bg: 'hotpink' }, 'bg'])('null for %j', (s) => {
    expect(styleAttrs(rootDef, s, false)).toBeNull();
  });
  it('null when the block is not stylable', () => {
    expect(styleAttrs(offDef, { bg: 'surface' }, false)).toBeNull();
  });
  it('marker first, one attribute per allowed key, canonical order', () => {
    expect(Object.entries(styleAttrs(rootDef, { hide: 'mobile', padTop: 'lg', bg: 'surface' }, false)!)).toEqual([
      ['data-sf-style', 'RootBox'], ['data-sfs-bg', 'surface'], ['data-sfs-pt', 'lg'], ['data-sfs-hide', 'mobile'],
    ]);
  });
  it('hide becomes ghost while editing', () => {
    expect(styleAttrs(rootDef, { hide: 'desktop' }, true)).toEqual({ 'data-sf-style': 'RootBox', 'data-sfs-ghost': 'desktop' });
  });
});

describe('renderBlock (spec §5.1, §6)', () => {
  function spy(def: typeof rootDef) {
    const calls: Array<Record<string, unknown>> = [];
    return { calls, def: { ...def, render: (p: Record<string, unknown>) => { calls.push(p); return 'body'; } } as unknown as typeof rootDef };
  }
  it('unstyled: the exact call made today, same ctx reference, no blockStyle prop', () => {
    const { calls, def } = spy(rootDef);
    for (const blockStyle of [undefined, {}, { align: 'end' }]) {
      const props: Record<string, unknown> = { id: 'a', text: 't', ...(blockStyle ? { blockStyle } : {}) };
      expect(renderBlock(def, props, ctx)).toBe('body');
    }
    for (const p of calls) {
      expect(p.puck).toBe(ctx);
      expect(p).toEqual({ id: 'a', text: 't', puck: ctx });
    }
  });
  it('root: attributes arrive as puck.style', () => {
    const { calls, def } = spy(rootDef);
    renderBlock(def, { id: 'a', text: 't', blockStyle: { bg: 'surface' } }, ctx);
    expect(calls[0]!.puck).toEqual({ ...ctx, style: { 'data-sf-style': 'RootBox', 'data-sfs-bg': 'surface' } });
    expect('blockStyle' in calls[0]!).toBe(false);
  });
  it('wrap: one div carrying the attributes around the unchanged render', () => {
    const { calls, def } = spy(wrapDef as typeof rootDef);
    const out = renderBlock(def, { id: 'a', text: 't', blockStyle: { bg: 'surface', padTop: 'lg' } }, ctx) as ReactElement<Record<string, unknown>>;
    expect(isValidElement(out) && out.type).toBe('div');
    expect(out.props).toMatchObject({ 'data-sf-style': 'WrapBox', 'data-sfs-bg': 'surface', children: 'body' });
    expect(out.props['data-sfs-pt']).toBeUndefined();
    expect(calls[0]!.puck).toBe(ctx);
  });
});

describe('parseBlockPropsDetailed with blockStyle', () => {
  it('keeps the guarded style beside the schema props and reports dropped keys', () => {
    expect(parseBlockPropsDetailed(rootDef, { text: 'x', blockStyle: { bg: 'surface', fg: 'text', zz: 1 } })).toEqual({
      props: { text: 'x', blockStyle: { bg: 'surface' } }, fallbacks: ['blockStyle.fg'],
    });
  });
  it('no blockStyle key when nothing survives; an absent style changes nothing', () => {
    expect(parseBlockPropsDetailed(rootDef, { text: 'x', blockStyle: {} })).toEqual({ props: { text: 'x' }, fallbacks: [] });
    expect(parseBlockPropsDetailed(rootDef, { text: 'x' })).toEqual({ props: { text: 'x' }, fallbacks: [] });
  });
  it('a block with no style declaration treats every style key as not accepted', () => {
    const bare = { ...rootDef, style: false as const };
    expect(parseBlockPropsDetailed(bare, { text: 'x', blockStyle: { bg: 'surface' } }).fallbacks).toEqual(['blockStyle.bg']);
  });
});
