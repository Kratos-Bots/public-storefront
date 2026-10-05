/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { disablePinchZoom, resetPinchZoomForTests } from '@/lib/no-pinch-zoom.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));

function recordGestureListeners(run: () => void): Array<{ type: string; options: unknown }> {
  const seen: Array<{ type: string; options: unknown }> = [];
  const orig = document.addEventListener.bind(document);
  document.addEventListener = ((type: string, listener: unknown, options?: unknown) => {
    if (type.startsWith('gesture')) seen.push({ type, options });
    return (orig as (...a: unknown[]) => void)(type, listener, options);
  }) as typeof document.addEventListener;
  try {
    run();
  } finally {
    document.addEventListener = orig;
  }
  return seen;
}

describe('no pinch zoom', () => {
  afterEach(() => resetPinchZoomForTests());

  it('prevents the default of iOS gesture events', () => {
    disablePinchZoom();
    for (const type of ['gesturestart', 'gesturechange']) {
      const ev = new Event(type, { cancelable: true, bubbles: true });
      document.body.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
    }
  });

  it('registers once however often it is initialised', () => {
    const seen = recordGestureListeners(() => {
      disablePinchZoom();
      disablePinchZoom();
    });
    expect(seen.map((s) => s.type).sort()).toEqual(['gesturechange', 'gesturestart']);
  });

  it('registers non-passive so preventDefault is honoured', () => {
    const seen = recordGestureListeners(() => disablePinchZoom());
    expect(seen.map((s) => s.options)).toEqual([{ passive: false }, { passive: false }]);
  });

  it('leaves touch, wheel and pointer events alone (scrolling, selection, back-swipe)', () => {
    disablePinchZoom();
    for (const type of ['touchstart', 'touchmove', 'wheel', 'pointerdown', 'selectstart']) {
      const ev = new Event(type, { cancelable: true, bubbles: true });
      document.body.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
  });

  it('the page viewport forbids scaling and still covers the notch', () => {
    const html = readFileSync(path.resolve(testDir, '../index.html'), 'utf8');
    const content = /<meta name="viewport" content="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(content).toContain('width=device-width');
    expect(content).toContain('initial-scale=1');
    expect(content).toContain('maximum-scale=1');
    expect(content).toContain('user-scalable=no');
    expect(content).toContain('viewport-fit=cover');
  });

  it('every element already opts out of double-tap zoom', () => {
    const css = readFileSync(path.resolve(testDir, '../src/styles/global.css'), 'utf8');
    expect(css).toMatch(/touch-action:\s*manipulation/);
  });
});
