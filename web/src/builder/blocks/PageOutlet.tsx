import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { StorefrontMain } from '@/layouts/StorefrontShell.tsx';
import { MenuMain } from '@/layouts/MenuShell.tsx';
import { WebAppMain } from '@/layouts/WebAppShell.tsx';

/** Where the routed page renders (the shell's <main>). Exactly one per shell document. */
export const block = defineBlock<{ id: string }>({
  name: 'PageOutlet', label: 'Page content', category: 'shell', layouts: 'all', routeBound: true, slots: [],
  style: false, // It is the page: hiding it hides every route; padding doubles <main>'s.
  schema: z.object({}), defaultProps: {},
  render: ({ puck }) => (puck.layout === 'storefront' ? <StorefrontMain /> : puck.layout === 'menu' ? <MenuMain /> : <WebAppMain />),
});
