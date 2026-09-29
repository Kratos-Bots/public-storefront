import { createContext } from 'react';
import type { CoreOptions } from '@/templates/hooks.ts';

/**
 * Block-level overrides of the store-wide core options (page builder, spec §5.5): a
 * ProductGrid block with `sku: hide` scopes `{ showSku: false }` over its subtree.
 * Empty = no override, which is every page outside the builder.
 */
export const CoreOptionsScopeContext = createContext<Partial<CoreOptions>>({});
