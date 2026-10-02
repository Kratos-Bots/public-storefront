import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { VerifyEmailFamily } from '@/builder/family-verify-email.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The outcome of the confirmation: confirming, confirmed, expired, someone else's link, or a failure with Try again. */
export const block = defineBlock<{ id: string }>({
  name: 'VerifyEmailStatus', label: 'Verify email status', category: 'part', part: { family: 'verify-email' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['auth.verifyEmail.status.*', 'auth.password.banned', 'errors.rateLimited', 'common.actions.tryAgain'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <VerifyEmailFamily.PartHost name="VerifyEmailStatus" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
