import { Component, useMemo, type ReactNode } from 'react';
import { BLOCKS } from '@/builder/registry.ts';
import { useBuilderMode } from '@/builder/mode.ts';
import type { BlockRenderContext, SlotRender } from '@/builder/define.ts';
import type { ComponentData, DocKey, LayoutKind, PuckDoc } from '@/builder/types.ts';

const logged = new Set<string>();

interface BlockBoundaryProps { name: string; blockId: string; rethrow: boolean; children: ReactNode }
interface BlockBoundaryState { failed: boolean; error: unknown }

/** Spec §5.6: a broken block renders nothing — unless it is a route-bound flow, which takes the page to its default. */
export class BlockBoundary extends Component<BlockBoundaryProps, BlockBoundaryState> {
  state: BlockBoundaryState = { failed: false, error: null };
  static getDerivedStateFromError(error: unknown): BlockBoundaryState {
    return { failed: true, error };
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

interface DocBoundaryProps { docKey: DocKey; fallback: ReactNode; children: ReactNode }
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
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function renderItems(items: readonly ComponentData[], ctx: BlockRenderContext): ReactNode[] {
  return items.map((item) => <BlockNode key={`${item.type}:${item.props.id}`} item={item} ctx={ctx} />);
}

function slotRender(value: unknown, ctx: BlockRenderContext): SlotRender {
  const items = Array.isArray(value) ? (value as ComponentData[]) : [];
  return (p) => {
    const children = renderItems(items, ctx);
    if (!p || (p.className === undefined && p.style === undefined && p.as === undefined)) return <>{children}</>;
    const As = p.as ?? 'div';
    return <As className={p.className} style={p.style}>{children}</As>;
  };
}

function BlockBody({ item, ctx }: { item: ComponentData; ctx: BlockRenderContext }) {
  const def = BLOCKS[item.type]!;
  const props: Record<string, unknown> = { ...item.props, puck: ctx };
  for (const s of def.slots) props[s] = slotRender(item.props[s], ctx);
  return <>{def.render(props as never)}</>;
}

function BlockNode({ item, ctx }: { item: ComponentData; ctx: BlockRenderContext }) {
  const def = BLOCKS[item.type];
  if (!def) return null;
  return (
    <BlockBoundary name={item.type} blockId={item.props.id} rethrow={def.routeBound}>
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
