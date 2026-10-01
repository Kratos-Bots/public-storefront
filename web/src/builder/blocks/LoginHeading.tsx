import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { LoginFamily } from '@/builder/family-login.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The sign-in heading and its one-line lede. */
export const block = defineBlock<{ id: string }>({
  name: 'LoginHeading', label: 'Heading', category: 'part', part: { family: 'login' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['auth.page.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <LoginFamily.PartHost name="LoginHeading" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
