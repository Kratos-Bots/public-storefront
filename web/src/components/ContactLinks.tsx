import { useSettings } from '@/app/settings.ts';
import { withPrefilledText } from '@/lib/chat-links.ts';
import { TelegramIcon, WhatsAppIcon } from '@/components/icons.tsx';
import { useText } from '@/text/runtime.tsx';
import type { StyleAttrs } from '@/builder/define.ts';
import type { StyleAttrs } from '@/builder/define.ts';
import classes from '@/components/ContactLinks.module.css';

export interface ContactLinksProps {
  /** Message to open the chat with, e.g. an order reference. */
  prefill?: string;
  /** `inline` = hairline chips in a footer; `strip` = the menu shell's sticky bottom bar. */
  variant?: 'inline' | 'strip';
  /** Block-styling attributes for the `strip` variant's sticky bar (no wrapper may sit around it). */
  styleAttrs?: StyleAttrs;
}

/** WhatsApp / Telegram links from the client's brand settings. Renders nothing when neither is configured. */
export function ContactLinks({ prefill, variant = 'inline', styleAttrs }: ContactLinksProps) {
  const { brand } = useSettings();
  const { t } = useText();
  const resolve = (link: string | null) => (prefill ? withPrefilledText(link, prefill) : link);

  const links = [
    { key: 'whatsapp', label: t('common.contact.whatsapp'), href: resolve(brand.links.whatsapp), Icon: WhatsAppIcon },
    { key: 'telegram', label: t('common.contact.telegram'), href: resolve(brand.links.telegram), Icon: TelegramIcon },
  ].filter((l): l is { key: string; label: string; href: string; Icon: typeof WhatsAppIcon } => !!l.href);

  if (links.length === 0) return null;

  const items = links.map(({ key, label, href, Icon }) => (
    <a key={key} className={classes.link} href={href} target="_blank" rel="noopener noreferrer">
      <Icon size={14} />
      <span className={classes.label}>{label}</span>
    </a>
  ));

  if (variant === 'strip') {
    return (
      <div className={classes.stripBar} {...styleAttrs}>
        <div className={classes.strip}>{items}</div>
      </div>
    );
  }

  return <div className={classes.inline}>{items}</div>;
}
