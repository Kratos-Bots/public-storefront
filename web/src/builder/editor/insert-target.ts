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

function endOfInsertSlot(home: ComponentData): InsertTarget {
  const slot = blockDef(home.type)!.container!.insertSlot;
  const items = Array.isArray(home.props[slot]) ? (home.props[slot] as unknown[]) : [];
  return { zone: `${home.props.id}:${slot}`, index: items.length, nested: true };
}

const isFamilyContainer = (item: ComponentData | undefined, family: PartFamily): boolean =>
  !!item && blockDef(item.type)?.container?.family === family;

/** The selected block itself: a root item by index, else the owner's slot entry. */
function selectedItem(api: InsertApi, sel: { index: number; zone?: string }): ComponentData | undefined {
  const zone = sel.zone ?? ROOT_ZONE;
  if (zone === ROOT_ZONE) return api.appState.data.content[sel.index] as ComponentData | undefined;
  const cut = zone.lastIndexOf(':');
  const owner = cut > 0 ? (api.getItemById(zone.slice(0, cut)) as ComponentData | undefined) : undefined;
  const list = owner?.props?.[zone.slice(cut + 1)];
  return Array.isArray(list) ? (list[sel.index] as ComponentData | undefined) : undefined;
}

/**
 * The nearest container of `family` holding the selection, or the selected block when it is one
 * (`isSelected`): climbs from the selected block through its slot's owner and that owner's parents.
 */
function containerAround(api: InsertApi, sel: { index: number; zone?: string }, family: PartFamily): { container: ComponentData; isSelected: boolean } | undefined {
  const selected = selectedItem(api, sel);
  if (selected && isFamilyContainer(selected, family)) return { container: selected, isSelected: true };
  const zone = sel.zone ?? ROOT_ZONE;
  if (zone === ROOT_ZONE) return undefined;
  let item = api.getItemById(zone.slice(0, zone.lastIndexOf(':'))) as ComponentData | undefined;
  for (let guard = 0; item && guard < 64; guard += 1) {
    if (isFamilyContainer(item, family)) return { container: item, isSelected: false };
    const id = item.props?.id;
    if (typeof id !== 'string') return undefined;
    try {
      item = api.getParentById(id) as ComponentData | undefined;
    } catch {
      return undefined;
    }
    // Top-level blocks' parent is Puck's root node, which has no block id.
    if (!item || item.props?.id === 'root') return undefined;
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
    // Spec §11: a part goes into a container of its family — never elsewhere, where it would raise
    // part-placement. The selection's own container wins: after the selected block when its slot
    // takes the part, else the end of that container's insert slot. No container around the
    // selection (or nothing selected): the end of the first container's insert slot.
    const sel = api.appState.ui.itemSelector;
    const around = sel ? containerAround(api, sel, part.family) : undefined;
    if (around && sel && !around.isSelected) {
      const zone = sel.zone!;
      if (slotAccepts(api, zone, type)) return { zone, index: sel.index + 1, nested: true };
    }
    const home = around?.container ?? findContainer(api.appState.data.content as ComponentData[], part.family);
    if (home) return endOfInsertSlot(home);
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
