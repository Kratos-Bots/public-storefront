import { useEffect, useMemo, type ReactNode } from 'react';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { useUiStore } from '@/stores/ui.ts';
import { CloseIcon } from '@/components/icons.tsx';
import { CartHostContext, type CartHost } from '@/features/cart/cart-host.ts';
import { PuckPage } from '@/builder/runtime.tsx';
import { useCartSurface, type CartSurface } from '@/builder/editor/cart-surface.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { useText } from '@/text/runtime.tsx';
import sheetChrome from '@/components/Sheet.module.css';
import cartClasses from '@/features/cart/CartDrawer.module.css';
import styles from '@/builder/editor/CartStage.module.css';

const OPTIONS: ReadonlyArray<{ value: CartSurface; label: string }> = [
  { value: 'page', label: 'Page' },
  { value: 'drawer', label: 'Drawer' },
];

const noop = () => {};

/** The drawer's header, as CartDrawerPanel builds it, inert: the owner arranges what sits between it and the footer. */
function DrawerHeader() {
  const { t, tp } = useText();
  const count = useCartStore(selectCount);
  return (
    <div className={styles.head} inert aria-hidden="true">
      <span className={sheetChrome.handle} />
      <div className={cartClasses.head}>
        <div>
          <h2 className={cartClasses.title}>{t('cart.drawer.title')}</h2>
          <p className={cartClasses.sub}>{tp('cart.summary.items', count)}</p>
        </div>
        <span className={cartClasses.close}><CloseIcon size={16} /></span>
      </div>
    </div>
  );
}

const frame: CartHost['frame'] = ({ body, footer }) => (
  <>
    <div className={sheetChrome.body}>{body}</div>
    {footer ? <div className={`${sheetChrome.footer} ${styles.foot}`}>{footer}</div> : null}
  </>
);

function DrawerStage({ children }: { children: ReactNode }) {
  const host = useMemo<CartHost>(() => ({ surface: 'drawer', frame, dismiss: noop }), []);
  return (
    <div className={`${styles.stage} ${styles.pageOnly}`} data-sf-builder-cart-drawer="">
      <div className={`${sheetChrome.content} ${styles.sheet}`}>
        <DrawerHeader />
        <CartHostContext.Provider value={host}>{children}</CartHostContext.Provider>
      </div>
      <p className={styles.caption}>The drawer’s header is fixed. Blocks tagged “Cart page only” don’t show in it.</p>
    </div>
  );
}

/**
 * The cart document's canvas (spec §11.3). Page: the document as it is. Drawer: a 420 px column
 * with a non-interactive copy of the drawer header and the document inside a drawer-surface
 * `CartHostContext` (the container draws `main` in the column and `summary` pinned below). The
 * read-only view has no surface to switch.
 */
export function CartStage({ children, column }: { children: ReactNode; column?: (children: ReactNode) => ReactNode }) {
  const [surface, setSurface] = useCartSurface();
  const readOnly = useEditorStore((s) => s.readOnly);
  return (
    <div className={styles.root} data-sf-builder-cart="">
      {readOnly ? null : (
        <div className={styles.switch}>
          <div className={styles.group} role="radiogroup" aria-label="Cart surface">
            {OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={surface === o.value}
                className={styles.option}
                onClick={() => setSurface(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {surface === 'drawer' && !readOnly ? <DrawerStage>{children}</DrawerStage> : (column ? column(children) : children)}
    </div>
  );
}

/**
 * The exact preview of the drawer (the shop's own, at desktop width): the catalogue behind the real
 * drawer, opened as `/cart` opens it, so it shows the draft cart document. Closes it on leaving.
 */
export function OpenCartDrawer() {
  useEffect(() => {
    useUiStore.getState().open('cartOpen');
    return () => useUiStore.getState().close('cartOpen');
  }, []);
  return <PuckPage routeKey="catalog" />;
}
