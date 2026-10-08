import { useEffect, useRef } from 'react';

/** Where a touch began, which decides who owns the gesture. */
export type SheetZone = 'grab' | 'body' | 'none';

export interface SheetSwipeOptions {
  /** The sheet's panel (the dialog element), once it is in the document. */
  panel: HTMLElement | null;
  /** Off for the desktop side panel and for a closed sheet. */
  enabled: boolean;
  onClose: () => void;
  /** `grab`: the handle and pinned header, always draggable. `body`: only from the very top. `none`: never. */
  zoneOf: (target: Element, panel: HTMLElement) => SheetZone;
}

/** Finger travel before a touch becomes a drag: a tap on a header button must stay a tap. */
const SLOP = 6;
/** A drag must be this much more vertical than horizontal, or it is a sideways swipe (a table) and not ours. */
const VERTICAL_BIAS = 1.2;
/** Release past min(this, a quarter of the panel) closes the sheet. */
const CLOSE_DISTANCE = 120;
/** Release faster than this (px/ms) closes it, once it has moved at least FLICK_MIN. */
const FLICK_SPEED = 0.5;
const FLICK_MIN = 16;
const SPRING = { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' } as const;
/** If the parent declined to close, the panel is put back after Mantine's exit transition would have ended. */
const DECLINED_AFTER_MS = 450;

/** Controls that own vertical finger movement themselves. */
const OWN_GESTURE = 'input[type="range"], textarea, select, [contenteditable=""], [contenteditable="true"]';

/** Is anything between the touch and the sheet's body already scrolled away from its top? */
function scrolledAway(target: Element, panel: HTMLElement): boolean {
  for (let el: Element | null = target; el && el !== panel; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
  }
  return false;
}

/**
 * Swipe-down-to-close for the bottom sheet. Mantine's drawer has no gesture of its own.
 *
 * Touch events, not pointer events, on purpose: a pointer stream is cancelled the moment the
 * browser claims the touch for scrolling, and the only way to keep a pull at scroll-top for
 * ourselves (iOS Safari especially) is a non-passive `touchmove` that calls `preventDefault`.
 * Touch covers finger and stylus; a mouse never needs to dismiss a sheet.
 *
 * The panel is moved through the independent `translate` property, written straight to the
 * element: Mantine's transition owns `transform` and React rewrites it on re-render, so the two
 * never fight, and nothing re-renders per frame. On release past the threshold the offset is left
 * where it is and `onClose` runs, so Mantine's own exit slide carries on from the finger's
 * position (offset plus slide, always off-screen: no jump, no second animation). Otherwise the
 * offset eases back to zero with the Web Animations API, which touches no inline style.
 */
export function useSheetSwipe({ panel, enabled, onClose, zoneOf }: SheetSwipeOptions): void {
  const latest = useRef({ onClose, zoneOf, enabled });
  latest.current = { onClose, zoneOf, enabled };

  useEffect(() => {
    if (!panel || !enabled) return;
    const el = panel;

    let start: { x: number; y: number; zone: SheetZone } | null = null;
    let active = false;
    let offset = 0;
    let samples: { y: number; t: number }[] = [];
    let spring: Animation | null = null;
    let declinedTimer: number | undefined;

    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const setOffset = (px: number) => {
      offset = px;
      el.style.translate = px > 0 ? `0 ${px}px` : '';
    };

    const springBack = () => {
      const from = offset;
      setOffset(0);
      if (from <= 0 || reduced() || typeof el.animate !== 'function') return;
      spring?.cancel();
      spring = el.animate([{ translate: `0 ${from}px` }, { translate: '0 0' }], SPRING);
      spring.onfinish = () => { spring = null; };
    };

    const reset = () => { start = null; active = false; samples = []; };

    const onStart = (e: TouchEvent) => {
      reset();
      if (e.touches.length !== 1 || !(e.target instanceof Element)) return;
      const zone = latest.current.zoneOf(e.target, el);
      if (zone === 'none' || e.target.closest(OWN_GESTURE)) return;
      if (zone === 'body' && scrolledAway(e.target, el)) return;
      // A new touch takes over from a spring still in flight.
      if (spring) { spring.cancel(); spring = null; }
      window.clearTimeout(declinedTimer);
      const t = e.touches[0]!;
      start = { x: t.clientX, y: t.clientY, zone };
      offset = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!start) return;
      if (e.touches.length !== 1) { if (active) springBack(); reset(); return; }
      const t = e.touches[0]!;
      const dy = t.clientY - start.y;
      const dx = t.clientX - start.x;
      if (!active) {
        if (Math.abs(dy) < SLOP && Math.abs(dx) < SLOP) return;
        // Up, sideways, or (from the body) a scroll that began in the meantime: not ours, for the whole gesture.
        const mostlyDown = dy > 0 && dy >= Math.abs(dx) * VERTICAL_BIAS;
        const bodyMoved = start.zone === 'body' && e.target instanceof Element && scrolledAway(e.target, el);
        if (!mostlyDown || bodyMoved) { reset(); return; }
        active = true;
      }
      if (e.cancelable) e.preventDefault();
      // Eased in: the first SLOP pixels are the price of telling a drag from a tap, not travel.
      setOffset(Math.max(0, dy - SLOP));
      const now = performance.now();
      samples.push({ y: t.clientY, t: now });
      while (samples.length > 2 && now - samples[0]!.t > 100) samples.shift();
    };

    const onEnd = (e: TouchEvent) => {
      if (!active) { reset(); return; }
      const first = samples[0];
      const last = samples[samples.length - 1];
      const speed = first && last && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
      const far = Math.min(CLOSE_DISTANCE, el.offsetHeight * 0.25);
      const close = e.type === 'touchend' && (offset >= far || (speed > FLICK_SPEED && offset >= FLICK_MIN));
      reset();
      if (!close) { springBack(); return; }
      latest.current.onClose();
      // A parent that refuses to close (a guard) must not leave the panel stranded half-way down.
      declinedTimer = window.setTimeout(() => {
        if (el.isConnected && latest.current.enabled) springBack();
      }, DECLINED_AFTER_MS);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      window.clearTimeout(declinedTimer);
      spring?.cancel();
      el.style.translate = '';
    };
  }, [panel, enabled]);
}
