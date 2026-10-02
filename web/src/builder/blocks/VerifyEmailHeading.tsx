import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { VerifyEmailFamily } from '@/builder/family-verify-email.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The confirm-your-email heading. */
export const block = defineBlock<{ id: string }>({
  name: 'VerifyEmailHeading', label: 'Verify email heading', category: 'part', part: { family: 'verify-email' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['auth.verifyEmail.heading.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <VerifyEmailFamily.PartHost name="VerifyEmailHeading" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
