import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ShellFooter } from '@/layouts/ShellFooter.tsx';

/** `template` = the active template's Footer slot (Task 21 adds the composable `columns` variant). */
export const block = defineBlock<{ id: string; variant: 'template' }>({
  name: 'Footer', label: 'Footer', category: 'shell', layouts: ['storefront', 'menu'], routeBound: false, slots: [],
  schema: z.object({ variant: z.enum(['template']) }),
  defaultProps: { variant: 'template' },
  render: () => <ShellFooter />,
});
