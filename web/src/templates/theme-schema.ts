import { z } from 'zod';
import { FONT_FAMILY_RE, HEX_RE, OPTION_KEY_RE, TEMPLATE_ID_RE } from '@/templates/define.ts';

// Every regex comes from define.ts — one definition shared with validateManifest.
const hex = z.string().regex(HEX_RE);
const fontName = z.string().regex(FONT_FAMILY_RE).nullable();

/** The stored theme's shape (mirrors the backend's storefrontThemeSchema). */
export const themeSchema = z.object({
  template: z.string().regex(TEMPLATE_ID_RE).optional(),
  preset: z.string().regex(TEMPLATE_ID_RE).nullable().optional(),
  options: z.record(z.string().regex(OPTION_KEY_RE), z.union([z.boolean(), z.string().max(100)]))
    .refine((o) => Object.keys(o).length <= 30).optional(),
  scheme: z.enum(['dark', 'light']),
  colors: z.object({ primary: hex, bg: hex, surface: hex, text: hex, muted: hex, success: hex, warn: hex, danger: hex }),
  fonts: z.object({ heading: fontName, body: fontName, mono: fontName }),
  radius: z.enum(['none', 'sm', 'md', 'lg', 'xl']),
  density: z.enum(['comfortable', 'compact']),
  customCss: z.string().max(20 * 1024).optional(),
});

/** Admin → storefront preview frame (Plan 4 sends exactly this). */
export const previewMessageSchema = z.object({ type: z.literal('sf-preview-theme'), theme: themeSchema });
export type PreviewMessage = z.infer<typeof previewMessageSchema>;
