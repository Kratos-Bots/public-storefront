import { useMemo, useState, type CSSProperties } from 'react';
import type { CustomField } from '@puckeditor/core';
import type { AnyBlock } from '@/builder/define.ts';
import type { BlockStyle, StyleKey, StyleSupport } from '@/builder/style/model.ts';
import { STYLE_LABELS } from '@/builder/style/labels.ts';
import { tokenLabel } from '@/builder/editor/custom-fields/palette-token.tsx';
import { onRadioGroupKeyDown, radioTabIndex } from '@/builder/editor/custom-fields/roving.ts';
import {
  contrastRatio, countSet, formatRatio, groupsFor, optionsFor, parseCssColor, setStyleKey, type Rgb, type StyleOption,
} from '@/builder/editor/custom-fields/style-model.ts';
import fieldStyles from '@/builder/editor/custom-fields/fields.module.css';
import styles from '@/builder/editor/custom-fields/style.module.css';
import '@/builder/editor/style-ghost.css';

const COLOURS: ReadonlySet<StyleKey> = new Set(['bg', 'fg', 'borderColor']);
const NEEDS_WIDTH: ReadonlySet<StyleKey> = new Set(['borderColor', 'borderStyle']);
const SIDE: Partial<Record<StyleKey, 'top' | 'bottom' | 'x' | 'above' | 'below'>> = {
  padTop: 'top', padBottom: 'bottom', padX: 'x', marginTop: 'above', marginBottom: 'below',
};
const RADIUS_PREVIEW: Record<string, string> = {
  none: '0', sm: 'var(--mantine-radius-sm)', md: 'var(--mantine-radius-md)', lg: 'var(--mantine-radius-lg)', card: 'var(--sf-card-radius)', pill: 'var(--sf-pill-radius)',
};
const SHADOW_PREVIEW: Record<string, string> = { card: 'var(--sf-card-shadow)', raised: 'var(--sf-card-shadow-hover)' };
const TEXT_PREVIEW: Record<string, string> = { sm: '0.8rem', lg: '1.05rem', xl: '1.2rem' };

/** Open/closed per block type, for this editor session only (spec §9.1). */
const openByType = new Map<string, boolean>();

/** A token's colour as the shop resolves it right now (a probe element: custom properties read raw). */
function resolveToken(token: string): Rgb | null {
  if (typeof document === 'undefined') return null;
  const probe = document.createElement('span');
  probe.style.color = `var(--sf-${token})`;
  probe.dataset.sfProbe = token;
  probe.hidden = true;
  document.body.appendChild(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return parseCssColor(colour ?? '');
}

function chipStyle(key: StyleKey, value: string | undefined): CSSProperties | undefined {
  if (value === undefined) return undefined;
  if (key === 'radius') return { borderRadius: RADIUS_PREVIEW[value] };
  if (key === 'shadow') return { boxShadow: SHADOW_PREVIEW[value] };
  if (key === 'textSize') return { fontSize: TEXT_PREVIEW[value] };
  return undefined;
}

function SideDiagram({ side }: { side: NonNullable<(typeof SIDE)[StyleKey]> }) {
  const lines = {
    top: <line x1="6" y1="7" x2="22" y2="7" />, bottom: <line x1="6" y1="21" x2="22" y2="21" />,
    x: <><line x1="7" y1="6" x2="7" y2="22" /><line x1="21" y1="6" x2="21" y2="22" /></>,
    above: <line x1="4" y1="2" x2="24" y2="2" />, below: <line x1="4" y1="26" x2="24" y2="26" />,
  }[side];
  return (
    <svg className={styles.diagram} viewBox="0 0 28 28" aria-hidden="true">
      <rect x="4" y="4" width="20" height="20" rx="2" className={styles.diagramBox} />
      <g className={styles.diagramSide}>{lines}</g>
    </svg>
  );
}

interface RowProps { styleKey: StyleKey; value: string | undefined; disabled: boolean; onPick: (v: string | undefined) => void }

function Row({ styleKey, value, disabled, onPick }: RowProps) {
  const label = STYLE_LABELS[styleKey];
  const options: StyleOption[] = optionsFor(styleKey);
  const checked = options.findIndex((o) => o.value === value);
  const colour = COLOURS.has(styleKey);
  const side = SIDE[styleKey];
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <span className={fieldStyles.label}>{label}</span>
        {value !== undefined && styleKey !== 'hide' ? (
          <button type="button" className={styles.reset} aria-label={`Reset ${label}`} title={`Reset ${label}`} onClick={() => onPick(undefined)}>×</button>
        ) : null}
      </div>
      <div className={styles.control}>
        {side ? <SideDiagram side={side} /> : null}
        <div
          role="radiogroup"
          aria-label={label}
          aria-disabled={disabled || undefined}
          className={colour ? fieldStyles.swatches : styleKey === 'hide' ? styles.stack : styles.chips}
          onKeyDown={(e) => { if (!disabled) onRadioGroupKeyDown(e, options.length, checked, (i) => onPick(options[i]!.value)); }}
        >
          {options.map((o, i) => {
            const name = colour ? (o.value === undefined ? 'Default' : tokenLabel(o.value)) : o.label;
            return (
              <button
                key={o.value ?? 'default'}
                type="button"
                role="radio"
                aria-checked={i === checked}
                aria-label={colour ? name : undefined}
                title={o.title ?? name}
                tabIndex={radioTabIndex(i, checked)}
                disabled={disabled}
                className={colour ? fieldStyles.swatch : styles.chip}
                data-empty={colour && o.value === undefined ? '' : undefined}
                style={colour ? (o.value === undefined ? undefined : { background: `var(--sf-${o.value})` }) : chipStyle(styleKey, o.value)}
                onClick={() => onPick(o.value)}
              >
                {colour ? null : styleKey === 'textSize' && o.value !== undefined ? (
                  <><span aria-hidden="true">A</span><span className={styles.visuallyHidden}>{o.label}</span></>
                ) : o.label}
              </button>
            );
          })}
        </div>
      </div>
      {disabled ? <p className={styles.note}>Pick a border width first.</p> : null}
    </div>
  );
}

