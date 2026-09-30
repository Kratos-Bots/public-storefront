import { Component, Suspense, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { parseBlockProps, type BlockDef, type BlockRenderContext } from '@/builder/define.ts';
import type { ComponentData, DocKey, LayoutKind } from '@/builder/types.ts';
import { stableStringify } from '@/builder/editor/page-set.ts';
import { usePuck } from '@/builder/editor/use-puck.ts';
import { prepareProps } from '@/builder/editor/prepare.ts';
import { renderBlock } from '@/builder/style/apply.tsx';
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

/**
 * While editing, Puck hands `*Html` props to blocks as React nodes (its inline richtext editor),
 * not strings. The schema only accepts strings, so each node is swapped for a marker before the
 * parse and put back after it — wherever the marker ended up (array items may have been dropped).
 * Markers are plain strings, so the parsed settings stay serialisable for the boundary's reset key.
 */
const RICHTEXT_MARK = '\u0000sfb-richtext:';

const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

function stashRichtext(value: unknown, nodes: unknown[]): unknown {
  if (Array.isArray(value)) return value.map((v) => stashRichtext(v, nodes));
  if (!isPlain(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (key.endsWith('Html') && v !== undefined && v !== null && typeof v !== 'string') {
      nodes.push(v);
      out[key] = `${RICHTEXT_MARK}${nodes.length - 1}`;
    } else {
      out[key] = stashRichtext(v, nodes);
    }
  }
  return out;
}

function restoreRichtext(value: unknown, nodes: readonly unknown[]): unknown {
  if (typeof value === 'string') return value.startsWith(RICHTEXT_MARK) ? nodes[Number(value.slice(RICHTEXT_MARK.length))] : value;
  if (Array.isArray(value)) return value.map((v) => restoreRichtext(v, nodes));
  if (!isPlain(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) out[key] = restoreRichtext(v, nodes);
  return out;
}

/** Rendered as its own component so the block's hooks and throws stay inside the boundary. */
function BlockBody({ def, props, ctx }: { def: BlockDef<any>; props: Record<string, unknown>; ctx: BlockRenderContext }) {
  return <>{renderBlock(def, props, ctx)}</>;
}

/** Puck's slot functions carry no items: attach the stored arrays, read from Puck's own state (spec §3.2). */
function withItems(slots: Record<string, unknown>, stored: ComponentData | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(slots)) {
    const value = stored?.props[name];
    const items = Array.isArray(value) ? (value as ComponentData[]) : [];
    out[name] = typeof fn === 'function' ? Object.assign((p?: unknown) => (fn as (p?: unknown) => unknown)(p), { items }) : fn;
  }
  return out;
}

/**
 * The block's stored data from Puck's state, or undefined outside `<Puck>` (unit tests render
 * EditorBlock bare). Puck's hook throws before its store subscription when there is no `<Puck>`,
 * and a mounted block never gains or loses one, so the hook order is stable per mount.
 */
function useStoredItem(id: unknown): ComponentData | undefined {
  try {
    return usePuck((s) => (typeof id === 'string' ? (s.getItemById(id) as ComponentData | undefined) : undefined));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('usePuck must be used inside <Puck>')) return undefined;
    throw error;
  }
}

/** Only slotted blocks read Puck's state, so slot-less blocks never touch it. */
function SlottedBody({ id, slots, children }: { id: unknown; slots: Record<string, unknown>; children: (slots: Record<string, unknown>) => ReactNode }) {
  const stored = useStoredItem(id);
  return <>{children(withItems(slots, stored))}</>;
}

/**
 * Nothing a person could see or click: no element and no text — or only a style wrapper around
 * nothing (a styled wrap block that rendered null; the stylesheet's :empty rule hides it).
 */
const isEmpty = (el: HTMLElement): boolean => {
  const first = el.firstElementChild;
  const onlyEmptyWrapper = first !== null && first === el.lastElementChild
    && first.matches('[data-sf-style]:not([data-sf-block])') && first.childElementCount === 0;
  return (first === null || onlyEmptyWrapper) && !(el.textContent ?? '').trim();
};

/**
 * Many blocks render nothing when their content is blank (an empty Heading, a quote-less
 * Testimonial, a field the guard left blank). On the published page that is right; on the canvas
 * the block would vanish and could no longer be clicked or selected. This watches what the block
 * actually rendered — it may be a nested component returning null — and shows a small editor-only
 * placeholder while it is empty. The wrapper is `display: contents`, so it never affects layout.
 */
function EmptyWatch({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setEmpty(isEmpty(el));
    check();
    const observer = new MutationObserver(check);
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <div ref={ref} style={{ display: 'contents' }}>{children}</div>
      {empty && (
        <div className={styles.empty} data-sf-builder-empty="">
          {label} has nothing to show yet.
        </div>
      )}
    </>
  );
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
  const nodes: unknown[] = [];
  const parsed = parseBlockProps(def, stashRichtext(prepareProps(def.name, rest), nodes) as Record<string, unknown>);
  const settings = nodes.length > 0 ? (restoreRichtext(parsed, nodes) as Record<string, unknown>) : parsed;
  const ctx: BlockRenderContext = { editing: true, docKey, layout };
  return (
    <BlockBoundary name={def.label} resetKey={stableStringify(parsed)}>
      <Suspense fallback={<div className={styles.loading} aria-busy="true" aria-label={`Loading ${def.label}`} />}>
        <EmptyWatch label={def.label}>
          {def.slots.length === 0
            ? <BlockBody def={def} props={{ ...settings, ...slots, id }} ctx={ctx} />
            : <SlottedBody id={id} slots={slots}>{(s) => <BlockBody def={def} props={{ ...settings, ...s, id }} ctx={ctx} />}</SlottedBody>}
        </EmptyWatch>
      </Suspense>
    </BlockBoundary>
  );
}
