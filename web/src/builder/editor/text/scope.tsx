import { useMemo, type ReactNode } from 'react';
import { PageSetOverrideProvider } from '@/builder/runtime.tsx';
import { toPageSet } from '@/builder/editor/page-set.ts';
import { prepareDocs } from '@/builder/editor/prepare.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { useEditorText } from '@/builder/editor/text/hooks.ts';

/**
 * Everything on the canvas resolves text from the editor's drafts, re-resolved on every keystroke
 * (spec §7.2). It subscribes to the store itself so the Puck element passed as `children` keeps its
 * identity and is not re-rendered by an edit — only text consumers update.
 *
 * The text layer provider also sets `<html lang>` and the format profile; the builder frame is one
 * document, so the store language applies to the whole of it (editor chrome included), by design.
 */
export function CanvasTextScope({ children }: { children: ReactNode }) {
  const docs = useEditorStore((s) => s.docs);
  const layout = useEditorStore((s) => s.layout);
  const pageText = useEditorStore((s) => s.pageText);
  const text = useEditorText();
  const pageSet = useMemo(() => toPageSet(prepareDocs(docs), layout, pageText), [docs, layout, pageText]);
  return <PageSetOverrideProvider pageSet={pageSet} text={text}>{children}</PageSetOverrideProvider>;
}
