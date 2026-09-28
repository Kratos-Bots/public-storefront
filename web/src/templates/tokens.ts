import type { RadiusToken, TemplateTokens } from '@/templates/define.ts';
import type { ResolvedTheme } from '@/templates/resolve.ts';

export function radiusCss(t: RadiusToken): string {
  if (t === 'theme') return 'var(--mantine-radius-default)';
  if (t === 'pill') return '999px';
  return `${t}px`;
}

/** The token half of the --sf-* variables (the palette half stays in theme-bridge). */
export function tokenVariables(tokens: TemplateTokens): Record<string, string> {
  const b = tokens.button;
  return {
    '--sf-btn-radius': radiusCss(b.radius),
    '--sf-btn-transform': b.transform,
    '--sf-btn-weight': String(b.weight),
    '--sf-btn-font': `var(--sf-font-${b.font})`,
    '--sf-btn-tracking-sm': b.tracking.sm,
    '--sf-btn-tracking-md': b.tracking.md,
    '--sf-btn-tracking-lg': b.tracking.lg,
    '--sf-card-radius': radiusCss(tokens.card.radius),
    '--sf-card-border': tokens.card.border,
    '--sf-card-shadow': tokens.card.shadow,
    '--sf-card-shadow-hover': tokens.card.shadowHover,
    '--sf-pill-radius': radiusCss(tokens.badge.radius),
    '--sf-heading-weight': String(tokens.heading.weight),
    '--sf-heading-tracking': tokens.heading.tracking,
    '--sf-heading-transform': tokens.heading.transform,
  };
}

/** The exact attribute names `rootAttributes` sets on `<html>` — the single source of truth for
 *  the read-path allowlist that replays a stored theme payload (the inlined bootstrap script and
 *  `readStoredTheme` in theme-bridge.ts), so a tampered or foreign-shaped `localStorage` entry can
 *  never inject an arbitrary attribute. The return type below is keyed off this tuple, so adding or
 *  removing an attribute here without updating the object (or vice versa) is a type error. */
export const ROOT_ATTRIBUTE_NAMES = [
  'data-sf-template',
  'data-sf-preset',
  'data-sf-btn-fill',
  'data-sf-input',
  'data-sf-chassis',
  'data-sf-label',
  'data-sf-glass',
  'data-mantine-color-scheme',
] as const;

export function rootAttributes(theme: ResolvedTheme): Record<(typeof ROOT_ATTRIBUTE_NAMES)[number], string> {
  return {
    'data-sf-template': theme.templateId,
    'data-sf-preset': theme.presetId,
    'data-sf-btn-fill': theme.tokens.button.fill,
    'data-sf-input': theme.tokens.input.style,
    'data-sf-chassis': theme.tokens.chassis,
    'data-sf-label': theme.tokens.label.style,
    'data-sf-glass': theme.tokens.glass,
    'data-mantine-color-scheme': theme.scheme,
  };
}
