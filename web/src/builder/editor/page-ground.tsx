import type { ReactNode } from 'react';
import type { DocKey, LayoutKind } from '@/builder/types.ts';
import styles from '@/builder/editor/PageGround.module.css';

/**
 * What a page stands on in the storefront, reproduced for the editor canvas, the exact preview and
 * the read-only view: the shop's ground and ink (global.css paints them on body; Puck's canvas is
 * white), and — for page docs — the shell's content column (its max width and the --sf-main-pad
 * inset that full-bleed blocks escape). The shell doc brings its own chrome, so it gets no column.
 *
 * `data-sf-builder-canvas` scopes the resting marks and the link lock (fixture-routes.tsx).
 */
export function PageGround({ docKey, layout, children }: { docKey: DocKey; layout: LayoutKind; children: ReactNode }) {
  return (
    <div data-sf-builder-canvas="" className={styles.ground}>
      {docKey === 'shell' ? children : <div className={styles.column} data-layout={layout} data-sf-builder-column="">{children}</div>}
    </div>
  );
}
