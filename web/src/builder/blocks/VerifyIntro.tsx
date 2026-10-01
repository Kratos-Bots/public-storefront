import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { VerifyFamily } from '@/builder/family-verify.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The masthead: eyebrow, title and lead. */
export const block = defineBlock<{ id: string }>({
  name: 'VerifyIntro', label: 'Verify heading', category: 'part', part: { family: 'verify' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['verify.page.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <VerifyFamily.PartHost name="VerifyIntro" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
