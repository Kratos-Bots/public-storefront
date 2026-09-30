import type { ReactNode } from 'react';
import type { DocKey, LayoutKind } from '@/builder/types.ts';
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
  return (
    <div data-sf-builder-canvas="" className={styles.ground} data-layout={layout}>
      {docKey === 'shell' ? children : <div className={styles.column} data-sf-builder-column="">{children}</div>}
    </div>
  );
}
