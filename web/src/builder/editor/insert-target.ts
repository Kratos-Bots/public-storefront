import type { ComponentData, Config, PuckApi } from '@puckeditor/core';
import { ROOT_ZONE } from '@/builder/editor/config.ts';
import type { PartFamily } from '@/builder/parts.ts';
import { blockDef } from '@/builder/rules.ts';
import { isComponentLike, isRecord } from '@/builder/types.ts';

/** The slice of Puck's API the choice needs (a fake in tests). */
export type InsertApi = Pick<PuckApi, 'config' | 'getItemById' | 'getParentById' | 'getSelectorForId'> & {
  appState: { ui: { itemSelector: { index: number; zone?: string } | null }; data: { content: unknown[] } };
};

export interface InsertTarget { zone: string; index: number; nested: boolean }

/** `false` when the slot holding `zone` lists the blocks it accepts and `type` isn't one. */
function slotAccepts(api: InsertApi, zone: string, type: string): boolean {
  const cut = zone.lastIndexOf(':');
  if (cut <= 0) return true;
  const parent = api.getItemById(zone.slice(0, cut)) as ComponentData | undefined;
  if (!parent) return false;
  const field = (api.config as Config).components[parent.type]?.fields?.[zone.slice(cut + 1)] as { type?: string; allow?: string[] } | undefined;
  if (field?.type !== 'slot') return true;
  return !Array.isArray(field.allow) || field.allow.includes(type);
}

/** Depth-first through every component-shaped array: the first container of `family`. */
function findContainer(items: readonly ComponentData[], family: PartFamily): ComponentData | undefined {
  for (const item of items) {
    if (blockDef(item.type)?.container?.family === family) return item;
    if (!isRecord(item.props)) continue;
    for (const value of Object.values(item.props)) {
      if (!Array.isArray(value) || !value.every(isComponentLike)) continue;
      const hit = findContainer(value as ComponentData[], family);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * Where "Add block" puts a `type`: right after the selected block, in the same slot — unless that
 * slot doesn't accept the type, in which case right after the selected block's top-level ancestor
 * on the page. Nothing selected: the end of the page. Never inserts into a slot that disallows it.
 */
export function insertTarget(api: InsertApi, type: string): InsertTarget {
  const part = blockDef(type)?.part;
  if (part) {
    // Spec §11: a part goes after the selected block when that slot takes it, else to the end of its
    // family container's insert slot — never the page root, where it would raise part-placement.
    const sel = api.appState.ui.itemSelector;
    const zone = sel?.zone;
    if (sel && zone && zone !== ROOT_ZONE && slotAccepts(api, zone, type)) return { zone, index: sel.index + 1, nested: true };
    const home = findContainer(api.appState.data.content as ComponentData[], part.family);
    if (home) {
      const slot = blockDef(home.type)!.container!.insertSlot;
      const items = Array.isArray(home.props[slot]) ? (home.props[slot] as unknown[]) : [];
      return { zone: `${home.props.id}:${slot}`, index: items.length, nested: true };
    }
  }
  const sel = api.appState.ui.itemSelector;
  const end: InsertTarget = { zone: ROOT_ZONE, index: api.appState.data.content.length, nested: false };
  if (!sel) return end;
  const zone = sel.zone ?? ROOT_ZONE;
  if (zone === ROOT_ZONE) return { zone, index: sel.index + 1, nested: false };
  if (slotAccepts(api, zone, type)) return { zone, index: sel.index + 1, nested: true };

  // Climb from the slot's owner to the block that sits directly on the page.
  let id = zone.slice(0, zone.lastIndexOf(':'));
  for (let guard = 0; guard < 64; guard += 1) {
    let parent: ComponentData | undefined;
    try {
      parent = api.getParentById(id) as ComponentData | undefined;
    } catch {
      break;
    }
    // Top-level blocks' parent is Puck's root node, which has no block id.
    const parentId = parent?.props?.id;
    if (typeof parentId !== 'string' || parentId === 'root') break;
    id = parentId;
  }
  const top = api.getSelectorForId(id);
  return top && (top.zone ?? ROOT_ZONE) === ROOT_ZONE ? { zone: ROOT_ZONE, index: top.index + 1, nested: false } : end;
}
