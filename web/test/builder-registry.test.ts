import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { collectBlocks } from '@/builder/registry.ts';
import { defineBlock } from '@/builder/define.ts';

const make = (name: string) => defineBlock<{ id: string }>({
  name, label: name, category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({}), defaultProps: {}, render: () => null,
});

describe('collectBlocks', () => {
  it('keys blocks by name and requires the file name to match', () => {
    expect(Object.keys(collectBlocks({ './blocks/Heading.tsx': { block: make('Heading') } }))).toEqual(['Heading']);
    expect(() => collectBlocks({ './blocks/Heading.tsx': { block: make('Title') } })).toThrow(/Heading/);
  });
  it('rejects names outside the block-type pattern', () => {
    expect(() => collectBlocks({ './blocks/heading.tsx': { block: make('heading') } })).toThrow();
  });
});
