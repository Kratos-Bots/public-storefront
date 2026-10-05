/**
 * iOS Safari in a normal tab ignores `user-scalable=no` for pinch; it still fires these WebKit-only events, and
 * cancelling them stops the zoom. Nothing else fires them, so this is a no-op elsewhere. Touch, wheel and
 * selection events are left alone, so scrolling, text selection and the edge back-swipe are not affected.
 */
const EVENTS = ['gesturestart', 'gesturechange'] as const;

let installed = false;
const stop = (event: Event) => event.preventDefault();

/** Registers the guards once; calling it again does nothing. */
export function disablePinchZoom(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  for (const type of EVENTS) document.addEventListener(type, stop, { passive: false });
}

export function resetPinchZoomForTests(): void {
  if (!installed) return;
  installed = false;
  for (const type of EVENTS) document.removeEventListener(type, stop);
}
