import { create } from 'zustand';
import type { LayoutKind, Theme } from '@/types/settings.ts';

export const BUILDER_PARAM = 'sf-builder';
export const BUILDER_PATH = '/__builder';

function detectBuilderMode(win: Window): boolean {
  try {
    const { search, pathname } = win.location;
    return (
      new URLSearchParams(search).get(BUILDER_PARAM) === '1' &&
      (pathname === BUILDER_PATH || pathname.startsWith(`${BUILDER_PATH}/`)) &&
      win.parent !== win
    );
  } catch {
    return false;
  }
}

const builderModeByWindow = new WeakMap<Window, boolean>();

/**
 * The admin's Pages tab frames the storefront at /__builder?sf-builder=1. Decided once per
 * window on first evaluation, exactly like isPreviewMode(): the editor's own in-frame
 * navigation drops the query string, and a frame that forgot it was the builder would start
 * persisting fixture sessions and draft themes into the real visitor's storage.
 */
export function isBuilderMode(win: Window = window): boolean {
  let mode = builderModeByWindow.get(win);
  if (mode === undefined) {
    mode = detectBuilderMode(win);
    builderModeByWindow.set(win, mode);
  }
  return mode;
}

// Primed at module load, before the router can navigate away from the param.
if (typeof window !== 'undefined') isBuilderMode(window);

interface BuilderOverrides {
  /** The admin's draft theme (customCss already dropped). */
  theme: Theme | null;
  /** The layout being edited — may differ from the one the store serves to browsers. */
  layout: LayoutKind | null;
}

/** Written only by the editor chunk; read by the always-bundled theme and layout hooks. */
export const builderOverrides = create<BuilderOverrides>()(() => ({ theme: null, layout: null }));

export const useBuilderTheme = (): Theme | null => builderOverrides((s) => s.theme);
export const useBuilderLayout = (): LayoutKind | null => builderOverrides((s) => s.layout);
