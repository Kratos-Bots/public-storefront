import { createContext } from 'react';

/** Set by CartContents around its `summary` slot; null outside it. */
export const CartBlockedContext = createContext<boolean | null>(null);
