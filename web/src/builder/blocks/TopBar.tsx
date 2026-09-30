import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { TOP_BAR_TEXT } from '@/builder/blocks/_shared/text-patterns.ts';
import { Slot } from '@/templates/runtime.tsx';

/** The template's TopBar slot on its own — for a Header with `topBar` off that wants it elsewhere. */
export const block = defineBlock<{ id: string }>({
  name: 'TopBar', label: 'Template top bar', category: 'shell', layouts: ['storefront', 'menu'], routeBound: false, slots: [],
  text: TOP_BAR_TEXT,
  schema: z.object({}), defaultProps: {},
  render: () => <Slot name="TopBar" />,
});
