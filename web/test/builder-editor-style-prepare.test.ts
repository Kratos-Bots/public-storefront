import { describe, expect, it } from 'vitest';
import { prepareDoc, prepareProps } from '@/builder/editor/prepare.ts';
import type { PuckDoc } from '@/builder/types.ts';

describe('prepareProps · blockStyle (spec §9.2)', () => {
  it('leaves props without blockStyle untouched (same object)', () => {
    const p = { id: 'h', text: 'Hi' };
    expect(prepareProps('Heading', p)).toBe(p);
  });
  it('keeps an already-clean style by identity', () => {
    const p = { id: 'h', text: 'Hi', blockStyle: { bg: 'surface', padTop: 'lg' } };
    expect(prepareProps('Heading', p)).toBe(p);
  });
  // Review Focus 4: Puck's leftovers never reach the admin.
  it.each([undefined, {}, { bg: undefined }, { align: 'center' }, { bg: '#fff' }, 'surface', null])('removes %j', (blockStyle) => {
    const out = prepareProps('Heading', { id: 'h', text: 'Hi', blockStyle });
    expect(out).toEqual({ id: 'h', text: 'Hi' });
    expect(Object.hasOwn(out, 'blockStyle')).toBe(false);
  });
  it('drops unknown / disallowed / invalid keys and writes canonical order', () => {
    const out = prepareProps('Heading', { id: 'h', text: 'Hi', blockStyle: { hide: 'mobile', zz: 1, align: 'end', bg: 'surface', radius: 'huge' } });
    expect(out.blockStyle).toEqual({ bg: 'surface', hide: 'mobile' });
    expect(Object.keys(out.blockStyle as object)).toEqual(['bg', 'hide']);
  });
  it('a non-stylable block loses any style', () => {
    expect(prepareProps('PageOutlet', { id: 'o', blockStyle: { bg: 'surface' } })).toEqual({ id: 'o' });
  });
  it('still runs the per-block clean-up first (FeaturedProducts rows)', () => {
    const out = prepareProps('FeaturedProducts', { id: 'f', items: [{}], blockStyle: {} });
    expect(out).toEqual({ id: 'f', items: [] });
  });
  it('prepareDoc reaches styles in slots and keeps an unchanged doc by identity', () => {
    const clean: PuckDoc = { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [
      { type: 'Section', props: { id: 's', content: [{ type: 'Heading', props: { id: 'h', text: 'Hi', blockStyle: { bg: 'surface' } } }] } },
    ] };
    expect(prepareDoc(clean)).toBe(clean);
    const dirty: PuckDoc = { ...clean, content: [{ type: 'Section', props: { id: 's', content: [{ type: 'Heading', props: { id: 'h', text: 'Hi', blockStyle: {} } }] } }] };
    expect(JSON.stringify(prepareDoc(dirty))).not.toContain('blockStyle');
  });
});
