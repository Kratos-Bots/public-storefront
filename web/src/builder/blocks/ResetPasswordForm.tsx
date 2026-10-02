import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ResetPasswordFamily } from '@/builder/family-reset-password.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The new-password form, or the checking / expired / unreachable panel in its place. */
export const block = defineBlock<{ id: string }>({
  name: 'ResetPasswordForm', label: 'Reset password form', category: 'part', part: { family: 'reset-password' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX]),
  text: [
    'auth.reset.form.*', 'auth.reset.expired.body', 'auth.password.rule', 'auth.password.tooShort', 'auth.password.tooLong',
    'auth.password.banned', 'auth.password.backToSignIn', 'auth.password.show', 'auth.password.hide', 'errors.rateLimited', 'common.actions.tryAgain',
  ],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ResetPasswordFamily.PartHost name="ResetPasswordForm" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
