import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

const TrackingPage = lazy(() => import('@/features/tracking/TrackingPage.tsx').then((m) => ({ default: m.TrackingPage })));

/** The lookup form, or a tracked order when the URL carries a reference. */
export const block = defineBlock<{ id: string }>({
  name: 'TrackingLookup', label: 'Order tracking', category: 'post-order', layouts: 'all', routeBound: true, slots: [],
  style: styleSupport('wrap', [...BOX]),
  text: ['tracking.*', 'order.status.*', 'common.shipment.*', 'common.dates.*', 'common.product.*', 'common.status.*', 'common.actions.*'],
  schema: z.object({}), defaultProps: {},
  render: () => <TrackingPage />,
});
