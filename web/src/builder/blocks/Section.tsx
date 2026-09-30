import type { CSSProperties } from 'react';
import { z } from 'zod';
import { defineBlock, paletteToken, slot, spacing, SPACING, tokenVar, type PaletteToken, type SpacingKey } from '@/builder/define.ts';
import type { ComponentData } from '@/builder/types.ts';
import classes from '@/builder/blocks/Section.module.css';

type Props = { id: string; padding: SpacingKey; backgroundToken: PaletteToken; textToken: PaletteToken; width: 'rail' | 'full'; content: ComponentData[] };

/**
 * A band: palette-token colours, a padding step, rail or full bleed. It renders its own
 * <section> (it needs `data-sf-block`, which a slot wrapper cannot carry — A7 slot renders
 * take only className/style/as), and calls the slot with no wrapper inside it.
 */
export const block = defineBlock<Props>({
  name: 'Section', label: 'Section', category: 'content', layouts: 'all', routeBound: false, slots: ['content'],
  schema: z.object({ padding: spacing(), backgroundToken: paletteToken(), textToken: paletteToken(), width: z.enum(['rail', 'full']), content: slot() }),
  defaultProps: { padding: 'lg', backgroundToken: 'none', textToken: 'none', width: 'rail', content: [] },
  render: ({ padding, backgroundToken, textToken, width, content }) => (
    <section
      className={`${classes.section} ${classes[width]} ${backgroundToken === 'none' ? '' : classes.filled}`.trim()}
      style={{
        '--section-pad': SPACING[padding],
        '--section-bg': tokenVar(backgroundToken) ?? 'transparent',
        '--section-fg': tokenVar(textToken) ?? 'inherit',
      } as CSSProperties}
      data-sf-block="Section"
    >
      {content()}
    </section>
  ),
});
