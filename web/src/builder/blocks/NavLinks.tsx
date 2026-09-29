import { z } from 'zod';
import { defineBlock, routeLink } from '@/builder/define.ts';
import { SmartLink } from '@/builder/blocks/_shared/SmartLink.tsx';
import classes from '@/builder/blocks/NavLinks.module.css';

type Item = { label: string; href: string };
type Props = { id: string; items: Item[]; ariaLabel: string; direction: 'row' | 'column' };

/** A list of links: a row for the Header's nav slot (scrolls sideways), a column for a footer column. Custom pages link as /pages/<slug>. */
export const block = defineBlock<Props>({
  name: 'NavLinks', label: 'Links', category: 'shell', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({
    items: z.array(z.object({ label: z.string().min(1).max(40), href: routeLink() })).max(12),
    ariaLabel: z.string().min(1).max(40),
    direction: z.enum(['row', 'column']),
  }),
  defaultProps: { items: [{ label: 'Shop', href: '/' }], ariaLabel: 'Site', direction: 'row' },
  render: ({ items, ariaLabel, direction }) => (
    <nav className={`${classes.nav} ${classes[direction]}`} aria-label={ariaLabel} data-sf-block="NavLinks">
      <ul className={classes.list}>
        {items.filter((l) => l.href).map((l, i) => (
          <li key={i}>
            <SmartLink href={l.href} className={classes.link}>{l.label}</SmartLink>
          </li>
        ))}
      </ul>
    </nav>
  ),
});
