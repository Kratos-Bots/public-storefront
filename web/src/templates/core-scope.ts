import { createContext } from 'react';
import type { CoreOptions } from '@/templates/hooks.ts';

/**
 * Block-level overrides of the store-wide core options (page builder, spec §5.5): a
 * ProductGrid block with `sku: hide` scopes `{ showSku: false }` over its subtree.
 * Empty = no override, which is every page outside the builder.
 */
export const CoreOptionsScopeContext = createContext<Partial<CoreOptions>>({});

/** The scope without `undefined` keys: an undefined override means "inherit", never "unset". */
export function definedScope(scope: Partial<CoreOptions>): Partial<CoreOptions> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(scope)) if (v !== undefined) out[k] = v;
  return out as Partial<CoreOptions>;
}
