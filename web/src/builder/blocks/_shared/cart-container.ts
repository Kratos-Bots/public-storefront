import { part, partId, type ContainerSpec } from '@/builder/parts.ts';
import type { ComponentData, LayoutKind } from '@/builder/types.ts';

const SUMMARY_PARTS = ['CartSummaryNotice', 'CartSummarySubtotal', 'CartSummaryTerms', 'CartSummaryCheckout', 'CartSummaryContinue'] as const;

/** The totals column: notice, subtotal, terms, checkout, keep shopping (stage 4 spec §5.2). */
export const CART_SUMMARY_CONTAINER: ContainerSpec = {
  family: 'cart-summary',
  insertSlot: 'items',
  required: ['CartSummarySubtotal', 'CartSummaryCheckout'],
  unique: SUMMARY_PARTS,
  defaultSlots: (_p: Record<string, unknown>, { id }: { layout: LayoutKind; id: string }): Record<string, ComponentData[]> => ({
    items: SUMMARY_PARTS.map((t) => part(t, id)),
  }),
};

/** The cart: heading, lines, empty state, and the nested summary (stage 4 spec §5.2). */
export const CART_CONTAINER: ContainerSpec = {
  family: 'cart',
  insertSlot: 'main',
  required: ['CartHeading', 'CartLines', 'CartEmpty'],
  unique: ['CartHeading', 'CartLines', 'CartEmpty'],
  nests: ['CartSummary'],
  // `head` never renders in the drawer and `summary` never on an empty cart, so a required part there would vanish.
  slotRejects: { head: ['CartLines', 'CartEmpty', 'CartSummary'], main: ['CartSummary'], summary: ['CartLines', 'CartEmpty'] },
  defaultSlots: (_p: Record<string, unknown>, { id }: { layout: LayoutKind; id: string }): Record<string, ComponentData[]> => {
    const summaryId = partId(id, 'summary');
    return {
      head: [part('CartHeading', id)],
      main: [part('CartEmpty', id), part('CartLines', id)],
      summary: [{ type: 'CartSummary', props: { id: summaryId, ...CART_SUMMARY_CONTAINER.defaultSlots({}, { layout: 'storefront', id: summaryId }) } }],
    };
  },
};
