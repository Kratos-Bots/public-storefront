import { useEffect, useState, type ComponentType } from 'react';
import { useUiStore } from '@/stores/ui.ts';

/**
 * The cart drawer. The panel (the layout's cart document rendered inside the Sheet, stage 4 spec
 * §7.3) lives in its own module because it needs the block registry, and the shell that mounts this
 * component is itself reachable from the registry: a static import would close that cycle. The panel
 * is requested when the shell first mounts the drawer (the drawer is mounted for the whole visit),
 * long before a shopper can open it, so opening it never waits on the network and never suspends.
 */
let Panel: ComponentType | null = null;
let loading: Promise<void> | null = null;
let failed = false;
function load(): Promise<void> {
  // A rejected import (a deploy replaced the hashed chunk, or the shopper is offline) is not cached:
  // the next mount or the next open of the drawer asks again.
  loading ??= import('@/features/cart/CartDrawerPanel.tsx').then(
    (m) => {
      Panel = m.CartDrawerPanel;
      failed = false;
    },
    () => {
      loading = null;
      failed = true;
    },
  );
  return loading;
}

/**
 * Is the panel settled (loaded, or failed)? Opening the drawer retries a failed import. The portal
 * order no longer depends on it: the panel moves its own portal to the front when it mounts.
 */
export function useCartDrawerReady(): boolean {
  const [, rerender] = useState(0);
  const open = useUiStore((s) => s.cartOpen);
  useEffect(() => {
    if (!Panel) void load().then(() => rerender((n) => n + 1));
  }, [open]);
  return Panel !== null || failed;
}

export function CartDrawer() {
  useCartDrawerReady();
  return Panel ? <Panel /> : null;
}
