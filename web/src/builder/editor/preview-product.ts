import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { FIXTURE_PRODUCT } from '@/builder/editor/fixtures.ts';
import type { Product } from '@/types/catalog.ts';

/** Spec §11 "Preview with": the chosen product, else the first with a photo, else the first, else the sample. */
export function pickPreviewProduct(products: readonly Product[], chosen: number | null): Product {
  return (chosen !== null ? products.find((p) => p.id === chosen) : undefined)
    ?? products.find((p) => p.imageProductId !== null) ?? products[0] ?? FIXTURE_PRODUCT;
}

/** The product the product page, the sheet canvas and the card designer show. */
export function usePreviewProduct(): Product {
  const chosen = useEditorStore((s) => s.previewProductId);
  const { data } = useCatalog();
  return pickPreviewProduct(data?.products ?? [], chosen);
}
