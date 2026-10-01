import { useSyncExternalStore } from 'react';
import { useEditorStore } from '@/builder/editor/store.ts';
import type { DocKey, LayoutKind } from '@/builder/types.ts';
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

/**
 * The path the exact preview opens: the drawer is the shop's own, opened by `/cart` on a desktop.
 * The web app has no drawer and the read-only view has no surface switch, so neither gets one.
 */
export function exactPreviewPath(docKey: DocKey, s: CartSurface, layout: LayoutKind = 'storefront', readOnly = false): string | null {
  return docKey === 'cart' && s === 'drawer' && layout !== 'webapp' && !readOnly ? '/cart' : null;
}

/** The drawer exists only at desktop width, so its exact preview is forced there. */
export const DRAWER_PREVIEW_WIDTH: ViewportWidth = 1280;
