import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useUiStore } from '@/stores/ui.ts';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { Sheet } from '@/components/Sheet.tsx';
import { CloseIcon } from '@/components/icons.tsx';
import { useEffectiveLayout } from '@/app/layout.ts';
import { validateDoc } from '@/builder/guard.ts';
import { CART_CONTAINER } from '@/builder/blocks/_shared/cart-container.ts';
import { usePageSetContext } from '@/builder/page-set-context.ts';
import { findComponent } from '@/builder/parts.ts';
import { DocBoundary, renderComponent } from '@/builder/render.tsx';
import { isComponentLike, isRecord, type ComponentData } from '@/builder/types.ts';
import type { BlockRenderContext } from '@/builder/define.ts';
import { cartViews } from '@/builder/blocks/_shared/cart-views.ts';
// Static imports for their side effect: each registers its container view in cartViews, so the blocks render it without suspending.
import '@/features/cart/CartPage.tsx';
import '@/features/cart/CartSummary.tsx';
import { CartHostContext, type CartHost } from '@/features/cart/cart-host.ts';
import { useServerCart } from '@/features/cart/useServerCart.ts';
import classes from '@/features/cart/CartDrawer.module.css';
import { useText } from '@/text/runtime.tsx';

// Once the published cart document has crashed, the default arrangement serves the rest of the page load.
const markFailed = () => {
  cartViews.publishedFailed = true;
};

/**
 * The built-in cart (v0.7.0's arrangement). Built from the container's own defaults rather than the
 * default document: this module is reachable from the block registry, which the defaults table needs.
 */
const FALLBACK_ID = 'CartContents-default';
const FALLBACK_ITEM: ComponentData = {
  type: 'CartContents',
  props: { id: FALLBACK_ID, ...CART_CONTAINER.defaultSlots({}, { layout: 'storefront', id: FALLBACK_ID }) },
};

/**
 * The container without its page styling. The container draws nothing where it stands (its frame
 * portals the Sheet), so a style wrapper would be an empty, padded, bordered box in the shell; the
 * owner's cart-page spacing and background are the page's, not the drawer's.
 */
function unstyled(item: ComponentData): ComponentData {
  if (!isRecord(item.props) || !('blockStyle' in item.props)) return item;
  const { blockStyle: _blockStyle, ...props } = item.props;
  return { ...item, props };
}

/** A block of `type` anywhere under `items` except inside `skip`'s own subtree (depth-first). */
function findOutside(items: readonly ComponentData[], skip: ComponentData, type: string): ComponentData | undefined {
  for (const item of items) {
    if (item === skip) continue;
    if (item.type === type) return item;
    if (!isRecord(item.props)) continue;
    for (const value of Object.values(item.props)) {
      if (!Array.isArray(value) || value.length === 0 || !value.every(isComponentLike)) continue;
      const found = findOutside(value, skip, type);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * The panel is a dynamic import, so its portal lands after every overlay that mounted before the
 * chunk resolved (the catalogue's product sheet). v0.7.0 mounted the drawer with the shell, ahead
 * of all of them. The sheet's root ref (set in the commit that fills its portal) moves its wrapper to the front of Mantine's
 * shared portal node (behind the app's notification roots): same nodes, same markup, and the v0.7.0 order by construction, not by timing.
 */
function drawerFirst(root: HTMLDivElement | null): void {
  const shared = document.querySelector('[data-mantine-shared-portal-node]');
  let wrapper: Element | null = root;
  while (wrapper && wrapper.parentElement !== shared) wrapper = wrapper.parentElement;
  if (!shared || !wrapper) return;
  // The app's own notification roots mount above the shell and keep their place; every overlay after them follows the drawer.
  const first = [...shared.children].find((c) => !c.classList.contains('mantine-Notifications-root'));
  if (first && first !== wrapper) shared.insertBefore(wrapper, first);
}

/**
 * The cart as a panel: it slides in from the right on a desktop and rises as a
 * bottom sheet on a phone, in the same chassis the product and filter sheets
 * use. Opening it in server mode pulls the customer's cart first — they may
 * have added to it from the bot since this tab was last awake.
 *
 * Its body and footer are the layout's `cart` document (stage 4 spec §7.3): the CartContents
 * container hands them to `host.frame`, which wraps them in the Sheet and its header.
 */
export function CartDrawerPanel() {
  const { t, tp } = useText();
  const opened = useUiStore((s) => s.cartOpen);
  const close = useUiStore((s) => s.close);
  const lines = useCartStore((s) => s.lines);
  const count = useCartStore(selectCount);
  const { isSyncing, refresh } = useServerCart();

  const dismiss = useCallback(() => close('cartOpen'), [close]);

  useEffect(() => {
    if (opened) void refresh();
  }, [opened, refresh]);

  const ctx = usePageSetContext();
  const effective = useEffectiveLayout();
  const layout = ctx?.layout ?? effective;
  const stored = ctx?.pageSet?.pages.cart;
  // Guard once per stored document object, not on every render.
  const guarded = useMemo(() => (stored ? validateDoc(stored, 'cart', layout).doc : null), [stored, layout]);
  const published = !cartViews.publishedFailed && guarded ? guarded : null;
  const item = (published ? findComponent(published.content, 'CartContents') : undefined) ?? FALLBACK_ITEM;
  const usingPublished = published !== null && item !== FALLBACK_ITEM;

  const renderCtx = useMemo<BlockRenderContext>(() => ({ editing: false, docKey: 'cart', layout }), [layout]);
  // A CartSummary kept outside CartContents (legal in v0.7.0) is the footer when the contents' own summary is empty.
  const outside = usingPublished && lines.length > 0 ? findOutside(published!.content, item, 'CartSummary') : undefined;
  const outsideFooter: ReactNode = outside ? renderComponent(outside, renderCtx) : undefined;

  const host: CartHost = {
    surface: 'drawer',
    dismiss,
    frame: ({ body, footer }) => (
      <Sheet
        opened={opened}
        onClose={dismiss}
        label={t('cart.drawer.title')}
        part="drawer"
        rootRef={drawerFirst}
        header={
          <div className={classes.head}>
            <div>
              <h2 className={classes.title}>{t('cart.drawer.title')}</h2>
              <p className={classes.sub}>
                {tp('cart.summary.items', count)}
                {isSyncing ? <span className={classes.pulse} aria-hidden /> : null}
              </p>
            </div>
            <button type="button" className={classes.close} onClick={dismiss} aria-label={t('common.actions.close')}>
              <CloseIcon size={16} />
            </button>
          </div>
        }
        footer={footer ?? outsideFooter}
      >
        {body}
      </Sheet>
    ),
  };

  return (
    <CartHostContext.Provider value={host}>
      <DocBoundary docKey="cart" onFallback={markFailed} fallback={renderComponent(FALLBACK_ITEM, renderCtx)}>
        {renderComponent(unstyled(item), renderCtx)}
      </DocBoundary>
    </CartHostContext.Provider>
  );
}
