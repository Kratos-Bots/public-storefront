import { Navigate, useParams } from 'react-router';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { saveStoredReferral } from '@/features/referrals/stored-referral.ts';

/** Web and desktop only: inside the Telegram Mini App the bot's own deep link carries referrals. */
function capturing(): boolean {
  return !isTelegramWebApp() && !isBuilderMode();
}

/** Remember a code from a link, unless this is the Mini App or the page builder's frame. */
export function captureReferral(code: unknown): boolean {
  return capturing() ? saveStoredReferral(code) : false;
}

const HASH_RE = /^#\/?ref\/([^/?#]+)/i;
const PATH_RE = /^\/ref\/([^/?#]+)\/?$/i;

/**
 * Called once at boot, before the first render: reads a `/ref/CODE` path or a `#/ref/CODE` hash, stores
 * the code, and strips a matching hash so it does not linger in the address bar. Runs ahead of the
 * router so a private shop's login redirect cannot swallow the code. Any other hash (Telegram's
 * `#tgWebAppData=…`, the builder's) is left exactly as it was.
 */
export function captureReferralFromLocation(win: Window = window): void {
  const { pathname, search, hash } = win.location;
  const fromPath = PATH_RE.exec(pathname);
  if (fromPath) captureReferral(safeDecode(fromPath[1]!));
  const fromHash = HASH_RE.exec(hash);
  if (!fromHash) return;
  captureReferral(safeDecode(fromHash[1]!));
  try {
    win.history.replaceState(win.history.state, '', pathname + search);
  } catch {
    // ignore
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * `/ref/:code` — a top-level route, outside the access boundary like the sign-in return page, so it
 * runs even in a private shop whose boundary would otherwise redirect before this ever rendered.
 * It stores the code and goes home; the boundary then does whatever it does with the code already kept.
 */
export function ReferralLinkRoute() {
  const { code } = useParams();
  captureReferral(code);
  return <Navigate to="/" replace />;
}
