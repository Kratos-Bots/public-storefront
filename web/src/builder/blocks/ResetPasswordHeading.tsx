import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ResetPasswordFamily } from '@/builder/family-reset-password.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The reset page's heading and lede. */
export const block = defineBlock<{ id: string }>({
  name: 'ResetPasswordHeading', label: 'Reset password heading', category: 'part', part: { family: 'reset-password' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['auth.reset.heading.*', 'auth.reset.expired.title'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ResetPasswordFamily.PartHost name="ResetPasswordHeading" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
