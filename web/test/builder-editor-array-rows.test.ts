import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ArrayField } from '@puckeditor/core';
import { BLOCKS } from '@/builder/registry.ts';
import { EDITOR_FIELDS } from '@/builder/editor/config.ts';

/**
 * A row added with the "+" under a list field must be one the block can show. The published
 * renderer drops rows that fail the schema (an FAQ question or a nav label may not be empty), so
 * a blank new row would be invisible on the canvas until filled in — the person would think the
 * add did nothing. FeaturedProducts is the exception by design: its new row waits for the picker
 * and is stripped from the canvas and from what the admin receives until then (prepare.ts).
 */
const WAITS_FOR_PICKER = new Set(['FeaturedProducts']);

const arrayFields = Object.entries(EDITOR_FIELDS).flatMap(([name, fields]) =>
  Object.entries(fields)
    .filter(([, f]) => f.type === 'array')
    .map(([key, f]) => ({ name, key, field: f as ArrayField })),
);

describe('list fields: a newly added row', () => {
  it('covers the blocks with object lists', () => {
    expect(arrayFields.map((a) => `${a.name}.${a.key}`).sort()).toEqual(expect.arrayContaining(['FAQ.items', 'NavLinks.items']));
  });

  for (const { name, key, field } of arrayFields) {
    if (WAITS_FOR_PICKER.has(name)) continue;
    it(`${name}.${key} starts valid, so it shows on the canvas at once`, () => {
      const schema = BLOCKS[name]!.schema as z.ZodObject<Record<string, z.ZodType>>;
      const list = schema.shape[key] as z.ZodArray<z.ZodType>;
      const row = field.defaultItemProps;
      expect(list.element.safeParse(row).success, JSON.stringify(row)).toBe(true);
    });
  }
});
