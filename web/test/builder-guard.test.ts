import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/builder/registry.ts', async () => {
  const { defineBlock, slot } = await import('@/builder/define.ts');
  return {
    BLOCKS: {
      Heading: defineBlock<{ id: string; text: string; level: 'h2' | 'h3' }>({
        name: 'Heading', label: 'Heading', category: 'content', layouts: 'all', routeBound: false, slots: [],
        schema: z.object({ text: z.string().max(20), level: z.enum(['h2', 'h3']) }),
        defaultProps: { text: 'Heading', level: 'h2' }, render: () => null,
      }),
      Section: defineBlock({
        name: 'Section', label: 'Section', category: 'content', layouts: 'all', routeBound: false, slots: ['content'],
        schema: z.object({ content: slot() }), defaultProps: { content: [] }, render: () => null,
      }),
      MenuOnly: defineBlock<{ id: string }>({
        name: 'MenuOnly', label: 'Menu only', category: 'content', layouts: ['menu'], routeBound: false, slots: [],
        schema: z.object({}), defaultProps: {}, render: () => null,
      }),
      CheckoutFlow: defineBlock<{ id: string }>({
        name: 'CheckoutFlow', label: 'Checkout flow', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
        schema: z.object({}), defaultProps: {}, render: () => null,
      }),
    },
  };
});

import { validateDoc } from '@/builder/guard.ts';

const root = { props: { title: 'About', description: '', chrome: 'shell' } };
afterEach(() => vi.restoreAllMocks());

describe('validateDoc', () => {
  it('passes a valid doc through with parsed props', () => {
    const r = validateDoc({ root, content: [{ type: 'Heading', props: { id: 'h', text: 'Hi', level: 'h3' } }] }, 'page:about', 'storefront');
    expect(r.issues).toEqual([]);
    expect(r.doc!.content[0]).toEqual({ type: 'Heading', props: { id: 'h', text: 'Hi', level: 'h3' } });
    expect(r.doc!.root.props.title).toBe('About');
  });
  it('rejects a non-document', () => {
    expect(validateDoc('nope', 'page:about', 'storefront').doc).toBeNull();
    expect(validateDoc({ root, content: 'x' }, 'page:about', 'storefront').doc).toBeNull();
  });
  it('drops unknown block types with one warning per type', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = validateDoc({ root, content: [{ type: 'Carousel', props: { id: 'a' } }, { type: 'Carousel', props: { id: 'b' } }, { type: 'Heading', props: { id: 'h' } }] }, 'page:about', 'storefront');
    expect(r.doc!.content.map((x) => x.type)).toEqual(['Heading']);
    expect(r.issues.map((i) => i.rule)).toEqual(['drop:unknown-block', 'drop:unknown-block']);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('drops an unknown block nested in a slot and keeps its siblings', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = validateDoc({ root, content: [{ type: 'Section', props: { id: 's', content: [{ type: 'Gizmo', props: { id: 'g' } }, { type: 'Heading', props: { id: 'h', text: 'Kept' } }] } }] }, 'page:about', 'storefront');
    const section = r.doc!.content[0]!;
    expect((section.props.content as { type: string }[]).map((x) => x.type)).toEqual(['Heading']);
  });
  it('falls back per field on a bad prop', () => {
    const r = validateDoc({ root, content: [{ type: 'Heading', props: { id: 'h', text: 'x'.repeat(21), level: 'h3' } }] }, 'page:about', 'storefront');
    expect(r.doc!.content[0]!.props).toEqual({ id: 'h', text: 'Heading', level: 'h3' });
  });
  it('drops a block outside its layouts', () => {
    const r = validateDoc({ root, content: [{ type: 'MenuOnly', props: { id: 'm' } }] }, 'page:about', 'storefront');
    expect(r.doc!.content).toEqual([]);
    expect(r.issues[0]!.rule).toBe('drop:layout');
  });
  it('re-keys duplicate ids', () => {
    const r = validateDoc({ root, content: [{ type: 'Heading', props: { id: 'dup' } }, { type: 'Heading', props: { id: 'dup' } }] }, 'page:about', 'storefront');
    const ids = r.doc!.content.map((x) => x.props.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe('dup');
  });
  it('replaces the whole doc when a rule fails, naming the rule once', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = validateDoc({ root, content: [{ type: 'Heading', props: { id: 'h' } }] }, 'checkout', 'storefront');
    expect(r.doc).toBeNull();
    expect(r.issues.map((i) => i.rule)).toEqual(['exactly-one:CheckoutFlow']);
    expect(error).toHaveBeenCalledTimes(1);
  });
  it('bad root props fall back per field; a shell is always chrome "shell"', () => {
    const r = validateDoc({ root: { props: { title: 'x'.repeat(121), chrome: 'none' } }, content: [] }, 'page:about', 'storefront');
    expect(r.doc!.root.props).toEqual({ title: '', description: '', chrome: 'none' });
  });
  it('drops blocks nested deeper than 12', () => {
    let node: Record<string, unknown> = { type: 'Heading', props: { id: 'leaf' } };
    for (let i = 0; i < 13; i += 1) node = { type: 'Section', props: { id: `s${i}`, content: [node] } };
    const r = validateDoc({ root, content: [node] }, 'page:about', 'storefront');
    expect(JSON.stringify(r.doc)).not.toContain('"leaf"');
    expect(r.issues.some((i) => i.rule === 'drop:depth')).toBe(true);
  });
  it('memoises per doc object', () => {
    const doc = { root, content: [] };
    expect(validateDoc(doc, 'page:about', 'storefront')).toBe(validateDoc(doc, 'page:about', 'storefront'));
  });
});
