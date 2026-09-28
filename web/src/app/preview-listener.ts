import { useEffect, useState } from 'react';
import { previewMessageSchema } from '@/templates/theme-schema.ts';
import type { Theme } from '@/types/settings.ts';

export const PREVIEW_PARAM = 'sf-preview';

function detectPreviewMode(win: Window): boolean {
  try {
    return new URLSearchParams(win.location.search).get(PREVIEW_PARAM) === '1' && win.parent !== win;
  } catch {
    return false;
  }
}

const previewModeByWindow = new WeakMap<Window, boolean>();

/**
 * The admin's Appearance preview frames the live storefront at /?sf-preview=1. Decided once per
 * window, on first evaluation: the first in-frame SPA navigation drops the query string, and a
 * frame that forgot it was a preview would start persisting drafts to the visitor payload.
 */
export function isPreviewMode(win: Window = window): boolean {
  let preview = previewModeByWindow.get(win);
  if (preview === undefined) {
    preview = detectPreviewMode(win);
    previewModeByWindow.set(win, preview);
  }
  return preview;
}

// Primed at module load, before the router has had a chance to navigate away from the param.
if (typeof window !== 'undefined') isPreviewMode(window);

/**
 * Accepts draft themes from the framing admin. Only messages from window.parent, only the
 * exact zod shape, and never the draft custom CSS: arbitrary CSS in a frameable page could
 * exfiltrate typed input through attribute selectors. The saved (backend-sanitised) custom
 * CSS keeps applying.
 */
export function subscribePreview(onTheme: (theme: Theme) => void, win: Window = window): () => void {
  if (!isPreviewMode(win)) return () => undefined;
  const handler = (event: MessageEvent) => {
    if (event.source !== win.parent) return;
    const parsed = previewMessageSchema.safeParse(event.data);
    if (!parsed.success) return;
    onTheme({ ...parsed.data.theme, customCss: '' } as Theme);
  };
  win.addEventListener('message', handler);
  win.parent.postMessage({ type: 'sf-preview-ready' }, '*');
  return () => win.removeEventListener('message', handler);
}

export function usePreviewTheme(win: Window = window): Theme | null {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => subscribePreview(setTheme, win), [win]);
  return theme;
}
