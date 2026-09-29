import type { ComponentData, Config, PuckApi } from '@puckeditor/core';
import { ROOT_ZONE } from '@/builder/editor/config.ts';

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

/**
 * Where "Add block" puts a `type`: right after the selected block, in the same slot — unless that
 * slot doesn't accept the type, in which case right after the selected block's top-level ancestor
 * on the page. Nothing selected: the end of the page. Never inserts into a slot that disallows it.
 */
export function insertTarget(api: InsertApi, type: string): InsertTarget {
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
