import { useState } from 'react';
import type { Issue } from '@/builder/types.ts';
import { blockDef } from '@/builder/rules.ts';
import { applyToBlock, containerOf, resetArrangement, resetStepOrder } from '@/builder/editor/container-actions.ts';
import { ownerBlockCount } from '@/builder/editor/container-parts.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { useGetPuck, usePuck } from '@/builder/editor/use-puck.ts';
import type { ComponentData } from '@/builder/types.ts';
import styles from '@/builder/editor/QuickFix.module.css';

export type QuickFixKind = 'step-order' | 'arrangement';

/** The one-click repair for an arrangement issue, or null when the issue has none (spec 10.4). */
export function quickFixFor(rule: string): QuickFixKind | null {
  if (rule === 'part-order:CheckoutFlow') return 'step-order';
  if (/^(?:part-home|part-placement|slot-accepts):/.test(rule) || rule === 'part-order:OrderStatus') return 'arrangement';
  return null;
}

export const QUICK_FIX_LABEL: Readonly<Record<QuickFixKind, string>> = { 'step-order': 'Reset step order', arrangement: 'Reset arrangement' };

/**
 * A button under an issue row that fixes it in the open canvas: Reset step order puts the checkout
 * steps back in the default order (content stays); Reset arrangement is the container panel's
 * button, run on the issue's container. Rendered inside <Puck> (the issues menu lives in its header).
 */
export function IssueQuickFix({ issue }: { issue: Issue }) {
  const docKey = useEditorStore((s) => s.docKey);
  const layout = useEditorStore((s) => s.layout);
  const dispatch = usePuck((s) => s.dispatch);
  const getPuck = useGetPuck();
  const [status, setStatus] = useState('');
  const kind = quickFixFor(issue.rule);
  if (!kind || issue.docKey !== docKey || !issue.blockId) return null;
  const container = containerOf(getPuck().appState.data.content as ComponentData[], issue.blockId);
  const id = container?.props.id;
  if (!container || typeof id !== 'string') return null;
  const run = () => {
    const done = applyToBlock(getPuck, dispatch, id, (cur) => (kind === 'step-order' ? resetStepOrder(cur) : resetArrangement(cur, layout)));
    if (done) setStatus(`${QUICK_FIX_LABEL[kind]} done on ${blockDef(container.type)?.label ?? container.type}`);
  };
  const owned = kind === 'arrangement' ? ownerBlockCount(container) : 0;
  return (
    <div className={styles.row}>
      <button
        type="button" className={styles.fix}
        title={kind === 'arrangement' ? `Puts every part back where it starts${owned > 0 ? `; removes ${owned} block${owned === 1 ? '' : 's'} you added` : ''}` : 'Puts the steps back in the default order; nothing inside them changes'}
        onClick={run}
      >
        {QUICK_FIX_LABEL[kind]}
      </button>
      <span className={styles.status} role="status">{status}</span>
    </div>
  );
}
