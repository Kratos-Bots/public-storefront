import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { LoginFamily } from '@/builder/family-login.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** Every way into an account, shared with the sign-in prompt so the page and the modal never disagree. */
export const block = defineBlock<{ id: string }>({
  name: 'LoginMethods', label: 'Ways to sign in', category: 'part', part: { family: 'login' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX]),
  text: ['auth.options.*', 'auth.telegram.*', 'auth.whatsapp.*', 'auth.login.*', 'common.contact.*', 'common.actions.signIn'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <LoginFamily.PartHost name="LoginMethods" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
