import { useEffect, useState, type ComponentType } from 'react';

/**
 * The cart drawer. The panel (the layout's cart document rendered inside the Sheet, stage 4 spec
 * §7.3) lives in its own module because it needs the block registry, and the shell that mounts this
 * component is itself reachable from the registry: a static import would close that cycle. The panel
 * is requested when the shell first mounts the drawer (the drawer is mounted for the whole visit),
 * long before a shopper can open it, so opening it never waits on the network and never suspends.
 */
let Panel: ComponentType | null = null;
let loading: Promise<void> | null = null;
function load(): Promise<void> {
  loading ??= import('@/features/cart/CartDrawerPanel.tsx').then((m) => {
    Panel = m.CartDrawerPanel;
  });
  return loading;
}

export function CartDrawer() {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!Panel) void load().then(() => rerender((n) => n + 1));
  }, []);
  return Panel ? <Panel /> : null;
}
