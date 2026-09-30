/**
 * Puck stays mounted (hidden) while an exact preview shows, and its hotkeys listen on `document`
 * in the bubble phase: undo / redo (Ctrl or ⌘ + Z, Shift+Z, Y — even inside inputs) and delete
 * (Delete / Backspace remove the selected block unless focus is in a text field). Left alone they
 * would change the hidden draft — "Back to editing" is focused, so a Backspace would delete a
 * block nobody can see. This stops those keys at the window, in the capture phase, before they
 * reach the document.
 *
 * Not their default actions: Ctrl+Z in a text field still undoes the typing, and Delete /
 * Backspace in a text field are not touched at all.
 */

const UNDO_CODES = new Set(['KeyZ', 'KeyY']);
const DELETE_KEYS = new Set(['Delete', 'Backspace']);

export function isTextEditable(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'color', 'range'].includes(el.type);
  }
  return false;
}

/** A key Puck would act on while its canvas is hidden. */
export function isHiddenCanvasHotkey(e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && (UNDO_CODES.has(e.code) || key === 'z' || key === 'y')) return true;
  return (DELETE_KEYS.has(e.key) || DELETE_KEYS.has(e.code)) && !isTextEditable(e.target);
}

/** Install the guard; returns its removal. */
export function guardHiddenCanvasHotkeys(win: Window): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (isHiddenCanvasHotkey(e)) e.stopPropagation();
  };
  win.addEventListener('keydown', onKeyDown, true);
  return () => win.removeEventListener('keydown', onKeyDown, true);
}
