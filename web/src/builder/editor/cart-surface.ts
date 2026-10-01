import { useSyncExternalStore } from 'react';
import { useEditorStore } from '@/builder/editor/store.ts';
import type { DocKey } from '@/builder/types.ts';
import type { ViewportWidth } from '@/builder/editor/protocol.ts';

/** Which surface the cart document is drawn on while editing (stage 4 spec §11.3). */
export type CartSurface = 'page' | 'drawer';

let surface: CartSurface = 'page';
const listeners = new Set<() => void>();

function set(next: CartSurface): void {
  if (next === surface) return;
  surface = next;
  for (const l of [...listeners]) l();
}

// A different document starts on the page again.
let lastDoc = useEditorStore.getState().docKey;
useEditorStore.subscribe((s) => {
  if (s.docKey === lastDoc) return;
  lastDoc = s.docKey;
  set('page');
});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function getCartSurface(): CartSurface {
  return surface;
}

export function useCartSurface(): [CartSurface, (s: CartSurface) => void] {
  return [useSyncExternalStore(subscribe, getCartSurface, getCartSurface), set];
}

/** The path the exact preview opens: the drawer is the shop's own, opened by `/cart` on a desktop. */
export function exactPreviewPath(docKey: DocKey, s: CartSurface): string | null {
  return docKey === 'cart' && s === 'drawer' ? '/cart' : null;
}

/** The drawer exists only at desktop width, so its exact preview is forced there. */
export const DRAWER_PREVIEW_WIDTH: ViewportWidth = 1280;
