import { createContext, useContext, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';

export interface ShellSearchContext {
  search: string;
  setSearch: (value: string) => void;
}

const NO_SHELL: ShellSearchContext = { search: '', setSearch: () => undefined };

/** The same state for the chrome itself (header, page outlet, search blocks). Outside a shell: inert. */
export const ShellStateContext = createContext<ShellSearchContext>(NO_SHELL);

/**
 * Search text lives in the shell (the field is part of the header chrome) and is
 * handed down through the router outlet. Catalog and wholesale pages read it here.
 * Rendered outside a shell outlet (a block on the editor canvas) it falls back to the
 * shell state provider, and with neither to an inert empty search.
 */
export function useShellSearch(): ShellSearchContext {
  const outlet = useOutletContext<ShellSearchContext | null | undefined>();
  const state = useContext(ShellStateContext);
  return outlet ?? state;
}

export function useShellState(): ShellSearchContext {
  return useContext(ShellStateContext);
}

/** Owns the state; called once by whatever renders a shell (the legacy shells, PuckShell). */
export function useShellStateValue(): ShellSearchContext {
  const [search, setSearch] = useState('');
  return useMemo(() => ({ search, setSearch }), [search]);
}
