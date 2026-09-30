import type { ReactNode } from 'react';
import type { AnyBlock, BlockRenderContext, StyleAttrs } from '@/builder/define.ts';
import { isStyleValue, STYLE_ATTR, STYLE_KEY_ORDER } from '@/builder/style/model.ts';

/**
 * Block-styling spec §5.1. null when nothing applies — the caller must then add nothing at all.
 * `style` is untrusted (the editor canvas hands props the guard never saw), so the block's
 * allowlist and each value are re-checked here. `hide` is a ghost on the editor canvas.
 */
export function styleAttrs(def: AnyBlock, style: unknown, editing: boolean): StyleAttrs | null {
  const support = def.style;
  if (!support || typeof style !== 'object' || style === null || Array.isArray(style)) return null;
  const src = style as Record<string, unknown>;
  const out: Record<string, string> = {};
  let marked = false;
  for (const key of STYLE_KEY_ORDER) {
    if (!support.keys.includes(key) || !Object.hasOwn(src, key) || !isStyleValue(key, src[key])) continue;
    if (!marked) {
      out['data-sf-style'] = def.name;
      marked = true;
    }
    out[`data-sfs-${key === 'hide' && editing ? 'ghost' : STYLE_ATTR[key]}`] = src[key] as string;
  }
  return marked ? (out as StyleAttrs) : null;
}

/** The only caller of `def.render` (shop, exact preview and editor canvas), so the three never disagree. */
export function renderBlock(def: AnyBlock, props: Record<string, unknown>, ctx: BlockRenderContext): ReactNode {
  const attrs = styleAttrs(def, props.blockStyle, ctx.editing);
  let rest = props;
  if (Object.hasOwn(props, 'blockStyle')) {
    rest = { ...props };
    delete rest.blockStyle;
  }
  if (attrs === null || !def.style) return def.render({ ...rest, puck: ctx } as never);
  if (def.style.target === 'wrap') return <div {...attrs}>{def.render({ ...rest, puck: ctx } as never)}</div>;
  return def.render({ ...rest, puck: { ...ctx, style: attrs } } as never);
}
