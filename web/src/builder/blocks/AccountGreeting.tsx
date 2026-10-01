import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { AccountFamily } from '@/builder/family-account.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The account letterhead: the shopper's name (the page's h1) and standing line. */
export const block = defineBlock<{ id: string }>({
  name: 'AccountGreeting', label: 'Greeting', category: 'part', part: { family: 'account' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['account.layout.*', 'account.orders.count', 'common.nav.yourAccount'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <AccountFamily.PartHost name="AccountGreeting" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
