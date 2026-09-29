import type { CSSProperties } from 'react';
import { z } from 'zod';
import { defineBlock, spacing, SPACING, tokenVar, type SpacingKey } from '@/builder/define.ts';
import classes from '@/builder/blocks/Divider.module.css';

type Props = { id: string; spacing: SpacingKey; toneToken: 'line' | 'line-strong' };

export const block = defineBlock<Props>({
  name: 'Divider', label: 'Divider', category: 'content', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ spacing: spacing(), toneToken: z.enum(['line', 'line-strong']) }),
  defaultProps: { spacing: 'md', toneToken: 'line' },
  render: ({ spacing: space, toneToken }) => (
    <hr className={classes.rule} data-sf-block="Divider" style={{ '--rule-space': SPACING[space], '--rule-color': tokenVar(toneToken) } as CSSProperties} />
  ),
});
