import { useEffect, useMemo } from 'react';
import { applyDocumentTheme } from '@/app/theme-bridge.ts';
import { isBuilderMode, useBuilderTheme } from '@/app/builder-gate.ts';
import { isPreviewMode, usePreviewTheme } from '@/app/preview-listener.ts';
import { lookupManifest } from '@/templates/registry.ts';
import { resolveTheme, type ResolvedTheme } from '@/templates/resolve.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

/**
 * The theme the page shows: the admin's draft inside the builder or a preview frame (with the
 * SAVED custom CSS — draft CSS is never applied), otherwise the stored theme. Paints the document
 * and, outside a preview or builder frame only, persists the first-paint payload.
 */
export function useDocumentTheme(settings: StorefrontSettings, win: Window = window): ResolvedTheme {
  const { brand } = settings;
  const builder = useBuilderTheme();
  const preview = usePreviewTheme(win);
  // The builder's draft (Pages tab) or the Appearance preview's — never with draft CSS.
  const draft = builder ?? preview;
  const theme = draft ? { ...draft, customCss: settings.theme.customCss } : settings.theme;
  const themeKey = JSON.stringify({ theme, brand });
  const resolved = useMemo(() => resolveTheme(theme, lookupManifest), [themeKey]);
  useEffect(() => {
    // Neither a preview frame nor the builder may overwrite the real visitor payload.
    applyDocumentTheme(resolved, brand, { persist: !isPreviewMode(win) && !isBuilderMode(win) });
  }, [themeKey, win]);
  return resolved;
}
