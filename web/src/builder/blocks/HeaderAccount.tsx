import { z } from 'zod';
import { defineBlock, override, type Override } from '@/builder/define.ts';
import { HeaderFamily } from '@/builder/family-header.ts';
import { BAR } from '@/builder/blocks/_shared/header-container.ts';
import { styleSupport, VIS } from '@/builder/style/model.ts';

/** The account or sign-in link. */
export const block = defineBlock<{ id: string; icon: Override }>({
  name: 'HeaderAccount', label: 'Account', category: 'part', part: { family: 'header' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BAR, ...VIS]),
  text: ['common.nav.yourAccount', 'common.actions.signIn'],
  schema: z.object({ icon: override() }), defaultProps: { icon: 'inherit' },
  render: (p) => <HeaderFamily.PartHost name="HeaderAccount" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
