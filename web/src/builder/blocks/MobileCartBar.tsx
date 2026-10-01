import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { MobileCartBar } from '@/features/cart/MobileCartBar.tsx';

/**
 * The running cart tab on phones. Optional in the document: when a shell has none,
 * PuckShell mounts it anyway (spec §5.4) so checkout is always reachable.
 */
export const block = defineBlock<{ id: string }>({
  name: 'MobileCartBar', label: 'Phone cart bar', category: 'shell', layouts: ['storefront', 'menu'], routeBound: false, slots: [],
  style: false, // Fixed-position, and the phone checkout path: never wrapped, never hidden.
  text: ['cart.bar.*', 'cart.summary.items', 'cart.summary.checkout'],
  schema: z.object({}), defaultProps: {},
  render: () => <MobileCartBar />,
});
