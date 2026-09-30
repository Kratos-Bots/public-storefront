import { lazy } from 'react';
import { useMatch } from 'react-router';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { PRODUCT_CARD_TEXT } from '@/builder/blocks/_shared/text-patterns.ts';
import { useProduct } from '@/features/catalog/use-catalog.ts';

const Upsells = lazy(() => import('@/features/catalog/Upsells.tsx').then((m) => ({ default: m.Upsells })));

function UpsellsView({ productId }: { productId: number | null }) {
  // Matched on the path itself: a page route is `*`, so route params carry no product id.
  const raw = useMatch('/p/:id')?.params.id;
  const fromUrl = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null;
  const query = useProduct(productId ?? fromUrl);
  if (!query.data) return null;
  return <Upsells product={query.data} />;
}

/** "Goes with" rail for one product — the one in the URL unless a product is picked. Silent when nothing is curated. */
export const block = defineBlock<{ id: string; productId: number | null }>({
  name: 'Upsells', label: 'Goes with', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  text: ['product.upsells.*', ...PRODUCT_CARD_TEXT],
  schema: z.object({ productId: z.number().int().positive().nullable() }), defaultProps: { productId: null },
  render: ({ productId }) => <UpsellsView productId={productId} />,
});
