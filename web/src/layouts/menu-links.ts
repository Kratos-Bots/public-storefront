import type { ComponentType } from 'react';
import { textKey } from '@/text/runtime.tsx';
import { HelpIcon, HomeIcon, StarIcon, UserIcon, type GlyphProps } from '@/components/icons.tsx';

/** What an entry's `when` and `to` may depend on: the shop's switches and who is looking. */
export interface MenuContext {
  reviews: boolean;
  accounts: boolean;
  loggedIn: boolean;
  /** Where the header's Account button sends a signed-out visitor — the same place, so the two never disagree. */
  signInTo: string;
}

/** The text keys an entry's label may be: plain strings, with no parameters. */
export type MenuLabelKey = 'shell.menu.catalog' | 'shell.menu.reviews' | 'shell.menu.support' | 'shell.menu.account' | 'shell.menu.signIn';

export interface MenuLink {
  key: string;
  to: string | ((ctx: MenuContext) => string);
  /** The text key of the label (`shell.menu.*`). */
  label: MenuLabelKey;
  Icon?: ComponentType<GlyphProps>;
  /** Absent means always. */
  when?: (ctx: MenuContext) => boolean;
  /** Whether the entry is the page the visitor is on (exact `to` by default). */
  current?: (pathname: string) => boolean;
}

/**
 * The header menu's pages, in order. Adding a page is one entry here plus one `shell.menu.*` text key (and its note);
 * nothing else needs to know. There is deliberately no cart entry: the cart is the bottom bar's and the header's button.
 */
export const MENU_LINKS: readonly MenuLink[] = [
  { key: 'catalog', to: '/', label: textKey('shell.menu.catalog'), Icon: HomeIcon, current: (p) => p === '/' || p.startsWith('/c/') || p.startsWith('/p/') },
  { key: 'reviews', to: '/reviews', label: textKey('shell.menu.reviews'), Icon: StarIcon, when: (c) => c.reviews },
  { key: 'support', to: '/support', label: textKey('shell.menu.support'), Icon: HelpIcon },
  { key: 'account', to: '/account', label: textKey('shell.menu.account'), Icon: UserIcon, when: (c) => c.accounts && c.loggedIn, current: (p) => p.startsWith('/account') },
  { key: 'signIn', to: (c) => c.signInTo, label: textKey('shell.menu.signIn'), Icon: UserIcon, when: (c) => c.accounts && !c.loggedIn },
];
