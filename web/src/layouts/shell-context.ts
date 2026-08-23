import { useOutletContext } from 'react-router';

export interface ShellSearchContext {
  search: string;
  setSearch: (value: string) => void;
}

/**
 * Search text lives in the shell (the field is part of the header chrome) and is
 * handed down through the router outlet. Catalog and wholesale pages read it here.
 */
export function useShellSearch(): ShellSearchContext {
  return useOutletContext<ShellSearchContext>();
}
