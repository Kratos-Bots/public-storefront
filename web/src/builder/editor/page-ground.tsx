import type { ReactNode } from 'react';
import { cardKind, isCardKey, type DocKey, type LayoutKind } from '@/builder/types.ts';
import { SheetStage } from '@/builder/editor/SheetStage.tsx';
import { CartStage } from '@/builder/editor/CartStage.tsx';
import { CheckoutNote } from '@/builder/editor/CheckoutNote.tsx';
import { CardStage } from '@/builder/editor/CardStage.tsx';
import styles from '@/builder/editor/PageGround.module.css';

/**
 * What a page stands on in the storefront, reproduced for the editor canvas and the read-only
 * view (the exact preview renders the real shell instead): the shop's ground and ink (global.css
 * paints them on body; Puck's canvas is white), the shell's published custom properties
 * (--sf-rail-max, --sf-bar-h, --sf-main-pad) and — for page docs — its content column. The shell
 * doc brings its own chrome, so it gets no column.
 *
 * `data-sf-builder-canvas` scopes the resting marks and the link lock (fixture-routes.tsx).
 */
export function PageGround({ docKey, layout, children }: { docKey: DocKey; layout: LayoutKind; children: ReactNode }) {
  // The menu / web-app product doc is the sheet's body, not a page: the sheet stage frames it (spec §11).
  if (docKey === 'product' && layout !== 'storefront') {
    return <div data-sf-builder-canvas="" className={styles.ground} data-layout={layout}><SheetStage>{children}</SheetStage></div>;
  }
  // A card doc is one card: the card stage sets it in the real grid / rows list beside its state copies.
  if (isCardKey(docKey)) {
    return (
      <div data-sf-builder-canvas="" className={styles.ground} data-layout={layout}>
        <div className={styles.column} data-sf-builder-column=""><CardStage kind={cardKind(docKey)}>{children}</CardStage></div>
      </div>
    );
  }
  // The cart doc is a page on phones and a drawer on desktop shops: switch between them (stage 4 §11.3). The web app has no drawer.
  if (docKey === 'cart' && layout !== 'webapp') {
    return (
      <div data-sf-builder-canvas="" className={styles.ground} data-layout={layout}>
        <CartStage column={(c) => <div className={styles.column} data-sf-builder-column="">{c}</div>}>{children}</CartStage>
      </div>
    );
  }
  return (
    <div data-sf-builder-canvas="" className={styles.ground} data-layout={layout}>
      {docKey === 'shell' ? children : <div className={styles.column} data-sf-builder-column="">{docKey === 'checkout' ? <CheckoutNote /> : null}{children}</div>}
    </div>
  );
}
