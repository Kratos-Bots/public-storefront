import { lazy } from 'react';
import { useMatch, useParams } from 'react-router';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { useProduct } from '@/features/catalog/use-catalog.ts';

const Upsells = lazy(() => import('@/features/catalog/Upsells.tsx').then((m) => ({ default: m.Upsells })));

function UpsellsView({ productId }: { productId: number | null }) {
  const params = useParams();
  // A page route matches `*`, so read the product route's id from the path too.
  const match = useMatch('/p/:id');
  const raw = params.id ?? match?.params.id;
  const fromUrl = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null;
  const query = useProduct(productId ?? fromUrl);
  if (!query.data) return null;
  return <Upsells product={query.data} />;
}

/** "Goes with" rail for one product — the one in the URL unless a product is picked. Silent when nothing is curated. */
export const block = defineBlock<{ id: string; productId: number | null }>({
  name: 'Upsells', label: 'Goes with', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({ productId: z.number().int().positive().nullable() }), defaultProps: { productId: null },
  render: ({ productId }) => <UpsellsView productId={productId} />,
});
