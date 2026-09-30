// web/src/builder/editor/text/history.ts

/**
 * Text edits share the canvas's undo/redo (spec §7.4). Puck keeps block history per canvas mount
 * (entries with ids, an index); the store keeps text snapshots. Each text snapshot records the id
 * of the Puck entry that was current when it was made (its anchor), which is enough to replay
 * both in the order the owner made them.
 */

export interface TextHistoryEntry<S> { snap: S; anchor: string | null }

export interface PuckHistoryView {
  anchor: string | null;
  hasPast: boolean;
  hasFuture: boolean;
  anchors: readonly (string | null)[];
  index: number;
}

export const COALESCE_MS = 1000;
export const TEXT_HISTORY_MAX = 100;

export function puckHistoryView(h: { histories: ReadonlyArray<{ id?: string }>; index: number; hasPast: boolean; hasFuture: boolean }): PuckHistoryView {
  const anchors = h.histories.map((e) => e.id ?? null);
  return { anchor: anchors[h.index] ?? null, hasPast: h.hasPast, hasFuture: h.hasFuture, anchors, index: h.index };
}

export function undoStep(top: { anchor: string | null } | undefined, puck: PuckHistoryView): 'text' | 'doc' | null {
  if (top && (top.anchor === puck.anchor || !puck.hasPast)) return 'text';
  if (puck.hasPast) return 'doc';
  return null;
}

export function redoStep(top: { anchor: string | null } | undefined, puck: PuckHistoryView): 'text' | 'doc' | 'discard' | null {
  if (top && top.anchor === puck.anchor) return 'text';
  if (top) {
    const at = puck.anchors.indexOf(top.anchor);
    if (at > puck.index) return puck.hasFuture ? 'doc' : 'text';
    if (at === -1) return puck.hasFuture ? 'doc' : 'text';
    return 'discard';
  }
  return puck.hasFuture ? 'doc' : null;
}

let anchorSource: (() => string | null) | null = null;
/** The live canvas (EditorHeader) registers how to read Puck's current history id. */
export function setAnchorSource(fn: (() => string | null) | null): void {
  anchorSource = fn;
}
export function currentAnchor(): string | null {
  return anchorSource ? anchorSource() : null;
}
