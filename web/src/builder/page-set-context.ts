import { createContext, useContext } from 'react';
import type { LayoutKind, PageSet } from '@/builder/types.ts';

export interface PageSetContextValue { pageSet: PageSet | null; layout: LayoutKind }
/** Set by PuckShell: the page set on screen (published, or the editor's draft) — read by the product sheet. */
export const PageSetContext = createContext<PageSetContextValue | null>(null);
export const usePageSetContext = (): PageSetContextValue | null => useContext(PageSetContext);
