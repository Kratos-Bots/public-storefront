import type { AccessButton, AccessSettings, StorefrontSettings } from '@/types/settings.ts';
import { isClosedExemptPath } from '@/app/closed-gate.ts';

// Shop access (backend spec 2026-10-02): the shop can require a sign-in, or
// admit only customers the owner allowed. The backend enforces it; this module
// only decides what the storefront shows for a navigation.

export type AccessInfo = AccessSettings;
export type { AccessButton };

/** What a backend older than shop access means: an open shop. */
export const OPEN_ACCESS: AccessInfo = { storefront: 'public', registration: true, deniedMessage: '', deniedButtons: [] };

const MODES: readonly string[] = ['public', 'login', 'restricted'];

function safeButtons(buttons: unknown): AccessButton[] {
  if (!Array.isArray(buttons)) return [];
  return buttons.filter((b): b is AccessButton =>
    !!b && typeof b.label === 'string' && b.label.trim().length > 0
    && typeof b.url === 'string' && b.url.startsWith('https://'));
}

/** The settings' access object, tolerant of an older backend and of anything unexpected in it. */
export function accessOf(settings: Pick<StorefrontSettings, 'access'>): AccessInfo {
  const raw = settings.access;
  if (!raw) return OPEN_ACCESS;
  return {
    storefront: MODES.includes(raw.storefront) ? raw.storefront : 'public',
    registration: raw.registration !== false,
    deniedMessage: typeof raw.deniedMessage === 'string' ? raw.deniedMessage : '',
    deniedButtons: safeButtons(raw.deniedButtons),
  };
}

/** Whether the owner's lockout message belongs beside the sign-in options:
 *  only when some visitors cannot get in by signing up. */
export function showsLockoutCopy(access: AccessInfo): boolean {
  return access.storefront === 'restricted' || !access.registration;
}

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

const AUTH_PATHS = ['/login', '/reset-password'];

/** Pages a signed-out visitor needs in order to sign in. */
export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.includes(stripTrailingSlash(pathname));
}

/** Account pages stay open to a customer who is not allowed: their orders must not be stranded. */
function isAccountPath(pathname: string): boolean {
  const p = stripTrailingSlash(pathname);
  return p === '/account' || p.startsWith('/account/');
}

export type AccessDecision =
  | { kind: 'allow' }
  /** Render the page without the shop frame: nothing around it may ask for the catalogue. */
  | { kind: 'authOnly' }
  | { kind: 'redirect'; to: string }
  | { kind: 'locked'; variant: 'denied' | 'closed' };

export interface AccessContext {
  access: AccessInfo;
  loggedIn: boolean;
  /** An API call answered ACCESS_DENIED, or the profile says shopAccess: false. */
  denied: boolean;
  /** A Telegram Mini App sign-in was refused because registration is closed. */
  registrationRefused: boolean;
  /** features.accounts */
  accounts: boolean;
  pathname: string;
  search: string;
  builder: boolean;
}

export function accessDecision(ctx: AccessContext): AccessDecision {
  if (ctx.builder || isClosedExemptPath(ctx.pathname)) return { kind: 'allow' };

  if (ctx.loggedIn) {
    if (ctx.denied && ctx.access.storefront === 'restricted' && !isAccountPath(ctx.pathname)) {
      return { kind: 'locked', variant: 'denied' };
    }
    return { kind: 'allow' };
  }

  // A public shop stays browsable whatever a Mini App sign-in was told; the refusal
  // only locks a shop the visitor could not browse anyway.
  if (ctx.access.storefront === 'public') return { kind: 'allow' };
  if (ctx.registrationRefused) return { kind: 'locked', variant: 'closed' };
  // Nobody can sign in when accounts are off, so a redirect to /login would be a dead end.
  if (!ctx.accounts) return { kind: 'locked', variant: 'closed' };
  if (isAuthPath(ctx.pathname)) return { kind: 'authOnly' };
  return { kind: 'redirect', to: `/login?returnTo=${encodeURIComponent(ctx.pathname + ctx.search)}` };
}
