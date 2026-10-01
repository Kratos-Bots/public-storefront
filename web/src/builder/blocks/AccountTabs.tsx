import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { AccountFamily } from '@/builder/family-account.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The rail of account sections: the only way between them. */
export const block = defineBlock<{ id: string }>({
  name: 'AccountTabs', label: 'Section tabs', category: 'part', part: { family: 'account' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['account.nav.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <AccountFamily.PartHost name="AccountTabs" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
