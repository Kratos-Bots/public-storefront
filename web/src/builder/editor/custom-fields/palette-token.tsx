import type { CustomField } from '@puckeditor/core';
import { PALETTE_TOKENS, type PaletteToken } from '@/builder/define.ts';
import { onRadioGroupKeyDown, radioTabIndex } from '@/builder/editor/custom-fields/roving.ts';
import styles from '@/builder/editor/custom-fields/fields.module.css';

export function humanizeValue(value: string): string {
  if (value === '' || value === 'none') return 'None';
  const words = value.replace(/[-_]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What an admin calls each shop colour (the theme editor's vocabulary, not the CSS variable's). */
const TOKEN_LABELS: Record<PaletteToken, string> = {
  none: 'None',
  bg: 'Background',
  'bg-deep': 'Background (deep)',
  surface: 'Surface',
  'surface-2': 'Surface 2',
  'surface-3': 'Surface 3',
  line: 'Line',
  'line-strong': 'Line (strong)',
  text: 'Text',
  muted: 'Muted text',
  faint: 'Faint text',
  primary: 'Primary',
  'primary-soft': 'Primary (soft)',
  success: 'Success',
  warn: 'Warning',
  danger: 'Danger',
};

const isToken = (t: string): t is PaletteToken => (PALETTE_TOKENS as readonly string[]).includes(t);
export const tokenLabel = (t: string): string => (isToken(t) ? TOKEN_LABELS[t] : humanizeValue(t));

/**
 * One swatch per token, painted with the shop's own resolved `--sf-<token>` colour. Only tokens a
 * block's `*Token` prop accepts (Plan 2's PALETTE_TOKENS) are offered, so an option string can never
 * reach a CSS `var()` it wasn't meant for. Single-select, so it is a radio group (arrow keys move).
 */
export function paletteTokenField(label: string, options: string[]): CustomField<string> {
  const tokens = options.filter(isToken);
  return {
    type: 'custom',
    label,
    render: ({ id, value, onChange, readOnly }) => {
      const checked = tokens.indexOf(value as PaletteToken);
      return (
        <fieldset className={styles.field} id={id} disabled={readOnly}>
          <legend className={styles.label}>{label}</legend>
          <div
            className={styles.swatches}
            role="radiogroup"
            aria-label={label}
            onKeyDown={(e) => onRadioGroupKeyDown(e, tokens.length, checked, (i) => onChange(tokens[i]!))}
          >
            {tokens.map((token, i) => {
              const empty = token === 'none';
              return (
                <button
                  key={token}
                  type="button"
                  role="radio"
                  aria-checked={i === checked}
                  tabIndex={radioTabIndex(i, checked)}
                  aria-label={tokenLabel(token)}
                  title={tokenLabel(token)}
                  className={styles.swatch}
                  data-empty={empty ? '' : undefined}
                  style={empty ? undefined : { background: `var(--sf-${token})` }}
                  onClick={() => onChange(token)}
                />
              );
            })}
          </div>
          <p className={styles.chosen} aria-hidden="true">{checked >= 0 ? tokenLabel(tokens[checked]!) : 'Not set'}</p>
        </fieldset>
      );
    },
  };
}
