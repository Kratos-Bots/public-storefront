import type { QueryClient } from '@tanstack/react-query';
import type { ExternalField } from '@puckeditor/core';
import { fetchCatalog } from '@/api/catalog.ts';
import { catalogAudience, catalogKey } from '@/features/catalog/use-catalog.ts';
import { useSessionStore } from '@/stores/session.ts';
import type { Catalog, Category, Product } from '@/types/catalog.ts';

let client: QueryClient | null = null;
/** Set by the editor session so pickers read the same cached public catalogue as the canvas. */
export function configureCatalogSource(next: QueryClient | null): void {
  client = next;
}

const MAX_ROWS = 100;
/** The same entry `useCatalog` uses for the current (possibly fixture) session, so canvas and pickers share one fetch. */
const currentAudience = (): number | null => catalogAudience(useSessionStore.getState());
const cached = (): Catalog | undefined => client?.getQueryData<Catalog>(catalogKey(currentAudience()));
async function load(): Promise<Catalog | null> {
  if (!client) return null;
  const audience = currentAudience();
  return client.fetchQuery({ queryKey: catalogKey(audience), queryFn: () => fetchCatalog(audience !== null), staleTime: 60_000 });
}
const has = (q: string, ...texts: Array<string | null>) => texts.some((t) => !!t && t.toLowerCase().includes(q));

export function productPickerField(label: string): ExternalField<number> {
  return {
    type: 'external',
    label,
    placeholder: 'Choose a product',
    showSearch: true,
    fetchList: async ({ query }) => {
      const q = query.trim().toLowerCase();
      return ((await load())?.products ?? []).filter((p) => p.isActive && (!q || has(q, p.displayName, p.sku))).slice(0, MAX_ROWS);
    },
    mapRow: (p: Product) => ({ Name: p.displayName, SKU: p.sku, Category: p.categoryName ?? '—' }),
    mapProp: (p: Product) => p.id,
    getItemSummary: (id: number) => cached()?.products.find((p) => p.id === id)?.displayName ?? `Product #${id}`,
  };
}

export function categoryPickerField(label: string): ExternalField<number> {
  return {
    type: 'external',
    label,
    placeholder: 'Choose a category',
    showSearch: true,
    fetchList: async ({ query }) => {
      const q = query.trim().toLowerCase();
      return ((await load())?.categories ?? []).filter((c) => !q || has(q, c.name, c.slug)).slice(0, MAX_ROWS);
    },
    mapRow: (c: Category) => ({ Name: `${c.emoji ? `${c.emoji} ` : ''}${c.name}`, Address: c.slug ? `/c/${c.slug}` : '—' }),
    mapProp: (c: Category) => c.id,
    getItemSummary: (id: number) => cached()?.categories.find((c) => c.id === id)?.name ?? `Category #${id}`,
  };
}
