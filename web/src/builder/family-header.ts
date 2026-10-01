import { createFamily } from '@/builder/parts.ts';

// No feature imports: this module is in the shopper's entry bundle.

/** The Header container's data (stage-4 spec §5.1), computed once from the hooks the three v0.7.0 headers called. */
export interface HeaderData {
  variant: 'storefront' | 'menu' | 'webapp';
  /** The variant's CSS module object (StorefrontShell / MenuShell / WebAppShell). */
  classes: Readonly<Record<string, string>>;
  brandName: string;
  loggedIn: boolean;
  native: boolean;
  cartCount: number;
  search: string;
  setSearch: (v: string) => void;
  onCatalog: boolean;
  canFilter: boolean;
  filtered: boolean;
  showBack: boolean;
  openFilter(): void;
  goBack(): void;
}
export const HeaderFamily = createFamily<HeaderData>('header');
