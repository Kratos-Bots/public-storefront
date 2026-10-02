import type { AccessButton } from '@/app/access.ts';
import classes from '@/features/access/AccessButtons.module.css';

/**
 * The owner's way out of a dead end (spec: shop access): links to wherever they
 * take requests for access. Labels and links come from settings; the links are
 * already filtered to https:// by `accessOf`.
 */
export function AccessButtons({ buttons, ariaLabel }: { buttons: AccessButton[]; ariaLabel: string }) {
  if (buttons.length === 0) return null;
  return (
    <nav className={classes.root} aria-label={ariaLabel}>
      {buttons.map((button) => (
        <a
          key={`${button.url}|${button.label}`}
          className={classes.button}
          href={button.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {button.label}
        </a>
      ))}
    </nav>
  );
}
