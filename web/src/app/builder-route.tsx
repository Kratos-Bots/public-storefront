import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';

// The only import of the editor chunk anywhere in the app (spec §8, A1).
const EditorApp = lazy(() => import('@/builder/editor/EditorApp.tsx'));

/** /__builder: the page builder inside the admin's frame; anyone else goes home. */
export function BuilderRoute() {
  if (!isBuilderMode()) return <Navigate to="/" replace />;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditorApp />
    </Suspense>
  );
}
