import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { deriveFields, humanizeKey } from '@/builder/editor/derive-fields.ts';
import type { BlockDef } from '@/builder/define.ts';
import { slot } from '@/builder/define.ts';

function def(schema: z.ZodType, slots: string[] = []): BlockDef<Record<string, unknown>> {
  return { name: 'Probe', label: 'Probe', category: 'content', layouts: 'all', routeBound: false, slots, schema, defaultProps: {}, render: () => null } as unknown as BlockDef<Record<string, unknown>>;
}

describe('deriveFields', () => {
  it('maps prop names to the custom fields first', () => {
    const { fields, uncovered } = deriveFields(def(z.object({
      bodyHtml: z.string(), href: z.string(), ctaHref: z.string(), src: z.string(), heroSrc: z.string(),
      backgroundToken: z.enum(['none', 'surface', 'primary']), productId: z.number(), featuredCategoryId: z.number().nullable(),
    })));
    expect(uncovered).toEqual([]);
    expect(fields.bodyHtml).toMatchObject({ type: 'richtext', label: 'Body' });
    expect(fields.href).toMatchObject({ type: 'custom', label: 'Link' });
    expect(fields.ctaHref).toMatchObject({ type: 'custom', label: 'Cta' });
    expect(fields.src).toMatchObject({ type: 'custom', label: 'Image' });
    expect(fields.backgroundToken).toMatchObject({ type: 'custom', label: 'Background' });
    expect(fields.productId).toMatchObject({ type: 'external', label: 'Product' });
    expect(fields.featuredCategoryId).toMatchObject({ type: 'external', label: 'Featured category' });
  });

  it('maps JSON-schema types', () => {
    const { fields, uncovered } = deriveFields(def(z.object({
      title: z.string().max(120), body: z.string().max(2000), level: z.number().int().min(1).max(4),
      sticky: z.boolean(), sku: z.enum(['inherit', 'show', 'hide']), padding: z.enum(['none', 'sm', 'md', 'lg', 'xl']),
      items: z.array(z.object({ question: z.string(), answerHtml: z.string() })),
      meta: z.object({ caption: z.string() }),
    }), ['children']));
    expect(uncovered).toEqual([]);
    expect(fields.title).toMatchObject({ type: 'text' });
    expect(fields.body).toMatchObject({ type: 'textarea' });
    expect(fields.level).toMatchObject({ type: 'number', min: 1, max: 4 });
    expect(fields.sticky).toMatchObject({ type: 'radio', options: [{ label: 'On', value: true }, { label: 'Off', value: false }] });
    expect(fields.sku).toMatchObject({ type: 'radio', options: [{ label: 'Inherit', value: 'inherit' }, { label: 'Show', value: 'show' }, { label: 'Hide', value: 'hide' }] });
    expect(fields.padding).toMatchObject({ type: 'select' });
    expect(fields.items).toMatchObject({ type: 'array', arrayFields: { question: { type: 'text' }, answerHtml: { type: 'richtext' } }, defaultItemProps: { question: '', answerHtml: '' } });
    expect(fields.meta).toMatchObject({ type: 'object', objectFields: { caption: { type: 'text' } } });
    expect(fields.children).toEqual({ type: 'slot', label: 'Children' });
  });

  it('reports keys it cannot map instead of guessing', () => {
    const { uncovered } = deriveFields(def(z.object({
      ids: z.array(z.number()),
      when: z.date(),
      // Would be read as components by the backend (items with both `type` and `props`).
      cards: z.array(z.object({ type: z.string(), props: z.object({ label: z.string() }) })),
    })));
    expect(uncovered.sort()).toEqual(['cards', 'ids', 'when']);
  });

  it('humanises keys', () => {
    expect(humanizeKey('showSku')).toBe('Show sku');
    expect(humanizeKey('answerHtml')).toBe('Answer');
    expect(humanizeKey('href')).toBe('Link');
    expect(humanizeKey('src')).toBe('Image');
  });

  it('treats declared slot props as slots, never as uncovered array keys', () => {
    const { fields, uncovered } = deriveFields(def(z.object({ padding: z.enum(['sm', 'md']), content: slot() }), ['content']));
    expect(uncovered).toEqual([]);
    expect(fields.content).toEqual({ type: 'slot', label: 'Content' });
  });

  it('honours exclusive minimums (zod positive()) for number bounds and new-row defaults', () => {
    const { fields } = deriveFields(def(z.object({
      limit: z.number().int().positive().max(24),
      rows: z.array(z.object({ qty: z.number().int().positive(), note: z.string() })).min(1).max(12),
    })));
    expect(fields.limit).toMatchObject({ type: 'number', min: 1, max: 24 });
    expect(fields.rows).toMatchObject({ type: 'array', min: 1, max: 12, defaultItemProps: { qty: 1, note: '' } });
  });

  it('summarises array rows by their first text prop', () => {
    const { fields } = deriveFields(def(z.object({ items: z.array(z.object({ label: z.string(), href: z.string() })) })));
    const summary = (fields.items as unknown as { getItemSummary: (row: Record<string, unknown>, i?: number) => unknown }).getItemSummary;
    expect(summary({ label: 'Shop', href: '/' }, 0)).toBe('Shop');
    expect(summary({ label: '  ', href: '/' }, 2)).toBe('Item 3');
  });
});
