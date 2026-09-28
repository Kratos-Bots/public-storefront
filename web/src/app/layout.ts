import { useSettings } from '@/app/settings.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import type { LayoutKind } from '@/types/settings.ts';

/**
 * The layout actually on screen. Inside Telegram it is always the web app,
 * whatever the store picked for browsers — the store's choice only decides what
 * an ordinary browser gets (and choosing `webapp` there is how a store makes
 * the web app its default everywhere).
 */
export function effectiveLayout(chosen: LayoutKind | undefined, inTelegram: boolean): LayoutKind {
  if (inTelegram) return 'webapp';
  return chosen ?? 'storefront';
}

export function useEffectiveLayout(): LayoutKind {
  const { features } = useSettings();
  return effectiveLayout(features?.layout, isTelegramWebApp());
}
