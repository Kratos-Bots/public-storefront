import { createElement, Fragment, type ReactNode } from 'react';
import { validateDoc } from '@/builder/guard.ts';
import { blockDef } from '@/builder/rules.ts';
import { renderBlock } from '@/builder/style/apply.tsx';
import { CardRowFamily, CardTileFamily, type CardData } from '@/builder/families.ts';
import { fixedSlot, type FamilyValue } from '@/builder/parts.ts';
import type { BlockRenderContext } from '@/builder/define.ts';
import { cardKey, isRecord, type CardKind, type ComponentData, type LayoutKind } from '@/builder/types.ts';

export interface CardDesign {
  kind: CardKind;
  /** The compiled tree: the same element objects for every card (spec §6.3). */
  element: ReactNode;
  /** One card: its own context provider around the shared elements. `views` come from the caller's chunk. */
  render(data: CardData, views: FamilyValue<CardData>['views']): ReactNode;
}

const memo = new WeakMap<object, Map<LayoutKind, CardDesign | null>>();

/** Block renders are pure (the contract forbids hooks), so calling them once here is safe. */
function build(items: readonly ComponentData[], ctx: BlockRenderContext): ReactNode[] {
  const out: ReactNode[] = [];
  for (const [i, item] of items.entries()) {
    // The guard has already cleaned the tree; these checks are defence in depth (the public read
    // checks only that `content` is an array), so a malformed item is skipped, never a crash.
    if (!isRecord(item) || typeof item.type !== 'string') continue;
    const def = blockDef(item.type);
    if (!def) continue;
    const src: Record<string, unknown> = isRecord(item.props) ? item.props : {};
    const props: Record<string, unknown> = { ...src };
    for (const s of def.slots) {
      const children = Array.isArray(src[s]) ? (src[s] as ComponentData[]) : [];
      props[s] = fixedSlot(build(children, ctx), children);
    }
    const id = typeof src.id === 'string' ? src.id : `#${i}`;
    out.push(createElement(Fragment, { key: `${item.type}:${id}` }, renderBlock(def, props, ctx)));
  }
  return out;
}

/**
 * Spec §6.3: guard once, build a static element tree once, memoise per (doc object, layout).
 * null ⇒ the built-in design. Never runs per card.
 */
export function compileCard(doc: unknown, kind: CardKind, layout: LayoutKind): CardDesign | null {
  if (!isRecord(doc)) return null;
  let perDoc = memo.get(doc);
  if (perDoc?.has(layout)) return perDoc.get(layout) ?? null;
  const docKey = cardKey(kind);
  const { doc: clean } = validateDoc(doc, docKey, layout);
  let design: CardDesign | null = null;
  if (clean) {
    try {
      const element = build(clean.content, { editing: false, docKey, layout });
      const Family = kind === 'tile' ? CardTileFamily : CardRowFamily;
      design = { kind, element, render: (data, views) => createElement(Family.Provider, { value: { data, views } }, element) };
    } catch (error) {
      // A block render that throws on odd props: the built-in card, never a crashed list.
      console.error(`[builder] card design "${kind}" (${layout}) failed to compile — showing the built-in card`, error);
    }
  }
  if (!perDoc) { perDoc = new Map(); memo.set(doc, perDoc); }
  perDoc.set(layout, design);
  return design;
}
