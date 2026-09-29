import { describe, expect, it } from 'vitest';
import { builderOverrides, isBuilderMode } from '@/app/builder-gate.ts';

function fakeWindow(search: string, pathname = '/__builder', framed = true) {
  const win = { location: { search, pathname }, parent: {} } as unknown as Window;
  if (!framed) (win as unknown as { parent: unknown }).parent = win;
  return win;
}

describe('builder gate', () => {
  it('is on only for ?sf-builder=1 on /__builder inside a frame', () => {
    expect(isBuilderMode(fakeWindow('?sf-builder=1'))).toBe(true);
    expect(isBuilderMode(fakeWindow('?sf-builder=1', '/__builder/doc/cart'))).toBe(true);
    expect(isBuilderMode(fakeWindow('?sf-builder=1', '/__builder', false))).toBe(false);
    expect(isBuilderMode(fakeWindow(''))).toBe(false);
    expect(isBuilderMode(fakeWindow('?sf-builder=1', '/'))).toBe(false);
    expect(isBuilderMode(fakeWindow('?sf-preview=1'))).toBe(false);
  });

  it('decides once per window, so the first in-frame navigation keeps builder mode', () => {
    const win = fakeWindow('?sf-builder=1');
    expect(isBuilderMode(win)).toBe(true);
    (win.location as { search: string }).search = '';
    (win.location as { pathname: string }).pathname = '/__builder/doc/cart';
    expect(isBuilderMode(win)).toBe(true);
  });

  it('never throws on a hostile location', () => {
    const win = { get location() { throw new Error('cross-origin'); }, parent: {} } as unknown as Window;
    expect(isBuilderMode(win)).toBe(false);
  });

  it('holds no overrides until the editor sets them', () => {
    expect(builderOverrides.getState()).toEqual({ theme: null, layout: null });
  });
});
