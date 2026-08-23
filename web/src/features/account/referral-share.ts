import { withPrefilledText } from '@/lib/chat-links.ts';
import type { Brand } from '@/types/settings.ts';

export interface ReferralShareLinks {
  whatsapp: string | null;
  telegram: string | null;
}

/** The invite a customer sends on. Short enough to survive a forward, and the code is the point of it. */
export function referralShareText(code: string, brandName: string): string {
  return `Shopping with ${brandName}? Use my referral code ${code} on your first order.`;
}

/**
 * The invite, prefilled into the shop's own chat links. Tapping one opens
 * WhatsApp or Telegram on the shop with the message ready — the customer sends
 * or forwards it from there. A channel the shop hasn't set up has no link.
 */
export function referralShareLinks(code: string, brand: Brand): ReferralShareLinks {
  const text = referralShareText(code, brand.name);
  return {
    whatsapp: withPrefilledText(brand.links.whatsapp, text),
    telegram: withPrefilledText(brand.links.telegram, text),
  };
}
