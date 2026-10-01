import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { TRACKING_CONTAINER } from '@/builder/blocks/_shared/tracking-container.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

const TrackingPage = lazy(() => import('@/features/tracking/TrackingPage.tsx').then((m) => ({ default: m.TrackingPage })));

type Props = { id: string; top: ComponentData[]; main: ComponentData[]; result: ComponentData[] };

/** The lookup form, or a tracked order when the URL carries a reference: a container of tracking parts (spec §5.7). */
export const block = defineBlock<Props>({
  name: 'TrackingLookup', label: 'Order tracking', category: 'post-order', layouts: 'all', routeBound: true, slots: ['top', 'main', 'result'],
  style: styleSupport('wrap', [...BOX]),
  text: ['tracking.states.disabledEyebrow', 'tracking.states.disabledTitle', 'tracking.states.disabledBody', 'tracking.states.offHead', 'tracking.states.offBody'],
  container: TRACKING_CONTAINER,
  schema: z.object({ top: slot(), main: slot(), result: slot() }),
  defaultProps: { top: [], main: [], result: [] },
  render: ({ top, main, result }) => <TrackingPage slots={{ top, main, result }} />,
});
