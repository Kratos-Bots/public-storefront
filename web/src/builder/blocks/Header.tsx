import { z } from 'zod';
import { defineBlock, override, slot, type Override } from '@/builder/define.ts';
import { TOP_BAR_TEXT } from '@/builder/blocks/_shared/text-patterns.ts';
import { HEADER_CONTAINER, resolveVariant } from '@/builder/blocks/_shared/header-container.ts';
import type { ComponentData } from '@/builder/types.ts';
import { HeaderBar } from '@/layouts/header-parts.tsx';
import { styleSupport, VIS } from '@/builder/style/model.ts';

type Variant = 'auto' | 'storefront' | 'menu' | 'webapp';
type Props = {
  id: string; variant: Variant; topBar: boolean; sticky: boolean;
  start: ComponentData[]; nav: ComponentData[]; middle: ComponentData[]; end: ComponentData[];
  /**
   * Legacy (v0.7.0) options: read only while the slots are absent (stage-4 spec §8). Optional with
   * no default, so the guard never adds them to a document that lacks them.
   */
  search?: boolean; accountIcon?: Override; cartIcon?: Override;
};

/**
 * The layout's header bar, a container of header parts (start / nav / middle / end). `auto` follows
 * the layout; the Telegram-shaped `webapp` variant only exists inside the web app. At most one per
 * shell (rules.ts): two would each publish the pinned notice stack's height. With `sticky` off the
 * shell zeroes `--sf-bar-h`/`--sf-pin-h` (its CSS).
 */
export const block = defineBlock<Props>({
  name: 'Header', label: 'Header', category: 'shell', layouts: 'all', routeBound: false, slots: ['start', 'nav', 'middle', 'end'],
  // `pass`: a wrapper would end `position: sticky`; padding/border would change `--sf-bar-h`.
  style: styleSupport('pass', ['bg', 'shadow', ...VIS]),
  text: [...TOP_BAR_TEXT],
  container: HEADER_CONTAINER,
  schema: z.object({
    variant: z.enum(['auto', 'storefront', 'menu', 'webapp']),
    topBar: z.boolean(), sticky: z.boolean(),
    start: slot(), nav: slot(), middle: slot(), end: slot(),
    search: z.boolean().optional(), accountIcon: override().optional(), cartIcon: override().optional(),
  }),
  defaultProps: { variant: 'auto', topBar: true, sticky: true, start: [], nav: [], middle: [], end: [] },
  render: ({ variant, topBar, sticky, start, nav, middle, end, puck }) => (
    <HeaderBar variant={resolveVariant(variant, puck.layout)} topBar={topBar} sticky={sticky} slots={{ start, nav, middle, end }} styleAttrs={puck.style} />
  ),
});
