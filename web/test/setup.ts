import './helpers/pin-locale.ts';
import '@testing-library/jest-dom/vitest';
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }),
});
// Puck's drag-and-drop layer needs ResizeObserver at import time (EditorBlock reads Puck's store); jsdom has none.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
