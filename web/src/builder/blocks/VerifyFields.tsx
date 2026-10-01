import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { VerifyFamily } from '@/builder/family-verify.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The two code fields and the submit button. */
export const block = defineBlock<{ id: string }>({
  name: 'VerifyFields', label: 'Verify form', category: 'part', part: { family: 'verify' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX]),
  text: ['verify.form.*', 'verify.errors.*', 'checkout.errors.required', 'common.status.checking'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <VerifyFamily.PartHost name="VerifyFields" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
