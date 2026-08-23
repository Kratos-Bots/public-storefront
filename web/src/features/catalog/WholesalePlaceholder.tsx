import { EmptyState } from '@/components/EmptyState.tsx';

/**
 * Stands in for the wholesale catalogue until that feature lands. Kept as its own
 * file so switching it on is a one-line import change in `CatalogPage`.
 */
export function WholesalePlaceholder() {
  return (
    <EmptyState
      eyebrow="Wholesale"
      title="The wholesale list is on its way"
      description="Trade pricing isn't published here yet. Message us and we'll send the current sheet."
    />
  );
}
