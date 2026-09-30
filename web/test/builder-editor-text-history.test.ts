// web/test/builder-editor-text-history.test.ts
import { describe, expect, it } from 'vitest';
import { currentAnchor, puckHistoryView, redoStep, setAnchorSource, undoStep } from '@/builder/editor/text/history.ts';

const view = (ids: string[], index: number) =>
  puckHistoryView({ histories: ids.map((id) => ({ id })), index, hasPast: index > 0, hasFuture: index < ids.length - 1 });

describe('unified undo', () => {
  it('replays D1, T(at D1), D2 backwards and forwards in true order', () => {
    // Undo 1: a block edit came after the text edit → Puck back.
    expect(undoStep({ anchor: 'd1' }, view(['d0', 'd1', 'd2'], 2))).toBe('doc');
    // Undo 2: Puck is where the text edit happened → the text.
    expect(undoStep({ anchor: 'd1' }, view(['d0', 'd1', 'd2'], 1))).toBe('text');
    // Undo 3: no text left → Puck back.
    expect(undoStep(undefined, view(['d0', 'd1', 'd2'], 1))).toBe('doc');
    // Redo 1: the text redo is anchored at d1, Puck is at d0 → forward first.
    expect(redoStep({ anchor: 'd1' }, view(['d0', 'd1', 'd2'], 0))).toBe('doc');
    // Redo 2: at d1 → the text.
    expect(redoStep({ anchor: 'd1' }, view(['d0', 'd1', 'd2'], 1))).toBe('text');
    // Redo 3: nothing in the text future → Puck forward.
    expect(redoStep(undefined, view(['d0', 'd1', 'd2'], 1))).toBe('doc');
  });

  it('undoes text when Puck has no past (a fresh canvas after a page switch)', () => {
    expect(undoStep({ anchor: 'old-mount' }, view(['n0'], 0))).toBe('text');
    expect(undoStep(undefined, view(['n0'], 0))).toBeNull();
  });

  it('redo: a text edit anchored behind a new block edit is discarded; one from another mount is redone', () => {
    expect(redoStep({ anchor: 'd0' }, view(['d0', 'd3'], 1))).toBe('discard');
    expect(redoStep({ anchor: 'gone' }, view(['n0'], 0))).toBe('text');
    expect(redoStep(undefined, view(['n0'], 0))).toBeNull();
  });

  it('an empty Puck history has a null anchor', () => {
    expect(puckHistoryView({ histories: [], index: -1, hasPast: false, hasFuture: false }).anchor).toBeNull();
  });

  it('anchor source: null until a live canvas registers one', () => {
    expect(currentAnchor()).toBeNull();
    setAnchorSource(() => 'h-7');
    expect(currentAnchor()).toBe('h-7');
    setAnchorSource(null);
    expect(currentAnchor()).toBeNull();
  });
});
