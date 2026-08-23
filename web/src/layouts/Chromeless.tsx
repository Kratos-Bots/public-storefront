import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { Brand } from '@/components/Brand.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import classes from '@/layouts/Chromeless.module.css';

/** Centred brand header and nothing else — used for shared order links. */
export function Chromeless() {
  return (
    <div className={classes.shell}>
      <header className={classes.header}>
        <Brand size="md" />
      </header>
      <main className={classes.main}>
        <Suspense fallback={<PageSkeleton inline />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
