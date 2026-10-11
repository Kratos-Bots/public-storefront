import { useSettings } from '@/app/settings.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

/** Whether the shop has an FAQ to show. An older backend sends no `faq`, which reads as none. */
export function faqAvailable(settings: Pick<StorefrontSettings, 'faq'> | undefined | null): boolean {
  return settings?.faq?.available === true;
}

export function useFaqAvailable(): boolean {
  return faqAvailable(useSettings());
}
