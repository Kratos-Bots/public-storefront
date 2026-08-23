import { EmptyState } from '@/components/EmptyState.tsx';

/**
 * Stands in for the dense menu list until that layout lands. Kept as its own file
 * so switching it on is a one-line import change in `CatalogPage`.
 */
export function MenuCatalogPlaceholder() {
  return (
    <EmptyState
      eyebrow="Menu layout"
      title="The list view is being built"
      description="This shop is set to the compact menu layout, which isn't ready yet."
    />
  );
}