function ContrastHint({ bg, fg }: { bg?: string; fg?: string }) {
  const ratio = useMemo(() => {
    if (!fg) return null;
    const a = resolveToken(bg ?? 'bg');
    const b = resolveToken(fg);
    return a && b ? contrastRatio(a, b) : null;
  }, [bg, fg]);
  if (ratio === null || !Number.isFinite(ratio) || ratio >= 4.5) return null;
  return <p className={styles.warn} role="status">{`Low contrast (${formatRatio(ratio)})`}</p>;
}

interface PanelProps { id: string; name: string; support: StyleSupport; value: BlockStyle | undefined; onChange: (v: BlockStyle | undefined) => void; readOnly: boolean }

function StylePanel({ id, name, support, value, onChange, readOnly }: PanelProps) {
  const [open, setOpen] = useState(() => openByType.get(name) ?? false);
  const count = countSet(value, support);
  const pick = (key: StyleKey) => (v: string | undefined) => onChange(setStyleKey(value, key, v, support));
  // Controlled: React owns `open` (Enter/Space on a summary fire click too), remembered per block type.
  const toggle = () => { const next = !open; openByType.set(name, next); setOpen(next); };
  return (
    <details className={`${fieldStyles.field} ${styles.panel}`} id={id} data-sf-style-panel="" open={open}>
      <summary className={styles.summary} onClick={(e) => { e.preventDefault(); toggle(); }}>
        {count > 0 ? `Style · ${count} set` : 'Style'}
      </summary>
      <fieldset className={styles.body} disabled={readOnly}>
        <div className={styles.bar}>
          <span className={styles.barNote}>Template default unless set</span>
          {count > 0 ? <button type="button" className={styles.resetAll} onClick={() => onChange(undefined)}>Reset style</button> : null}
        </div>
        {groupsFor(support).map((g) => (
          <section key={g.title} className={styles.group} aria-label={g.title}>
            <h4 className={styles.groupTitle}>{g.title}</h4>
            {g.keys.map((k) => (
              <Row key={k} styleKey={k} value={value?.[k]} disabled={NEEDS_WIDTH.has(k) && value?.border === undefined} onPick={pick(k)} />
            ))}
            {g.title === 'Colours' ? <ContrastHint bg={value?.bg} fg={value?.fg} /> : null}
          </section>
        ))}
      </fieldset>
    </details>
  );
}

/** Spec §9.1: the Style group, appended last by blockFields for every stylable block. */
export function styleField(def: AnyBlock): CustomField<BlockStyle | undefined> {
  const support = def.style;
  if (!support) throw new Error(`[builder] ${def.name} is not stylable`);
  return {
    type: 'custom',
    label: 'Style',
    render: ({ id, value, onChange, readOnly }) => (
      <StylePanel id={id} name={def.name} support={support} value={value} onChange={onChange} readOnly={Boolean(readOnly)} />
    ),
  };
}
