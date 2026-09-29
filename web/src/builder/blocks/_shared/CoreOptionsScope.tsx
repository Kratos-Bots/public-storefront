import { useContext, useMemo, type ReactNode } from 'react';
import { CoreOptionsScopeContext, definedScope } from '@/templates/core-scope.ts';
import type { CoreOptions } from '@/templates/hooks.ts';

/**
 * Overrides core options for a block's subtree; renders no element. An `undefined` value means
 * "inherit": it never clobbers an outer scope or the store-wide option.
 */
export function CoreOptionsScope({ value, children }: { value: Partial<CoreOptions>; children: ReactNode }) {
  const parent = useContext(CoreOptionsScopeContext);
  // JSON.stringify drops undefined keys, so the key only changes when a real override does.
  const key = JSON.stringify(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialised value; callers build a fresh object per render
  const merged = useMemo(() => ({ ...parent, ...definedScope(value) }), [parent, key]);
  if (key === '{}') return <>{children}</>;
  return <CoreOptionsScopeContext.Provider value={merged}>{children}</CoreOptionsScopeContext.Provider>;
}
