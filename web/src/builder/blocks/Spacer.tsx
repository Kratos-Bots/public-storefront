import { z } from 'zod';
import { defineBlock, spacing, SPACING, type SpacingKey } from '@/builder/define.ts';

export const block = defineBlock<{ id: string; size: SpacingKey }>({
  name: 'Spacer', label: 'Spacer', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ size: spacing() }), defaultProps: { size: 'md' },
  render: ({ size }) => <div aria-hidden data-sf-block="Spacer" style={{ height: SPACING[size] }} />,
});
