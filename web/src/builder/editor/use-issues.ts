import { useMemo } from 'react';
import { collectIssues, docFor, type DocMap } from '@/builder/editor/page-set.ts';
import { editorHints, lockedPresent, type EditorHint } from '@/builder/editor/config.ts';
import { prepareDocs } from '@/builder/editor/prepare.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import type { Issue, LayoutKind, PuckDoc } from '@/builder/types.ts';

/*
 * Derived editor state. Every block overlay on the canvas reads the issue list, so it is computed
 * once per (docs, layout) for the whole editor — not once per overlay.
 */
let last: { docs: DocMap; layout: LayoutKind; issues: Issue[] } | null = null;

function issuesFor(docs: DocMap, layout: LayoutKind): Issue[] {
  if (last && last.docs === docs && last.layout === layout) return last.issues;
  // From the PREPARED docs, exactly as the session posts them, so header and admin agree.
  const issues = collectIssues(prepareDocs(docs), layout);
  last = { docs, layout, issues };
  return issues;
}

/** Every blocking issue in the set being edited (exactly what the admin receives). */
export function useIssues(): Issue[] {
  const docs = useEditorStore((s) => s.docs);
  const layout = useEditorStore((s) => s.layout);
  return useMemo(() => issuesFor(docs, layout), [docs, layout]);
}

/** The open doc as the store holds it (its default when untouched). Stable until that doc changes. */
export function useCurrentDoc(): PuckDoc {
  const stored = useEditorStore((s) => s.docs[s.docKey]);
  const docKey = useEditorStore((s) => s.docKey);
  const layout = useEditorStore((s) => s.layout);
  // docFor only reads docs[docKey]; `stored` is that entry, so it is the right dependency.
  return useMemo(() => docFor(stored ? { [docKey]: stored } : {}, docKey, layout), [stored, docKey, layout]);
}

/** Advice for the open doc: shown next to issues, never sent to the admin, never blocks Publish. */
export function useHints(): EditorHint[] {
  const doc = useCurrentDoc();
  const docKey = useEditorStore((s) => s.docKey);
  return useMemo(() => editorHints(doc, docKey), [doc, docKey]);
}

/**
 * The open doc's exactly-one blocks that are already on it. The selector returns their sorted
 * names as one string, so the Set (and anything memoised on it, like the Puck config) only changes
 * when that list does — not on every edit.
 */
export function useLockedPresent(): ReadonlySet<string> {
  const doc = useCurrentDoc();
  const docKey = useEditorStore((s) => s.docKey);
  const names = useMemo(() => [...lockedPresent(doc, docKey)].sort().join('\n'), [doc, docKey]);
  return useMemo(() => new Set(names ? names.split('\n') : []), [names]);
}
