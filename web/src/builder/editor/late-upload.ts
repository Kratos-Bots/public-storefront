import { blockDef } from '@/builder/rules.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import type { ComponentData, DocKey, PuckDoc } from '@/builder/types.ts';

/*
 * An image upload can outlive its field: the owner selects another block or switches page while
 * the admin is still storing the file. The URL must then still land in the block it was picked
 * for — never in whatever block the field panel shows now (Puck's field onChange writes to the
 * CURRENT selection) — or, when that block can't be reached any more, the owner is told.
 */

/** Where an upload belongs: a top-level prop of one block (or of the page root, blockId null). */
export interface UploadTarget {
  docKey: DocKey;
  epoch: number;
  blockId: string | null;
  prop: string;
}

/**
 * Puck names a block's top-level field `${blockId}_custom_${prop}` and a root field
 * `root_custom_${prop}`. A nested (array/object) field has a dotted or indexed `name` and gets no
 * target: a late result for it is reported, not placed.
 */
export function uploadTarget(fieldId: string, name: string): UploadTarget | null {
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return null;
  const suffix = `_custom_${name}`;
  if (!fieldId.endsWith(suffix) || fieldId.length === suffix.length) return null;
  const owner = fieldId.slice(0, -suffix.length);
  const { docKey, epoch } = useEditorStore.getState();
  return { docKey, epoch, blockId: owner === 'root' ? null : owner, prop: name };
}

/** Sets `prop` on the block `blockId` anywhere in `items` (slots included); null when not found. */
function setIn(items: readonly ComponentData[], blockId: string, prop: string, value: unknown): ComponentData[] | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.props.id === blockId) {
      const out = [...items];
      out[i] = { ...item, props: { ...item.props, [prop]: value } };
      return out;
    }
    for (const slot of blockDef(item.type)?.slots ?? []) {
      const children = item.props[slot];
      if (!Array.isArray(children)) continue;
      const next = setIn(children as ComponentData[], blockId, prop, value);
      if (next) {
        const out = [...items];
        out[i] = { ...item, props: { ...item.props, [slot]: next } };
        return out;
      }
    }
  }
  return null;
}

/** `doc` with the target prop set, or null when its block is no longer in the doc. */
export function withProp(doc: PuckDoc, blockId: string | null, prop: string, value: unknown): PuckDoc | null {
  if (blockId === null) return { ...doc, root: { ...doc.root, props: { ...doc.root.props, [prop]: value } } };
  const content = setIn(doc.content, blockId, prop, value);
  if (content) return { ...doc, content };
  for (const [zone, list] of Object.entries(doc.zones ?? {})) {
    const next = setIn(list, blockId, prop, value);
    if (next) return { ...doc, zones: { ...doc.zones, [zone]: next } };
  }
  return null;
}

/** The mounted Puck canvas: sets a prop through Puck's own state (so undo and the store follow). */
export interface LiveCanvas {
  docKey: DocKey;
  epoch: number;
  setProp(blockId: string | null, prop: string, value: string): boolean;
}

let live: LiveCanvas | null = null;

/** Called by the canvas while it is mounted; returns the unregister. */
export function registerLiveCanvas(canvas: LiveCanvas): () => void {
  live = canvas;
  return () => {
    if (live === canvas) live = null;
  };
}

/**
 * Puts a finished upload into the doc it was picked for, if that doc is still loaded: through the
 * live canvas when the doc is open, else straight into the store. False = it could not be placed
 * (a load, reset or new page replaced the set, the block was deleted, or the version is read-only).
 */
export function placeLateUpload(target: UploadTarget, url: string): boolean {
  const s = useEditorStore.getState();
  if (s.readOnly || s.status !== 'ready' || s.epoch !== target.epoch) return false;
  if (target.docKey === s.docKey) {
    return live !== null && live.docKey === target.docKey && live.epoch === target.epoch
      ? live.setProp(target.blockId, target.prop, url)
      : false;
  }
  return s.patchOffCanvas(target.docKey, target.epoch, (doc) => withProp(doc, target.blockId, target.prop, url));
}
