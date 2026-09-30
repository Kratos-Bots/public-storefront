import { z } from 'zod';
import { defineBlock, richtext } from '@/builder/define.ts';
import { RichHtml } from '@/builder/blocks/_shared/RichHtml.tsx';
import { BOX, styleSupport, TEXT, VIS } from '@/builder/style/model.ts';
import classes from '@/builder/blocks/RichText.module.css';

type Props = { id: string; bodyHtml: string; width: 'narrow' | 'full' };

export const block = defineBlock<Props>({
  name: 'RichText', label: 'Text', category: 'content', layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS], ['maxWidth']),
  schema: z.object({ bodyHtml: richtext(), width: z.enum(['narrow', 'full']) }),
  defaultProps: { bodyHtml: '<p>Tell shoppers something worth knowing.</p>', width: 'narrow' },
  // Richtext may arrive as a React node inside the editor; only an empty string renders nothing.
  render: ({ bodyHtml, width, puck }) => (typeof bodyHtml === 'string' && !bodyHtml.trim()) ? null : (
    <RichHtml value={bodyHtml} block="RichText" className={width === 'narrow' ? `${classes.prose} ${classes.narrow}` : classes.prose} attrs={puck.style} />
  ),
});
