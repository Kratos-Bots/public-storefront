/**
 * When a field takes focus on a phone, the browser scrolls it into view but often leaves it flush against the
 * edge of the keyboard or under a fixed bar at the foot. Once the keyboard has settled, this checks whether the
 * field sits inside the visible band (the visual viewport, less the bottom bar's inset and the field's own
 * scroll margins) and, if not, scrolls it to the upper middle of that band, once per focus.
 *
 * The bar's height is `--sf-bottom-inset`, set by whichever shell or step shows a bar and surfaced as the
 * document's `scroll-padding-bottom` (global.css), so native scrolling-into-view agrees with this.
 */

const SETTLE_QUIET_MS = 120;
const SETTLE_FALLBACK_MS = 400;
/** Where in the visible band the field lands: a little above the middle, so the keyboard's top edge stays clear. */
const LANDING = 0.4;

const NOT_TEXT = new Set(['checkbox', 'radio', 'hidden', 'submit', 'button', 'file', 'range', 'color', 'image', 'reset']);

function isTextField(el: unknown): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && !NOT_TEXT.has(el.type);
}

const px = (el: Element, property: string) => parseFloat(getComputedStyle(el).getPropertyValue(property)) || 0;

/** The field or an ancestor is fixed or sticky (the header search, a bar's control): it never scrolls with the page, so scrolling the page would only jerk it. */
function pinned(el: Element): boolean {
  for (let p: Element | null = el; p && p !== document.documentElement; p = p.parentElement) {
    const position = getComputedStyle(p).position;
    if (position === 'fixed' || position === 'sticky') return true;
  }
  return false;
}

/** The nearest ancestor that scrolls on its own, `'fixed'` for a dialog that does not, or null for the page. */
function scroller(el: Element): HTMLElement | 'fixed' | null {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    if (p.getAttribute('role') === 'dialog' || p.getAttribute('aria-modal') === 'true') return 'fixed';
  }
  return null;
}

function clear(el: HTMLElement): void {
  if (pinned(el)) return;
  const holder = scroller(el);
  if (holder === 'fixed') return;
  const vv = window.visualViewport;
  const viewTop = vv ? vv.offsetTop : 0;
  const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  let top = viewTop + px(el, 'scroll-margin-top');
  let bottom = viewBottom - px(document.documentElement, 'scroll-padding-bottom') - px(el, 'scroll-margin-bottom');
  if (holder) {
    const box = holder.getBoundingClientRect();
    top = Math.max(top, box.top);
    bottom = Math.min(bottom, box.bottom);
  }
  const r = el.getBoundingClientRect();
  if (r.top >= top && r.bottom <= bottom) return;
  const delta = (r.top + r.bottom) / 2 - (top + (bottom - top) * LANDING);
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  (holder ?? window).scrollBy({ top: delta, behavior });
}

export interface KeepClearOptions {
  /** Defaults to a coarse primary pointer (a phone or tablet); a desktop, or a laptop with a touchscreen, is left alone. */
  touch?: boolean;
}

/** Watches focus at the document; returns the cleanup. */
export function watchFocusedField({ touch }: KeepClearOptions = {}): () => void {
  const isTouch = () => touch ?? window.matchMedia('(pointer: coarse)').matches;
  let cancel: (() => void) | null = null;

  const onFocusIn = (e: Event) => {
    cancel?.();
    cancel = null;
    const target = e.target;
    if (!isTouch() || !isTextField(target)) return;

    const vv = window.visualViewport;
    let timer: ReturnType<typeof setTimeout> = setTimeout(run, SETTLE_FALLBACK_MS);
    const settleAfterResize = () => {
      clearTimeout(timer);
      timer = setTimeout(run, SETTLE_QUIET_MS);
    };
    const end = () => {
      clearTimeout(timer);
      vv?.removeEventListener('resize', settleAfterResize);
      document.removeEventListener('touchmove', end);
      document.removeEventListener('wheel', end);
      cancel = null;
    };
    function run() {
      end();
      if (document.activeElement === target) clear(target as HTMLElement);
    }
    vv?.addEventListener('resize', settleAfterResize);
    // The shopper scrolling by hand wins: no nudge after that.
    document.addEventListener('touchmove', end, { passive: true });
    document.addEventListener('wheel', end, { passive: true });
    cancel = end;
  };

  document.addEventListener('focusin', onFocusIn);
  return () => {
    document.removeEventListener('focusin', onFocusIn);
    cancel?.();
  };
}

let started = false;

/** Starts the watcher once for the page. */
export function keepFocusedFieldClear(): void {
  if (started || typeof document === 'undefined') return;
  started = true;
  watchFocusedField();
}
