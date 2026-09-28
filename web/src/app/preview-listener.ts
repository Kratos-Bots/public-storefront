import { useEffect, useState } from 'react';
import { previewMessageSchema } from '@/templates/theme-schema.ts';
import type { Theme } from '@/types/settings.ts';

export const PREVIEW_PARAM = 'sf-preview';

/** The admin's Appearance preview frames the live storefront at /?sf-preview=1. */
export function isPreviewMode(win: Window = window): boolean {
  try {
    return new URLSearchParams(win.location.search).get(PREVIEW_PARAM) === '1' && win.parent !== win;
  } catch {
    return false;
  }
}

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
