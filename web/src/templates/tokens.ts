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

export function rootAttributes(theme: ResolvedTheme): Record<string, string> {
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
