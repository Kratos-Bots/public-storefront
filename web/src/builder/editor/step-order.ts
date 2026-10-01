import {
  DEFAULT_STEP_ORDER, STEP_KINDS, STEP_TYPE, isLegalStepOrder, stepKindsOf, stepOrderProblem, type StepKind, type StepOrderProblem,
} from '@/builder/family-checkout.ts';
import type { ComponentData } from '@/builder/types.ts';

// Pure: no Puck, no registry. The Step order control and the issue quick fix both build on it.

/** One arrow of a step row: `reason` is the tooltip text, '' when the move is allowed. */
export interface StepMove { ok: boolean; reason: string }
export interface StepRow { kind: StepKind; label: string; up: StepMove; down: StepMove }

/** What the owner sees for each step (the step parts' own labels). */
export const STEP_LABEL: Readonly<Record<StepKind, string>> = {
  contact: 'Your details', address: 'Delivery address', shipping: 'Delivery', payment: 'Payment', review: 'Review',
};

const REVIEW_REASON = 'Always last — it holds Place order';
const END_REASON = 'Already at the end';
const NOT_FULL_REASON = 'Needs all five steps on the page';
const PROBLEM_REASON: Readonly<Record<StepOrderProblem, string>> = {
  'address-first': 'Delivery needs the address first',
  'payment-last': 'Payment must come after Delivery',
  'review-last': 'Review is always last',
};

const swapped = (order: readonly StepKind[], i: number, j: number): StepKind[] => {
  const next = [...order];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
};

function moveAt(order: readonly StepKind[], index: number, dir: -1 | 1): StepMove {
  if (order[index] === 'review') return { ok: false, reason: REVIEW_REASON };
  const to = index + dir;
  if (to < 0 || to >= order.length) return { ok: false, reason: END_REASON };
  const next = swapped(order, index, to);
  if (isLegalStepOrder(next)) return { ok: true, reason: '' };
  return { ok: false, reason: stepOrderProblem(next) ? PROBLEM_REASON[stepOrderProblem(next)!] : NOT_FULL_REASON };
}

/** One row per step in `order`, each arrow judged by whether the adjacent swap is one of the four legal orders. */
export function stepRows(order: readonly StepKind[]): StepRow[] {
  return order.map((kind, i) => ({ kind, label: STEP_LABEL[kind], up: moveAt(order, i, -1), down: moveAt(order, i, 1) }));
}

/** `order` with `kind` moved one place, or null when that is not a legal order. */
export function moveStep(order: readonly StepKind[], kind: StepKind, dir: -1 | 1): StepKind[] | null {
  const i = order.indexOf(kind);
  if (i < 0 || !moveAt(order, i, dir).ok) return null;
  return swapped(order, i, i + dir);
}

/**
 * The checkout container with its `steps` in `order`: each step keeps its own props, slots and id.
 * A kind not listed, and anything that is not a step, keeps its place after the listed ones.
 */
export function withStepOrder(checkoutFlow: ComponentData, order: readonly StepKind[]): ComponentData {
  const steps = Array.isArray(checkoutFlow.props.steps) ? (checkoutFlow.props.steps as ComponentData[]) : null;
  if (!steps) return checkoutFlow;
  const used = new Set<ComponentData>();
  const ordered: ComponentData[] = [];
  for (const kind of order) {
    for (const s of steps) if (s.type === STEP_TYPE[kind] && !used.has(s)) { used.add(s); ordered.push(s); }
  }
  return { ...checkoutFlow, props: { ...checkoutFlow.props, steps: [...ordered, ...steps.filter((s) => !used.has(s))] } };
}

/** The kinds of the steps stored in a checkout container, in stored order. */
export function storedStepOrder(checkoutFlow: ComponentData): StepKind[] {
  const steps = Array.isArray(checkoutFlow.props.steps) ? (checkoutFlow.props.steps as ComponentData[]) : [];
  return stepKindsOf(steps.map((s) => s.type));
}

export { DEFAULT_STEP_ORDER, STEP_KINDS };
