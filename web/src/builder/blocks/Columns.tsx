import { Fragment, type CSSProperties } from 'react';
import { z } from 'zod';
import { defineBlock, slot, spacing, SPACING, type SpacingKey } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';
import classes from '@/builder/blocks/Columns.module.css';

type Props = {
  id: string; columns: '2' | '3' | '4'; stackBelow: 'sm' | 'md' | 'lg'; gap: SpacingKey;
  col1: ComponentData[]; col2: ComponentData[]; col3: ComponentData[]; col4: ComponentData[];
};
const STACK = { sm: classes.stackSm, md: classes.stackMd, lg: classes.stackLg } as const;

export const block = defineBlock<Props>({
  name: 'Columns', label: 'Columns', category: 'content', layouts: 'all', routeBound: false, slots: ['col1', 'col2', 'col3', 'col4'],
  schema: z.object({ columns: z.enum(['2', '3', '4']), stackBelow: z.enum(['sm', 'md', 'lg']), gap: spacing(), col1: slot(), col2: slot(), col3: slot(), col4: slot() }),
  defaultProps: { columns: '2', stackBelow: 'md', gap: 'md', col1: [], col2: [], col3: [], col4: [] },
  render: ({ columns, stackBelow, gap, col1, col2, col3, col4 }) => {
    const n = Number(columns);
    const style = { '--cols': columns, '--gap': SPACING[gap] } as CSSProperties;
    return (
      <div className={`${classes.grid} ${STACK[stackBelow]}`} style={style} data-sf-block="Columns">
        {/* Each visible column IS its slot container (className passed through): no extra wrapper. */}
        {[col1, col2, col3, col4].slice(0, n).map((col, i) => (
          <Fragment key={i}>{col({ className: classes.col })}</Fragment>
        ))}
      </div>
    );
  },
});
