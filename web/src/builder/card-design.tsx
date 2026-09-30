import { Component, createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { compileCard, type CardDesign } from '@/builder/cards.ts';
import type { CardKind, LayoutKind, PageSet } from '@/builder/types.ts';

interface CardDesignState { tile: CardDesign | null; row: CardDesign | null; fail(kind: CardKind): void }
const Ctx = createContext<CardDesignState | null>(null);
const logged = new Set<CardKind>();

/** Test hook: forget which kinds have already logged a failure. */
export function resetCardDesignLog(): void {
  logged.clear();
}

/** Spec §6.2: the layout's card designs, compiled once; a kind that threw stays built-in for this page load. */
export function CardDesignProvider({ cards, layout, children }: { cards: PageSet['cards'] | undefined; layout: LayoutKind; children: ReactNode }) {
  const [failed, setFailed] = useState<ReadonlySet<CardKind>>(() => new Set());
  const fail = useCallback((kind: CardKind) => setFailed((s) => (s.has(kind) ? s : new Set([...s, kind]))), []);
  // compileCard is memoised per (doc object, layout): these are map lookups after the first render.
  const tile = cards?.tile && !failed.has('tile') ? compileCard(cards.tile, 'tile', layout) : null;
  const row = cards?.row && !failed.has('row') ? compileCard(cards.row, 'row', layout) : null;
  const value = useMemo(() => ({ tile, row, fail }), [tile, row, fail]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The compiled design for `kind`, or null (no design, invalid, failed, or no provider) ⇒ built-in. */
export function useCardDesign(kind: CardKind): CardDesign | null {
  return useContext(Ctx)?.[kind] ?? null;
}

interface BoundaryProps { kind: CardKind; active: boolean; fail: (kind: CardKind) => void; children: ReactNode }
class Boundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  /** Once the provider has dropped the design, try again: the children now render the built-in card. */
  static getDerivedStateFromProps(props: BoundaryProps, state: { failed: boolean }) { return state.failed && !props.active ? { failed: false } : null; }
  componentDidCatch(error: unknown) {
    if (!logged.has(this.props.kind)) {
      logged.add(this.props.kind);
      console.error(`[builder] card design "${this.props.kind}" failed to render — showing the built-in card`, error);
    }
    this.props.fail(this.props.kind);
  }
  render() { return this.state.failed ? null : this.props.children; }
}

/** One per card list (spec §6.3). Adds no DOM. */
export function CardDesignBoundary({ kind, children }: { kind: CardKind; children: ReactNode }) {
  const state = useContext(Ctx);
  if (!state) return <>{children}</>;
  return <Boundary kind={kind} active={state[kind] !== null} fail={state.fail}>{children}</Boundary>;
}
