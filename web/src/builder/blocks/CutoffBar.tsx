import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CutoffBar } from '@/features/notices/CutoffBar.tsx';

/** The dispatch cut-off rail; the template's core options still decide its copy and countdown. */
export const block = defineBlock<{ id: string }>({
  name: 'CutoffBar', label: 'Dispatch cut-off', category: 'shell', layouts: 'all', routeBound: false, slots: [],
  text: ['notices.cutoff.*'],
  schema: z.object({}), defaultProps: {},
  render: () => <CutoffBar />,
});
