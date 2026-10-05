import { useSyncExternalStore } from 'react';

/**
 * Whether the shop has a modal dialog or drawer open over the page. Mantine marks the content of every Modal and
 * Drawer `aria-modal="true"` while it is mounted, so the document itself is the signal: dialogs are opened from
 * a dozen places (the cart drawer, product sheet, sign-in, the order reminder, any future one), and one observer
 * here catches all of them, including one that unmounts while open.
 */
const MODAL = '[aria-modal="true"]';

const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;
let last = false;

function read(): boolean {
  return typeof document !== 'undefined' && document.querySelector(MODAL) !== null;
}

/** A node that is, or has inside it, a modal dialog. */
function holdsModal(node: Node): boolean {
  return node instanceof Element && (node.matches(MODAL) || node.querySelector(MODAL) !== null);
}

/** Whether a batch of mutations could have opened or closed a dialog: most of a page's mutations cannot. */
function mayMatter(records: MutationRecord[]): boolean {
  return records.some((r) => {
    if (r.type === 'attributes') return true;
    return holdsModal(r.target) || Array.from(r.addedNodes).some(holdsModal) || Array.from(r.removedNodes).some(holdsModal);
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!observer && typeof MutationObserver !== 'undefined') {
    last = read();
    observer = new MutationObserver((records) => {
      if (!mayMatter(records)) return;
      const now = read();
      if (now === last) return;
      last = now;
      listeners.forEach((l) => l());
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-modal'] });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = null;
    }
  };
}

export function useModalOpen(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
