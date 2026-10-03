import type { AccessButton } from '@/app/access.ts';
import { TelegramIcon, WhatsAppIcon } from '@/components/icons.tsx';
import classes from '@/features/access/AccessButtons.module.css';

/** The chat app a link opens, told from its host, so a contact link can carry that app's mark. */
function markFor(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 't.me' || host.endsWith('.t.me') || host.endsWith('telegram.me') || host.endsWith('telegram.org')) return TelegramIcon;
    if (host === 'wa.me' || host.endsWith('whatsapp.com')) return WhatsAppIcon;
  } catch {
    // An unparseable link simply gets no mark.
  }
  return null;
}

/**
 * The owner's way out of a dead end (spec: shop access): links to wherever they
 * take requests for access. Labels and links come from settings; the links are
 * already filtered to https:// by `accessOf`. `inline` is the compact form for
 * the sign-in column: plain links in a row, each with its chat app's mark.
 */
export function AccessButtons({ buttons, ariaLabel, inline = false }: { buttons: AccessButton[]; ariaLabel: string; inline?: boolean }) {
  if (buttons.length === 0) return null;
  return (
    <nav className={inline ? classes.inlineRoot : classes.root} aria-label={ariaLabel}>
      {buttons.map((button) => {
        const Mark = inline ? markFor(button.url) : null;
        return (
          <a
            key={`${button.url}|${button.label}`}
            className={inline ? classes.inlineLink : classes.button}
            href={button.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {Mark ? <Mark size={18} /> : null}
            {button.label}
          </a>
        );
      })}
    </nav>
  );
}
