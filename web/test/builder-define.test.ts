import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  boolOverride, compactScope, defineBlock, iconOverride, isSafeHref, mediaSrc, override,
  paletteToken, parseBlockProps, parseBlockPropsDetailed, routeLink, slot, tokenVar,
} from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';

type P = { id: string; title: string; size: 'sm' | 'lg'; items: ComponentData[] };
const def = defineBlock<{ id: string; title: string; size: 'sm' | 'lg' }>({
  name: 'Probe', label: 'Probe', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ title: z.string().max(10), size: z.enum(['sm', 'lg']) }),
  defaultProps: { title: 'Hello', size: 'sm' },
  render: () => null,
});

describe('parseBlockProps', () => {
  it('keeps valid props and strips unknown keys', () => {
    expect(parseBlockProps(def, { title: 'Hi', size: 'lg', extra: 1 })).toEqual({ title: 'Hi', size: 'lg' });
  });
  it('falls back field by field', () => {
    expect(parseBlockProps(def, { title: 'x'.repeat(11), size: 'lg' })).toEqual({ title: 'Hello', size: 'lg' });
    expect(parseBlockProps(def, {})).toEqual({ title: 'Hello', size: 'sm' });
  });
  it('does not share default objects between parses', () => {
    const withSlot = defineBlock<P>({
      name: 'Box', label: 'Box', category: 'content', layouts: 'all', routeBound: false, slots: ['items'],
      schema: z.object({ title: z.string(), size: z.enum(['sm', 'lg']), items: slot() }),
      defaultProps: { title: 't', size: 'sm', items: [] },
      render: () => null,
    });
    const a = parseBlockProps(withSlot, { items: 'nope' });
    (a.items as unknown[]).push(1);
    expect(parseBlockProps(withSlot, { items: 'nope' }).items).toEqual([]);
  });
});

describe('parseBlockPropsDetailed', () => {
  const rich = defineBlock<{ id: string; title: string; src: string; size: 'sm' | 'lg'; n: number; on: boolean; links: { label: string }[] }>({
    name: 'Rich', label: 'Rich', category: 'content', layouts: 'all', routeBound: false, slots: [],
    schema: z.object({
      title: z.string().min(1).max(10), src: mediaSrc(), size: z.enum(['sm', 'lg']), n: z.number().int().min(1), on: z.boolean(),
      links: z.array(z.object({ label: z.string().min(1) })).max(3),
    }),
    defaultProps: { title: 'Placeholder', src: '', size: 'sm', n: 4, on: true, links: [{ label: 'Placeholder link' }] },
    render: () => null,
  });
  const valid = { title: 'Ok', src: '', size: 'lg', n: 2, on: false, links: [{ label: 'A' }] };

  it('reports nothing for a valid object', () => {
    expect(parseBlockPropsDetailed(rich, valid)).toEqual({ props: valid, fallbacks: [] });
  });
  it('neutral: strings → "", arrays → [], enums/numbers/booleans → the schema-safe default', () => {
    const r = parseBlockPropsDetailed(rich, { title: 'x'.repeat(11), src: 'https://evil.example/x.png', size: 'xl', n: 0, on: 'yes', links: 'nope' });
    expect(r.props).toEqual({ title: '', src: '', size: 'sm', n: 4, on: true, links: [] });
    expect(r.fallbacks).toEqual(['title', 'src', 'size', 'n', 'on', 'links']);
  });
  it('defaults mode (the editor) still uses defaultProps', () => {
    expect(parseBlockPropsDetailed(rich, { ...valid, title: '' }, 'defaults').props.title).toBe('Placeholder');
    expect(parseBlockProps(rich, { ...valid, title: '' }).title).toBe('Placeholder');
  });
  it('keeps the valid items of an array and reports each invalid one by index', () => {
    const r = parseBlockPropsDetailed(rich, { ...valid, links: [{ label: 'A' }, { label: '' }, null, { label: 'B' }] });
    expect(r.props.links).toEqual([{ label: 'A' }, { label: 'B' }]);
    expect(r.fallbacks).toEqual(['links[1]', 'links[2]']);
  });
  it('falls back the whole array when its valid items still break the array rule', () => {
    const r = parseBlockPropsDetailed(rich, { ...valid, links: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }, { label: '' }] });
    expect(r.props.links).toEqual([]);
    expect(r.fallbacks).toEqual(['links']);
  });
});

describe('field helpers', () => {
  it('routeLink accepts site paths and safe schemes only', () => {
    for (const ok of ['', '/', '/pages/our-story', 'https://shop.example/x', 'mailto:hi@shop.example', 'tel:+441234']) expect(routeLink().safeParse(ok).success, ok).toBe(true);
    for (const bad of ['//evil.example', '/\\evil.example', 'http://shop.example', 'javascript:alert(1)', 'pages/x', ' /x']) expect(routeLink().safeParse(bad).success, bad).toBe(false);
    for (const bad of ['/\t/evil.example', '/\n/evil.example', '/\r/evil.example', ' /x', '/a b']) expect(isSafeHref(bad), JSON.stringify(bad)).toBe(false);
    expect(isSafeHref('/c/concentrates')).toBe(true);
    expect(isSafeHref('//evil.example')).toBe(false);
    expect(isSafeHref('/\\evil.example')).toBe(false);
  });
  it('mediaSrc accepts only uploaded storefront-page media', () => {
    expect(mediaSrc().safeParse('/media/storefront-pages/media/' + 'a'.repeat(32) + '.webp').success).toBe(true);
    expect(mediaSrc().safeParse('').success).toBe(true);
    expect(mediaSrc().safeParse('https://cdn.example/x.png').success).toBe(false);
    expect(mediaSrc().safeParse('/media/storefront-pages/media/' + 'A'.repeat(32) + '.png').success).toBe(false);
  });
  it('palette tokens map to --sf variables', () => {
    expect(paletteToken().safeParse('surface-2').success).toBe(true);
    expect(paletteToken().safeParse('#ff0000').success).toBe(false);
    expect(tokenVar('primary')).toBe('var(--sf-primary)');
    expect(tokenVar('none')).toBeUndefined();
  });
  it('overrides map onto core options, dropping inherit', () => {
    expect(override().safeParse('inherit').success).toBe(true);
    expect(boolOverride('show')).toBe(true);
    expect(boolOverride('hide')).toBe(false);
    expect(boolOverride('inherit')).toBeUndefined();
    expect(iconOverride('show')).toBe('all');
    expect(iconOverride('hide')).toBe('none');
    expect(compactScope({ showSku: false, showPageTitle: undefined })).toEqual({ showSku: false });
  });
});
