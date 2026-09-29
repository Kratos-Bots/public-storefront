import type { Viewports } from '@puckeditor/core';
import type { ViewportWidth } from '@/builder/editor/protocol.ts';

/**
 * The header toggle. Choosing one posts sf-builder-viewport and the admin resizes the iframe,
 * so CSS media queries and useMediaQuery see a real width — Puck's canvas never narrows itself.
 */
export const VIEWPORT_OPTIONS: ReadonlyArray<{ width: ViewportWidth | null; label: string }> = [
  { width: null, label: 'Fit' },
  { width: 360, label: 'Phone' },
  { width: 768, label: 'Tablet' },
  { width: 1280, label: 'Desktop' },
];

/** Puck's own viewport: always the whole frame. */
export const PUCK_VIEWPORTS: Viewports = [{ width: '100%', height: 'auto', label: 'Frame' }];
