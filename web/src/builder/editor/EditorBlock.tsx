import { Component, Suspense, type ReactNode } from 'react';
import { parseBlockProps, type BlockDef, type BlockRenderContext } from '@/builder/define.ts';
import type { DocKey, LayoutKind } from '@/builder/types.ts';
import { stableStringify } from '@/builder/editor/page-set.ts';
import { prepareProps } from '@/builder/editor/config.ts';
import styles from '@/builder/editor/EditorBlock.module.css';

interface BoundaryProps {
  name: string;
  /** Changes whenever the block's settings do: a crashed block gets another try after an edit. */
  resetKey: string;
  children: ReactNode;
}

class BlockBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn(`[builder] ${this.props.name} failed to render in the editor`, error);
  }
  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed) {
      return (
        <div className={styles.notice} role="note" data-sf-builder-block-error="">
          <strong className={styles.noticeTitle}>{this.props.name} can’t show here</strong>
          <span>Check its settings in the panel. The rest of the page is unaffected.</span>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Rendered as its own component so the block's hooks and throws stay inside the boundary. */
function BlockBody({ def, props, ctx }: { def: BlockDef<any>; props: Record<string, unknown>; ctx: BlockRenderContext }) {
  return <>{def.render({ ...props, puck: ctx } as never)}</>;
}

/**
 * One block on the Puck canvas. Its settings go through the same per-field parse the published
 * page uses (a half-typed value falls back to the default instead of crashing the block), while
 * slot props stay the render functions Puck hands in.
 */
export function EditorBlock({ def, props, docKey, layout }: { def: BlockDef<any>; props: Record<string, unknown>; docKey: DocKey; layout: LayoutKind }) {
  if (def.name === 'PageOutlet') {
    return (
      <div className={styles.outlet} data-sf-builder-outlet="">
        <span className={styles.outletLabel}>Page content appears here</span>
        <span className={styles.outletSub}>Each page fills this space with its own blocks.</span>
      </div>
    );
  }
  // Puck adds its own context under `puck` and an `editMode` flag; blocks get ours instead.
  const rest: Record<string, unknown> = { ...props };
  delete rest.puck;
  delete rest.editMode;
  const id = rest.id;
  const slots: Record<string, unknown> = {};
  for (const slot of def.slots) {
    slots[slot] = rest[slot];
    rest[slot] = [];
  }
  const settings = parseBlockProps(def, prepareProps(def.name, rest));
  const ctx: BlockRenderContext = { editing: true, docKey, layout };
  return (
    <BlockBoundary name={def.label} resetKey={stableStringify(settings)}>
      <Suspense fallback={<div className={styles.loading} aria-busy="true" aria-label={`Loading ${def.label}`} />}>
        <BlockBody def={def} props={{ ...settings, ...slots, id }} ctx={ctx} />
      </Suspense>
    </BlockBoundary>
  );
}
