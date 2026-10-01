import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { VerifyFamily } from '@/builder/family-verify.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The verdict card (authentic, expired, not verified or a connection error); nothing before an answer. */
export const block = defineBlock<{ id: string }>({
  name: 'VerifyResult', label: 'Verify verdict', category: 'part', part: { family: 'verify' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['verify.result.*', 'common.contact.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <VerifyFamily.PartHost name="VerifyResult" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
