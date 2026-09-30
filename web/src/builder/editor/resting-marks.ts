import { forEachComponent } from '@/builder/editor/page-set.ts';
import { isLockedOn } from '@/builder/editor/route-bound.ts';
import type { DocKey, Issue, PuckDoc } from '@/builder/types.ts';

/**
 * Spec §6: offending blocks are highlighted and route-bound blocks carry a lock — at rest, not only
 * on hover. Puck 0.23 draws its component overlay (where our hover badge lives) only while a block
 * is hovered or selected, so the resting marks are a stylesheet keyed on the `data-puck-component`
 * attribute Puck sets on each block's root element. Outlines only: they never shift layout, work
 * on any element (an ::after badge wouldn't show on an <img> root, and needs `position` changes).
 */

/** Ids of the blocks to mark on the open doc. */
export function restingMarkIds(doc: PuckDoc, docKey: DocKey, issues: readonly Issue[]): { issue: string[]; lock: string[] } {
  const issue = new Set<string>();
  for (const i of issues) if (i.docKey === docKey && i.blockId) issue.add(i.blockId);
  const lock: string[] = [];
  forEachComponent(doc.content, (c) => {
    const id = c.props.id;
    if (typeof id === 'string' && isLockedOn(c.type, docKey) && !issue.has(id)) lock.push(id);
  });
  return { issue: [...issue].sort(), lock: lock.sort() };
}

/** A string safe inside a double-quoted CSS attribute value. */
export function cssString(value: string): string {
  return value.replace(/[\\"]/g, '\\$&').replace(/[\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `).replace(/</g, '\\3c ');
}

const SCOPE = '[data-sf-builder-canvas]';

/** The stylesheet for the resting marks; '' when there is nothing to mark. */
export function restingMarksCss(marks: { issue: readonly string[]; lock: readonly string[] }): string {
  const rules: string[] = [];
  const sel = (ids: readonly string[]) => ids.map((id) => `${SCOPE} [data-puck-component="${cssString(id)}"]`).join(',\n');
  if (marks.issue.length > 0) {
    rules.push(`${sel(marks.issue)} {\n  outline: 2px dashed var(--sfb-mark-issue);\n  outline-offset: -2px;\n}`);
  }
  if (marks.lock.length > 0) {
    rules.push(`${sel(marks.lock)} {\n  outline: 1px dashed var(--sfb-mark-lock);\n  outline-offset: -1px;\n}`);
  }
  if (rules.length === 0) return '';
  // Editor-only tokens, declared where the marks apply (the canvas root), never on the shop's :root.
  return [`${SCOPE} {\n  --sfb-mark-issue: #b7791f;\n  --sfb-mark-lock: #8a93a3;\n}`, ...rules].join('\n');
}
