import { useMemo } from 'react';
import { useSettings } from '@/app/settings.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { buildCategoryTree } from '@/features/catalog/category-tree.ts';
import { categoryCounts } from '@/features/catalog/filter.ts';
import { BASE_TOKENS, type OptionValues, type Scheme, type TemplateTokens } from '@/templates/define.ts';
import { useTemplateContext } from '@/templates/runtime.tsx';
import type { Brand, Features, SupportLink } from '@/types/settings.ts';

export interface TemplateInfo { id: string; presetId: string; scheme: Scheme; options: OptionValues; tokens: TemplateTokens }
export function useTemplate(): TemplateInfo {
  const { resolved } = useTemplateContext();
  const settings = useSettings();
  return {
    id: resolved?.templateId ?? 'modern',
    presetId: resolved?.presetId ?? 'default',
    scheme: resolved?.scheme ?? settings.theme?.scheme ?? 'dark',
    options: resolved?.options ?? {},
    tokens: resolved?.tokens ?? BASE_TOKENS,
  };
}

export function useTemplateOptions(): OptionValues {
  return useTemplateContext().resolved?.options ?? {};
}

export interface CoreOptions { showPageTitle: boolean; showCatalogIntro: boolean; showSectionLabels: boolean }
/** The core options every template carries (define.ts CORE_OPTIONS). Only an explicit false hides —
 *  outside a provider, or before settings resolve, everything shows. */
export function useCoreOptions(): CoreOptions {
  const o = useTemplateOptions();
  return { showPageTitle: o.showPageTitle !== false, showCatalogIntro: o.showCatalogIntro !== false, showSectionLabels: o.showSectionLabels !== false };
}

export interface StorefrontInfo { brand: Brand; features: Features; supportLinks: SupportLink[]; welcomeMessage: string | null; currency: string; enabled: boolean }
export function useStorefront(): StorefrontInfo {
  const s = useSettings();
  return { brand: s.brand, features: s.features, supportLinks: s.supportLinks, welcomeMessage: s.welcomeMessage, currency: s.currency, enabled: s.enabled };
}

export interface CatalogStats { productCount: number | null; categoryCount: number | null }
/** Same counts the catalogue hero shows; null while the catalogue is loading. */
export function useCatalogStats(): CatalogStats {
  const catalog = useCatalog();
  return useMemo(() => {
    const d = catalog.data;
    if (!d) return { productCount: null, categoryCount: null };
    return { productCount: d.products.length, categoryCount: buildCategoryTree(d.categories, categoryCounts(d.products)).length };
  }, [catalog.data]);
}

export interface OrderingState { enabled: boolean; ordering: boolean; accepting: boolean }
export function useOrderingState(): OrderingState {
  const s = useSettings();
  return { enabled: s.enabled, ordering: s.features.ordering, accepting: s.enabled && s.features.ordering };
}

function safeZone(timeZone: string): string {
  try { new Intl.DateTimeFormat('en-GB', { timeZone }); return timeZone; } catch { return 'UTC'; }
}

/** 'HH:MM:SS', 24-hour, in `timeZone` (an invalid zone reads as UTC). */
export function formatClock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: safeZone(timeZone), hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
}

/** 'UTC+1', 'UTC-4', 'UTC+5:30', 'UTC+0'. */
export function utcOffsetLabel(date: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: safeZone(timeZone), timeZoneName: 'shortOffset' })
    .formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const offset = part.replace(/^GMT/, '');
  return `UTC${offset === '' ? '+0' : offset}`;
}
