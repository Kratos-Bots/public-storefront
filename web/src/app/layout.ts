import { useSettings } from '@/app/settings.ts';
import { isBuilderMode, useBuilderLayout } from '@/app/builder-gate.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import type { LayoutKind } from '@/types/settings.ts';

/**
 * The layout actually on screen. The page builder's layout (the one being edited) wins over
 * everything; inside Telegram it is always the web app, whatever the store picked for
 * browsers — the store's choice only decides what an ordinary browser gets (and choosing
 * `webapp` there is how a store makes the web app its default everywhere).
 */
export function effectiveLayout(chosen: LayoutKind | undefined, inTelegram: boolean, override: LayoutKind | null = null): LayoutKind {
  if (override) return override;
  if (inTelegram) return 'webapp';
  return chosen ?? 'storefront';
}

export function useEffectiveLayout(): LayoutKind {
  const { features } = useSettings();
  const builderLayout = useBuilderLayout();
  // Only the builder frame may take the builder's layout — whatever the overrides store holds.
  const override = isBuilderMode() ? builderLayout : null;
  return effectiveLayout(features?.layout, isTelegramWebApp(), override);
}
