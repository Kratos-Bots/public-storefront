import { Component, useMemo, type ReactNode } from 'react';
import { blockDef } from '@/builder/rules.ts';
import { useBuilderMode } from '@/builder/mode.ts';
import type { BlockRenderContext, SlotRender } from '@/builder/define.ts';
import type { ComponentData, DocKey, LayoutKind, PuckDoc } from '@/builder/types.ts';
import { renderBlock } from '@/builder/style/apply.tsx';
import { FAMILY_DOC } from '@/builder/parts.ts';

const logged = new Set<string>();

interface BlockBoundaryProps { name: string; blockId: string; rethrow: boolean; resetKey: string; children: ReactNode }
interface BlockBoundaryState { failed: boolean; error: unknown; forKey: string }

/** Spec §5.6: a broken block renders nothing — unless it is a route-bound flow, which takes the page to its default. */
export class BlockBoundary extends Component<BlockBoundaryProps, BlockBoundaryState> {
  state: BlockBoundaryState = { failed: false, error: null, forKey: this.props.resetKey };
  static getDerivedStateFromError(error: unknown): Partial<BlockBoundaryState> {
    return { failed: true, error };
  }
  /** A block that failed on one route gets a fresh attempt on the next (block ids are shared across routes). */
  static getDerivedStateFromProps(props: BlockBoundaryProps, state: BlockBoundaryState): Partial<BlockBoundaryState> | null {
    return props.resetKey !== state.forKey ? { failed: false, error: null, forKey: props.resetKey } : null;
  }
  componentDidCatch(error: unknown) {
    const key = `${this.props.name} (${this.props.blockId})`;
    if (logged.has(key)) return;
    logged.add(key);
    console.error(`[builder] block ${key} failed to render`, error);
  }
  render() {
    if (this.state.failed) {
      if (this.props.rethrow) throw this.state.error;
      return null;
    }
    return this.props.children;
  }
}

interface DocBoundaryProps { docKey: DocKey; fallback: ReactNode; children: ReactNode; onFallback?: () => void }
interface DocBoundaryState { failed: boolean; forKey: DocKey }

/** Around a published document: on a throw, render the route's default instead (which may itself throw upward). */
export class DocBoundary extends Component<DocBoundaryProps, DocBoundaryState> {
  state: DocBoundaryState = { failed: false, forKey: this.props.docKey };
  static getDerivedStateFromError(): Partial<DocBoundaryState> {
    return { failed: true };
  }
  static getDerivedStateFromProps(props: DocBoundaryProps, state: DocBoundaryState): Partial<DocBoundaryState> | null {
    return props.docKey !== state.forKey ? { failed: false, forKey: props.docKey } : null;
  }
  componentDidCatch(error: unknown) {
    console.error(`[builder] "${this.props.docKey}" failed to render — showing the default page`, error);
    this.props.onFallback?.();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function renderItems(items: readonly ComponentData[], ctx: BlockRenderContext): ReactNode[] {
  return items.map((item) => <BlockNode key={`${item.type}:${item.props.id}`} item={item} ctx={ctx} />);
}

/** A slot prop at render time, with the stored items attached (spec §3.2). */
export function slotRender(value: unknown, ctx: BlockRenderContext): SlotRender {
  const items = Array.isArray(value) ? (value as ComponentData[]) : [];
  const fn = (p?: Parameters<SlotRender>[0]) => {
    const children = renderItems(items, ctx);
    if (!p || (p.className === undefined && p.style === undefined && p.as === undefined)) return <>{children}</>;
    const As = p.as ?? 'div';
    return <As className={p.className} style={p.style}>{children}</As>;
  };
  return Object.assign(fn, { items });
}

export function slotRenders(slots: Readonly<Record<string, readonly ComponentData[]>>, ctx: BlockRenderContext): Record<string, SlotRender> {
  const out: Record<string, SlotRender> = {};
  for (const [name, items] of Object.entries(slots)) out[name] = slotRender(items, ctx);
  return out;
}

/**
 * A container's default arrangement as slot renders: the feature components' no-argument entry
 * points (tests, v0.7.0 call sites) draw exactly what the default document draws.
 */
export function defaultSlotRenders(type: string, layout: LayoutKind, props: Record<string, unknown> = {}): Record<string, SlotRender> {
  const def = blockDef(type);
  const spec = def?.container;
  if (!spec) return {};
  const id = `${type}-default`;
  return slotRenders(spec.defaultSlots(props, { layout, id }), { editing: false, docKey: FAMILY_DOC[spec.family], layout });
}

function BlockBody({ item, ctx }: { item: ComponentData; ctx: BlockRenderContext }) {
  const def = blockDef(item.type)!;
  const props: Record<string, unknown> = { ...item.props };
  for (const s of def.slots) props[s] = slotRender(item.props[s], ctx);
  return <>{renderBlock(def, props, ctx)}</>;
}

function BlockNode({ item, ctx }: { item: ComponentData; ctx: BlockRenderContext }) {
  // Own-key lookup: an unguarded `type: "constructor"` must not resolve to Object.
  const def = blockDef(item.type);
  if (!def) return null;
  return (
    <BlockBoundary name={item.type} blockId={item.props.id} rethrow={def.routeBound} resetKey={ctx.docKey}>
      <BlockBody item={item} ctx={ctx} />
    </BlockBoundary>
  );
}

/** Our own renderer over Puck's Data format (spec §13 A1). Expects a guarded document. */
export function RenderDoc({ doc, docKey, layout }: { doc: PuckDoc; docKey: DocKey; layout: LayoutKind }): ReactNode {
  const { editing } = useBuilderMode();
  const ctx = useMemo<BlockRenderContext>(() => ({ editing, docKey, layout }), [editing, docKey, layout]);
  return <>{renderItems(doc.content, ctx)}</>;
}
