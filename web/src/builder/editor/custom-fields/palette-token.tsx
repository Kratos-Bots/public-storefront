import type { CustomField } from '@puckeditor/core';
import { PALETTE_TOKENS } from '@/builder/define.ts';
import styles from '@/builder/editor/custom-fields/fields.module.css';

export function humanizeValue(value: string): string {
  if (value === '' || value === 'none') return 'None';
  const words = value.replace(/[-_]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const KNOWN: ReadonlySet<string> = new Set(PALETTE_TOKENS);

/**
 * One swatch per token, painted with the shop's own resolved `--sf-<token>` colour. Only tokens a
 * block's `*Token` prop accepts (Plan 2's PALETTE_TOKENS) are offered, so an option string can never
 * reach a CSS `var()` it wasn't meant for.
 */
export function paletteTokenField(label: string, options: string[]): CustomField<string> {
  const tokens = options.filter((t) => KNOWN.has(t));
  return {
    type: 'custom',
    label,
    render: ({ id, value, onChange, readOnly }) => (
      <fieldset className={styles.field} id={id} disabled={readOnly}>
        <legend className={styles.label}>{label}</legend>
        <div className={styles.swatches}>
          {tokens.map((token) => {
            const empty = token === 'none';
            return (
              <button
                key={token}
                type="button"
                aria-pressed={value === token}
                aria-label={humanizeValue(token)}
                title={humanizeValue(token)}
                className={styles.swatch}
                data-empty={empty ? '' : undefined}
                style={empty ? undefined : { background: `var(--sf-${token})` }}
                onClick={() => onChange(token)}
              />
            );
          })}
        </div>
        <p className={styles.chosen} aria-hidden="true">
          {tokens.includes(value) ? humanizeValue(value) : 'Not set'}
        </p>
      </fieldset>
    ),
  };
}
