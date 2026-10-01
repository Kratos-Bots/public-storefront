import { blockDef } from '@/builder/rules.ts';
import type { ComponentData, LayoutKind } from '@/builder/types.ts';
import { ROOT_ZONE } from '@/builder/editor/config.ts';
import { withDefaultArrangement } from '@/builder/editor/container-parts.ts';
import { DEFAULT_STEP_ORDER, withStepOrder } from '@/builder/editor/step-order.ts';

/** "Reset arrangement": every slot back to `defaultSlots`, every other prop kept. */
export const resetArrangement = (current: ComponentData, layout: LayoutKind): ComponentData => withDefaultArrangement(current, layout);

/** "Reset step order": the five steps back in the default order; every slot's content stays. */
export const resetStepOrder = (current: ComponentData): ComponentData => withStepOrder(current, DEFAULT_STEP_ORDER);

/** The part of Puck's API a block edit needs (structural, so tests can fake it). */
export interface BlockApi {
  getSelectorForId(id: string): { index: number; zone?: string } | undefined;
  getItemBySelector(selector: { index: number; zone?: string }): unknown;
}
export type BlockDispatch = (action: { type: 'replace'; destinationIndex: number; destinationZone: string; data: ComponentData }) => void;

/**
 * One `replace` built from the block Puck holds now (not the rendered one), so no edit is lost.
 * The panel's buttons and the issue list's quick fixes share it. False when the block is gone.
 */
export function applyToBlock(
  getPuck: () => BlockApi, dispatch: BlockDispatch, blockId: string, build: (current: ComponentData) => ComponentData,
): boolean {
  const api = getPuck();
  const sel = api.getSelectorForId(blockId);
  const current = sel ? (api.getItemBySelector(sel) as ComponentData | undefined) : undefined;
  if (!sel || !current) return false;
  dispatch({ type: 'replace', destinationIndex: sel.index, destinationZone: sel.zone ?? ROOT_ZONE, data: build(current) });
  return true;
}

/** The container an issue is about: the block itself when it is one, else its nearest container ancestor. */
export function containerOf(content: readonly ComponentData[], blockId: string): ComponentData | null {
  const visit = (items: readonly ComponentData[], owner: ComponentData | null): ComponentData | null | undefined => {
    for (const c of items) {
      const def = blockDef(c.type);
      if (c.props.id === blockId) return def?.container ? c : owner;
      const next = def?.container ? c : owner;
      for (const s of def?.slots ?? []) {
        const kids = c.props[s];
        if (!Array.isArray(kids)) continue;
        const hit = visit(kids as ComponentData[], next);
        if (hit !== undefined) return hit;
      }
    }
    return undefined;
  };
  return visit(content, null) ?? null;
}
