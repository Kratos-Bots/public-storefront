import { useSettings } from '@/app/settings.ts';
import classes from '@/features/order-status/OrderStatus.module.css';

/** The shop's support links, as the cancel control's contact line shows them. Nothing when there are none. */
export function SupportLinks() {
  const { supportLinks } = useSettings();
  if (supportLinks.length === 0) return null;
  return (
    <ul className={classes.cancelLinks}>
      {supportLinks.map((link) => (
        <li key={link.url}>
          <a className={classes.cancelLink} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
        </li>
      ))}
    </ul>
  );
}
