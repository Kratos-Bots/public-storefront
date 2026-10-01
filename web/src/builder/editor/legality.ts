import { checkRules } from '@/builder/rules.ts';
import type { DocKey, LayoutKind, PuckDoc } from '@/builder/types.ts';

/** The rules that say "this part can't be there": a drop that breaks one is undone at once. */
const ARRANGEMENT_RULE = /^(?:part-home|part-placement|part-order|slot-accepts|slot-rejects):/;

/**
 * The message of the first arrangement issue `next` has that `prev` did not (by rule id), or null.
 * An already-illegal stored document is never reverted over an unrelated edit: only a rule that
 * is new with this change counts.
 */
export function introducesIllegal(prev: PuckDoc, next: PuckDoc, docKey: DocKey, layout: LayoutKind): string | null {
  const before = new Set(checkRules(prev, docKey, layout).map((i) => i.rule));
  const hit = checkRules(next, docKey, layout).find((i) => ARRANGEMENT_RULE.test(i.rule) && !before.has(i.rule));
  return hit ? hit.message : null;
}
