import type { CSSProperties } from 'react';
import { z } from 'zod';
import { useSettings } from '@/app/settings.ts';
import { defineBlock, slot, type SlotRender } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';
import { ShellFooter } from '@/layouts/ShellFooter.tsx';
import classes from '@/builder/blocks/Footer.module.css';

type Props = {
  id: string; variant: 'template' | 'columns'; columns: '1' | '2' | '3' | '4'; colophon: boolean;
  col1: ComponentData[]; col2: ComponentData[]; col3: ComponentData[]; col4: ComponentData[];
};

function ColumnsFooter({ columns, colophon, cols }: { columns: Props['columns']; colophon: boolean; cols: SlotRender[] }) {
  const { brand } = useSettings();
  const n = Number(columns);
  return (
    <footer className={classes.footer} data-sf-part="footer">
      <div className={`${classes.grid} ${colophon ? '' : classes.gridLast}`.trim()} style={{ '--cols': columns } as CSSProperties}>
        {cols.slice(0, n).map((col, i) => (
          <div key={i} className={classes.col}>{col()}</div>
        ))}
      </div>
      {colophon ? <p className={classes.colophon}>© {new Date().getFullYear()} {brand.name}</p> : null}
    </footer>
  );
}

/** template = the active template's Footer slot (the default); columns = owner-composed columns. */
export const block = defineBlock<Props>({
  name: 'Footer', label: 'Footer', category: 'shell', layouts: ['storefront', 'menu'], routeBound: false, slots: ['col1', 'col2', 'col3', 'col4'],
  schema: z.object({
    variant: z.enum(['template', 'columns']), columns: z.enum(['1', '2', '3', '4']), colophon: z.boolean(),
    col1: slot(), col2: slot(), col3: slot(), col4: slot(),
  }),
  defaultProps: { variant: 'template', columns: '3', colophon: true, col1: [], col2: [], col3: [], col4: [] },
  // The template variant renders no columns; the columns variant renders the first `columns` (default 3).
  visibleSlots: (p) => p.variant !== 'columns' ? []
    : ['col1', 'col2', 'col3', 'col4'].slice(0, ['1', '2', '3', '4'].includes(p.columns as string) ? Number(p.columns) : 3),
  render: ({ variant, columns, colophon, col1, col2, col3, col4 }) =>
    variant === 'template' ? <ShellFooter /> : <ColumnsFooter columns={columns} colophon={colophon} cols={[col1, col2, col3, col4]} />,
});
