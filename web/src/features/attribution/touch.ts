export interface Touch {
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  landingPath: string | null;
}

export interface VisitState {
  /** The very first visit's touch. Never overwritten. */
  firstTouch: Touch;
  currentTouch: Touch;
  lastActivityAt: number;
}

/** A visit ends after this long without a page view. */
export const VISIT_IDLE_MS = 30 * 60 * 1000;

const clip = (value: string | null, max: number): string | null => {
  const trimmed = value?.trim().slice(0, max);
  return trimmed ? trimmed : null;
};

/** What this page load says about where the shopper came from. Only the referrer's host is kept,
 *  never its path or query, and a referrer from the shop itself is not a source. */
export function readTouch(href: string, referrer: string): Touch {
  const url = new URL(href);
  let referrerHost: string | null = null;
  try {
    const host = referrer ? new URL(referrer).host : '';
    if (host && host !== url.host) referrerHost = host;
  } catch { /* not a URL: no referrer */ }
  return {
    referrerHost: clip(referrerHost, 255),
    utmSource: clip(url.searchParams.get('utm_source'), 100),
    utmMedium: clip(url.searchParams.get('utm_medium'), 100),
    utmCampaign: clip(url.searchParams.get('utm_campaign'), 100),
    landingPath: clip(url.pathname, 500),
  };
}

function sameOrigin(a: Touch, b: Touch): boolean {
  return a.referrerHost === b.referrerHost && a.utmSource === b.utmSource
    && a.utmMedium === b.utmMedium && a.utmCampaign === b.utmCampaign;
}

/**
 * A new visit starts when there is none, after 30 idle minutes, or when the shopper arrives again
 * through a campaign link or another site that differs from the current visit's. A plain page view
 * or reload (no tag, no external referrer) never starts one.
 */
export function shouldStartVisit(state: VisitState | null, touch: Touch, now: number): boolean {
  if (!state) return true;
  if (now - state.lastActivityAt > VISIT_IDLE_MS) return true;
  const arrivesFromOutside = touch.utmSource !== null || touch.referrerHost !== null;
  return arrivesFromOutside && !sameOrigin(touch, state.currentTouch);
}
