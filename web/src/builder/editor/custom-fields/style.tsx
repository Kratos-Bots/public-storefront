import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
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
import { paymentRequiredNote, requiredByParent } from '@/builder/editor/container-parts.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { useGetPuck } from '@/builder/editor/use-puck.ts';
import { blockDef } from '@/builder/rules.ts';
import type { ComponentData } from '@/builder/types.ts';
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

/** Said under the Header's Visibility row: the pinned notices and the web app's cart/back chrome ride on it. */
const HEADER_HIDE_WARNING = 'Hiding the header also hides its pinned notices (and, in the Telegram web app layout, the cart and back buttons).';

interface RowProps {
  styleKey: StyleKey; value: string | undefined; disabled: boolean; onPick: (v: string | undefined) => void;
  /** A one-line warning under the row, read as the radiogroup's description. */
  warning?: string;
}

function Row({ styleKey, value, disabled, onPick, warning }: RowProps) {
  const noteId = useId();
  const note = disabled ? 'Pick a border width first.' : warning;
  const label = STYLE_LABELS[styleKey];
  const options: StyleOption[] = optionsFor(styleKey);
  const checked = options.findIndex((o) => o.value === value);
  const colour = COLOURS.has(styleKey);
  const side = SIDE[styleKey];
  const group = useRef<HTMLDivElement>(null);
  // The reset button unmounts once its key is cleared: hand focus to the row's Default radio.
  const reset = () => {
    onPick(undefined);
    group.current?.querySelector<HTMLElement>('[role="radio"]')?.focus();
  };
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <span className={fieldStyles.label}>{label}</span>
        {value !== undefined && styleKey !== 'hide' ? (
          <button type="button" className={styles.reset} aria-label={`Reset ${label}`} title={`Reset ${label}`} onClick={reset}>×</button>
        ) : null}
      </div>
      <div className={styles.control}>
        {side ? <SideDiagram side={side} /> : null}
        <div
          ref={group}
          role="radiogroup"
          aria-label={label}
          aria-disabled={disabled || undefined}
          aria-describedby={note ? noteId : undefined}
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
      {note ? <p id={noteId} className={disabled ? styles.note : styles.warn}>{note}</p> : null}
    </div>
  );
}

/**
 * The probe touches the DOM, so it runs in a layout effect (not during render). The live region
 * stays mounted, empty when there is nothing to say, so a warning that appears later is announced.
 */
function ContrastHint({ bg, fg }: { bg?: string; fg?: string }) {
  const [ratio, setRatio] = useState<number | null>(null);
  useLayoutEffect(() => {
    const a = fg ? resolveToken(bg ?? 'bg') : null;
    const b = fg ? resolveToken(fg) : null;
    setRatio(a && b ? contrastRatio(a, b) : null);
  }, [bg, fg]);
  const low = ratio !== null && Number.isFinite(ratio) && ratio < 4.5;
  return <p className={styles.warn} role="status">{low ? `Low contrast (${formatRatio(ratio)})` : null}</p>;
}

interface PanelProps {
  name: string; support: StyleSupport; value: BlockStyle | undefined; onChange: (v: BlockStyle | undefined) => void; readOnly: boolean;
  /** The container this part sits in requires it: it can't be hidden (stage-4 spec §11). */
  required?: boolean; note?: string | null;
}

/**
 * A part the container it sits in requires loses `hide`; payment parts say where they are required.
 * The container is the nearest ancestor with a container spec (Puck's `getParentById`).
 */
function useRequiredHere(def: AnyBlock): { required: boolean; note: string | null } {
  // Outside a <Puck> (the field's own tests) the hook throws: it then throws on every render.
  let getPuck: ReturnType<typeof useGetPuck> | null = null;
  try { getPuck = useGetPuck(); } catch { /* not in a canvas */ }
  const layout = useEditorStore((s) => s.layout);
  if (!def.part || !getPuck) return { required: false, note: null };
  let required = false;
  try {
    const api = getPuck();
    const id = (api.selectedItem as ComponentData | null)?.props?.id;
    let parent = typeof id === 'string' ? (api.getParentById(id) as ComponentData | undefined) : undefined;
    for (let guard = 0; parent && guard < 16 && !blockDef(parent.type)?.container; guard += 1) {
      const pid = parent.props?.id;
      parent = typeof pid === 'string' ? (api.getParentById(pid) as ComponentData | undefined) : undefined;
    }
    required = requiredByParent(def.name, parent, layout);
  } catch { /* outside a canvas: nothing is required */ }
  return { required, note: def.part.family === 'payment' ? paymentRequiredNote(def.name, layout) : null };
}

function StylePanel({ name, support, value, onChange, readOnly, required, note }: PanelProps) {
  const [open, setOpen] = useState(() => openByType.get(name) ?? false);
  const summary = useRef<HTMLElement>(null);
  const count = countSet(value, support);
  const pick = (key: StyleKey) => (v: string | undefined) => onChange(setStyleKey(value, key, v, support));
  // Controlled: React owns `open` (Enter/Space on a summary fire click too), remembered per block type.
  const toggle = () => { const next = !open; openByType.set(name, next); setOpen(next); };
  return (
    <details className={`${fieldStyles.field} ${styles.panel}`} data-sf-style-panel="" open={open}>
      <summary ref={summary} className={styles.summary} onClick={(e) => { e.preventDefault(); toggle(); }}>
        {count > 0 ? `Style · ${count} set` : 'Style'}
      </summary>
      <fieldset className={styles.body} disabled={readOnly}>
        <div className={styles.bar}>
          <span className={styles.barNote}>Template default unless set</span>
          {count > 0 ? <button type="button" className={styles.resetAll} onClick={() => { onChange(undefined); summary.current?.focus(); }}>Reset style</button> : null}
        </div>
        {note ? <p className={styles.note}>{note}</p> : null}
        {groupsFor(support).map((g) => (required ? { ...g, keys: g.keys.filter((k) => k !== 'hide') } : g)).filter((g) => g.keys.length > 0).map((g) => (
          <section key={g.title} className={styles.group} aria-label={g.title}>
            <h4 className={styles.groupTitle}>{g.title}</h4>
            {g.keys.map((k) => (
              <Row key={k} styleKey={k} value={value?.[k]} disabled={NEEDS_WIDTH.has(k) && value?.border === undefined} onPick={pick(k)}
                warning={name === 'Header' && k === 'hide' ? HEADER_HIDE_WARNING : undefined} />
            ))}
            {g.title === 'Colours' ? <ContrastHint bg={value?.bg} fg={value?.fg} /> : null}
          </section>
        ))}
      </fieldset>
    </details>
  );
}

function StyleField({ def, ...rest }: { def: AnyBlock; support: StyleSupport; value: BlockStyle | undefined; onChange: (v: BlockStyle | undefined) => void; readOnly: boolean }) {
  const here = useRequiredHere(def);
  return <StylePanel name={def.name} {...rest} required={here.required} note={here.note} />;
}

/** Spec §9.1: the Style group, appended last by blockFields for every stylable block. */
export function styleField(def: AnyBlock): CustomField<BlockStyle | undefined> {
  const support = def.style;
  if (!support) throw new Error(`[builder] ${def.name} is not stylable`);
  return {
    type: 'custom',
    label: 'Style',
    render: ({ value, onChange, readOnly }) => <StyleField def={def} support={support} value={value} onChange={onChange} readOnly={Boolean(readOnly)} />,
  };
}
