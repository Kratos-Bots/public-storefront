import { z } from 'zod';
import { defineBlock, routeLink } from '@/builder/define.ts';
import { SmartLink } from '@/builder/blocks/_shared/SmartLink.tsx';
import { useText } from '@/text/runtime.tsx';
import classes from '@/builder/blocks/NavLinks.module.css';

type Item = { label: string; href: string };
type Props = { id: string; items: Item[]; ariaLabel: string; direction: 'row' | 'column' };

/** A block's render must not call hooks, so the site-text fallback for an empty label lives here (spec §6.4). */
function NavLinksView({ links, ariaLabel, direction }: { links: Item[]; ariaLabel: string; direction: Props['direction'] }) {
  const { t } = useText();
  return (
    <nav className={`${classes.nav} ${classes[direction]}`} aria-label={ariaLabel.trim() || t('shell.nav.ariaLabel')} data-sf-block="NavLinks">
      <ul className={classes.list}>
        {links.map((l, i) => (
          <li key={i}>
            <SmartLink href={l.href} className={classes.link}>{l.label}</SmartLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** A list of links: a row for the Header's nav slot (scrolls sideways), a column for a footer column. Custom pages link as /pages/<slug>. */
export const block = defineBlock<Props>({
  name: 'NavLinks', label: 'Links', category: 'shell', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({
    items: z.array(z.object({ label: z.string().min(1).max(40), href: routeLink() })).max(12),
    ariaLabel: z.string().max(40),
    direction: z.enum(['row', 'column']),
  }),
  defaultProps: { items: [{ label: 'Shop', href: '/' }], ariaLabel: '', direction: 'row' },
  textProps: { ariaLabel: 'shell.nav.ariaLabel' },
  render: ({ items, ariaLabel, direction }) => {
    const links = items.filter((l) => l.href && l.label.trim());
    if (links.length === 0) return null;
    return <NavLinksView links={links} ariaLabel={ariaLabel} direction={direction} />;
  },
});
