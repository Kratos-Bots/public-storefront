import { lazy, Suspense, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AutofillTrace } from '@/lib/autofill-advance.ts';
import { clearDiagFlag, createTapCounter, createTraceLog, readDiagFlag, setDiagFlag, type TraceLog } from '@/lib/autofill-diag.ts';

// Declared here, not imported: the panel is its own chunk and is fetched only when it first renders.
const AutofillTracePanel = lazy(() => import('@/features/diagnostics/AutofillTracePanel.tsx'));

export interface AutofillDiag {
  /** Pass to `useAutofillAdvance`; undefined while the diagnostic is off. */
  onTrace: ((entry: AutofillTrace) => void) | undefined;
  /** The tap handler for the hidden gesture. */
  onTap: () => void;
  /** The panel (a lazy chunk) while the diagnostic is on, else null. */
  panel: ReactNode;
}

/** The opt-in autofill diagnostic: off unless `?sfdiag=autofill` or seven quick taps set the tab's flag. */
export function useAutofillDiag(): AutofillDiag {
  const [on, setOn] = useState(readDiagFlag);
  const logRef = useRef<TraceLog | null>(null);
  if (on) logRef.current ??= createTraceLog();
  const log = on ? logRef.current : null;

  const onTrace = useCallback((entry: AutofillTrace) => logRef.current?.push(entry), []);
  const enable = useCallback(() => {
    setDiagFlag();
    setOn(true);
  }, []);
  const close = useCallback(() => {
    clearDiagFlag();
    logRef.current = null;
    setOn(false);
  }, []);
  const onTap = useMemo(() => createTapCounter(enable), [enable]);

  return {
    onTrace: on ? onTrace : undefined,
    onTap,
    panel: log ? (
      <Suspense fallback={null}>
        <AutofillTracePanel log={log} onClose={close} />
      </Suspense>
    ) : null,
  };
}
