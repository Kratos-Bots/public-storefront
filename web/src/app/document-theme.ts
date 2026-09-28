import { useEffect, useMemo } from 'react';
import { applyDocumentTheme } from '@/app/theme-bridge.ts';
import { isPreviewMode, usePreviewTheme } from '@/app/preview-listener.ts';
import { lookupManifest } from '@/templates/registry.ts';
import { resolveTheme, type ResolvedTheme } from '@/templates/resolve.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

/**
 * The theme the page shows: the admin's draft inside a preview frame (with the SAVED custom
 * CSS — draft CSS is never applied), otherwise the stored theme. Paints the document and, outside a
 * preview frame only, persists the first-paint payload.
 */
export function useDocumentTheme(settings: StorefrontSettings, win: Window = window): ResolvedTheme {
  const { brand } = settings;
  const preview = usePreviewTheme(win);
  const theme = preview ? { ...preview, customCss: settings.theme.customCss } : settings.theme;
  const themeKey = JSON.stringify({ theme, brand });
  const resolved = useMemo(() => resolveTheme(theme, lookupManifest), [themeKey]);
  useEffect(() => {
    // A preview frame must never overwrite the real visitor payload.
    applyDocumentTheme(resolved, brand, { persist: !isPreviewMode(win) });
  }, [themeKey]);
  return resolved;
}
