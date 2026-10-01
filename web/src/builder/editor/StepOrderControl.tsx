import { useEffect, useId, useRef, useState } from 'react';
import type { StepKind } from '@/builder/family-checkout.ts';
import { stepRows } from '@/builder/editor/step-order.ts';
import styles from '@/builder/editor/ContainerPanel.module.css';

/** The five checkout steps in stored order with ↑ / ↓: only the four legal orders are reachable. */
export function StepOrderControl({ order, onMove }: { order: readonly StepKind[]; onMove: (kind: StepKind, dir: -1 | 1) => void }) {
  const id = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const rootRef = useRef<HTMLOListElement>(null);
  // The row moves when its arrow is pressed: focus follows the step, to the same arrow if it still works.
  const [focus, setFocus] = useState<{ kind: StepKind; dir: -1 | 1 } | null>(null);
  const rows = stepRows(order);
  useEffect(() => {
    if (!focus) return;
    const row = rows.find((r) => r.kind === focus.kind);
    const ask = (dir: -1 | 1) => rootRef.current?.querySelector<HTMLButtonElement>(`[data-step="${focus.kind}"][data-dir="${dir}"]`);
    const same = ask(focus.dir);
    const target = same && same.getAttribute('aria-disabled') !== 'true' ? same : row ? ask(focus.dir === -1 ? 1 : -1) : null;
    target?.focus();
    setFocus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const press = (kind: StepKind, dir: -1 | 1) => {
    // A blocked arrow stays focusable (its reason is read with it) and does nothing.
    if (!(dir === -1 ? rows.find((r) => r.kind === kind)?.up : rows.find((r) => r.kind === kind)?.down)?.ok) return;
    setFocus({ kind, dir });
    onMove(kind, dir);
  };
  return (
    <section className={styles.section} aria-labelledby={`${id}-steps`}>
      <h3 id={`${id}-steps`} className={styles.title}>Step order</h3>
      <ol ref={rootRef} role="list" aria-label="Step order" className={styles.steps}>
        {rows.map((row, i) => (
          <li key={row.kind} className={styles.step} data-step-row={row.kind}>
            <span className={styles.stepNumber} aria-hidden="true">{i + 1}</span>
            <span className={styles.stepLabel}>{row.label}</span>
            <button
              type="button" className={styles.stepMove} data-step={row.kind} data-dir="-1"
              aria-label={`Move ${row.label} up`} aria-disabled={!row.up.ok} title={row.up.ok ? undefined : row.up.reason}
              aria-describedby={row.up.ok ? undefined : `${id}-${row.kind}-up`}
              onClick={() => press(row.kind, -1)}
            >
              <span aria-hidden="true">↑</span>
            </button>
            {!row.up.ok && <span id={`${id}-${row.kind}-up`} className={styles.visuallyHidden}>{row.up.reason}</span>}
            <button
              type="button" className={styles.stepMove} data-step={row.kind} data-dir="1"
              aria-label={`Move ${row.label} down`} aria-disabled={!row.down.ok} title={row.down.ok ? undefined : row.down.reason}
              aria-describedby={row.down.ok ? undefined : `${id}-${row.kind}-down`}
              onClick={() => press(row.kind, 1)}
            >
              <span aria-hidden="true">↓</span>
            </button>
            {!row.down.ok && <span id={`${id}-${row.kind}-down`} className={styles.visuallyHidden}>{row.down.reason}</span>}
            {row.kind === 'review' && <span className={styles.stepNote}>{row.down.reason}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
