import { z } from 'zod';
import { compactScope, defineBlock, iconOverride, override, slot, type Override } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';
import { CoreOptionsScope } from '@/builder/blocks/_shared/CoreOptionsScope.tsx';
import { StorefrontHeader } from '@/layouts/StorefrontShell.tsx';
import { MenuHeader } from '@/layouts/MenuShell.tsx';
import { WebAppHeader } from '@/layouts/WebAppShell.tsx';

type Variant = 'auto' | 'storefront' | 'menu' | 'webapp';
type Props = {
  id: string; variant: Variant; topBar: boolean; search: boolean; sticky: boolean;
  accountIcon: Override; cartIcon: Override; nav: ComponentData[];
};

/**
 * The layout's header bar. `auto` follows the layout; the Telegram-shaped `webapp` variant only
 * exists inside the web app. At most one per shell (rules.ts): two would each publish the pinned
 * notice stack's height. With `sticky` off the shell zeroes `--sf-bar-h`/`--sf-pin-h` (its CSS).
 */
export const block = defineBlock<Props>({
  name: 'Header', label: 'Header', category: 'shell', layouts: 'all', routeBound: false, slots: ['nav'],
  schema: z.object({
    variant: z.enum(['auto', 'storefront', 'menu', 'webapp']),
    topBar: z.boolean(), search: z.boolean(), sticky: z.boolean(),
    accountIcon: override(), cartIcon: override(), nav: slot(),
  }),
  defaultProps: { variant: 'auto', topBar: true, search: true, sticky: true, accountIcon: 'inherit', cartIcon: 'inherit', nav: [] },
  render: ({ variant, topBar, search, sticky, accountIcon, cartIcon, nav, puck }) => {
    const v = variant === 'auto' ? puck.layout : variant === 'webapp' && puck.layout !== 'webapp' ? 'menu' : variant;
    const scope = compactScope({ headerAccountIcon: iconOverride(accountIcon), headerCartIcon: iconOverride(cartIcon) });
    const navNode = nav();
    return (
      <CoreOptionsScope value={scope}>
        {v === 'storefront' ? (
          <StorefrontHeader topBar={topBar} search={search} sticky={sticky} nav={navNode} />
        ) : v === 'menu' ? (
          <MenuHeader topBar={topBar} search={search} sticky={sticky} nav={navNode} />
        ) : (
          <WebAppHeader search={search} sticky={sticky} nav={navNode} />
        )}
      </CoreOptionsScope>
    );
  },
});
