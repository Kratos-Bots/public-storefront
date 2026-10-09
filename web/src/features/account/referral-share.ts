import { withPrefilledText } from '@/lib/chat-links.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { textSnapshot } from '@/text/snapshot.ts';
import type { Brand } from '@/types/settings.ts';

export interface ReferralShareLinks {
  whatsapp: string | null;
  telegram: string | null;
}

/**
 * The shopper's shareable address on this shop, or `null` where links are not offered: inside the
 * Telegram Mini App the bot's own deep link carries referrals, so only the code is shared there.
 */
export function referralLink(code: string, win: Window = window): string | null {
  if (!code || isTelegramWebApp()) return null;
  return `${win.location.origin}/ref/${encodeURIComponent(code)}`;
}

/**
 * The invite a customer sends on. Short enough to survive a forward, and the code is the point of it.
 * With a link, the address goes on its own line after the (owner-editable) text, so a shop that has
 * rewritten the wording still shares the link.
 */
export function referralShareText(code: string, brandName: string, link: string | null = null): string {
  const text = textSnapshot().t('account.referrals.shareText', { shop: brandName, code });
  return link ? `${text}\n${link}` : text;
}

/**
 * The invite, prefilled into the shop's own chat links. Tapping one opens
 * WhatsApp or Telegram on the shop with the message ready — the customer sends
 * or forwards it from there. A channel the shop hasn't set up has no link.
 */
export function referralShareLinks(code: string, brand: Brand, link: string | null = null): ReferralShareLinks {
  const text = referralShareText(code, brand.name, link);
  return {
    whatsapp: withPrefilledText(brand.links.whatsapp, text),
    telegram: withPrefilledText(brand.links.telegram, text),
  };
}
