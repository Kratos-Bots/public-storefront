import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BuilderModeProvider } from '@/builder/mode.ts';
import { startBuilderSession } from '@/builder/editor/session.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { FixtureRoutes, useNavigationLock } from '@/builder/editor/fixture-routes.tsx';
import { EditorCanvas } from '@/builder/editor/EditorCanvas.tsx';
import styles from '@/builder/editor/Editor.module.css';

/**
 * One session per frame boot (session.ts): each start creates a bridge, and each bridge announces
 * sf-builder-ready. A StrictMode-doubled effect would start two, and an effect would also run after
 * the children's effects — too late, since fixture mode and the api interceptor must be in place
 * before any query fires. So it starts during the first render, guarded at module level, and lives
 * as long as the frame (this chunk only ever loads inside the admin's builder frame).
 */
let stopSession: (() => void) | null = null;

function useBuilderSessionOnce(): void {
  const client = useQueryClient();
  stopSession ??= startBuilderSession(window, client);
}

/** The /__builder chunk (spec §6). Default export for the route's lazy import. */
export default function EditorApp() {
  useBuilderSessionOnce();
  useNavigationLock();
  const status = useEditorStore((s) => s.status);
  const previewAs = useEditorStore((s) => s.previewAs);
  const mode = useMemo(() => ({ editing: true, previewAs }), [previewAs]);

  if (status === 'waiting') {
    return (
      <div className={styles.waiting} role="status">
        <span className={styles.waitingPulse} aria-hidden="true" />
        <p>Opening the page builder…</p>
      </div>
    );
  }
  return (
    <BuilderModeProvider value={mode}>
      <FixtureRoutes>
        <EditorCanvas />
      </FixtureRoutes>
    </BuilderModeProvider>
  );
}
