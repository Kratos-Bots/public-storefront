import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSettingsQuery } from '@/app/settings.ts';
import { blockDef } from '@/builder/rules.ts';
import type { ComponentData, LayoutKind } from '@/builder/types.ts';
import { ROOT_ZONE } from '@/builder/editor/config.ts';
import { forEachComponent } from '@/builder/editor/page-set.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import { useGetPuck, usePuck } from '@/builder/editor/use-puck.ts';
import { CARD_LINKS, ownerBlockCount, partStates, withDefaultArrangement, withPartAdded, type PartState } from '@/builder/editor/container-parts.ts';
import { LockIcon, PlusIcon, TipIcon, WarnIcon } from '@/builder/editor/icons.tsx';
import styles from '@/builder/editor/ContainerPanel.module.css';

// Editor-only copy (spec §7.1, §11).
export const WHOLESALE_NOTICE = 'Wholesale mode is on: shoppers see the trade list here. This arrangement shows when wholesale mode is off.';
export const PINNED_ADD_NOTICE = "In the menu and web app the add to cart button is pinned to the sheet's footer, within thumb reach, so it isn't part of this arrangement.";
export const RESET_HINT = 'Puts every part back where it starts. Your content blocks inside are removed; settings are kept.';

const WHOLESALE_CONTAINERS = new Set(['ProductGrid', 'ProductList']);

function notices(type: string, layout: LayoutKind, wholesale: boolean): string[] {
  const out: string[] = [];
  if (wholesale && WHOLESALE_CONTAINERS.has(type)) out.push(WHOLESALE_NOTICE);
  if (type === 'ProductDetail' && layout !== 'storefront') out.push(PINNED_ADD_NOTICE);
  return out;
}

const stateText = (p: PartState) => (!p.present ? 'Removed' : p.required ? 'Required' : 'On the page');

/**
 * Under a selected block's fields (spec §11): for a container, its notices, the Parts list with
 * Add and Reset arrangement; for any block drawing product cards, links to the card designs.
 */
export function ContainerPanel() {
  const selected = usePuck((s) => s.selectedItem) as ComponentData | null;
  const dispatch = usePuck((s) => s.dispatch);
  const getPuck = useGetPuck();
  const layout = useEditorStore((s) => s.layout);
  const wholesale = useSettingsQuery().data?.features?.wholesale === true;
  const id = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const rootRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState('');
  // The part just added: its row takes focus once it has re-rendered (its Add button is gone).
  const [focusPart, setFocusPart] = useState<string | null>(null);

  const type = selected?.type ?? '';
  const selectedId = typeof selected?.props?.id === 'string' ? selected.props.id : null;
  const isContainer = !!blockDef(type)?.container && selectedId !== null;
  const parts = useMemo(() => (selected && isContainer ? partStates(selected, layout) : []), [selected, isContainer, layout]);
  const owned = useMemo(() => (selected && isContainer ? ownerBlockCount(selected) : 0), [selected, isContainer]);
  const links = Object.hasOwn(CARD_LINKS, type) ? CARD_LINKS[type]! : [];

  // A different block selected: an earlier announcement no longer applies.
  useEffect(() => { setStatus(''); setFocusPart(null); }, [selectedId]);
  useEffect(() => {
    if (!focusPart) return;
    rootRef.current?.querySelector<HTMLElement>(`[data-part-type="${CSS.escape(focusPart)}"] [data-part-label]`)?.focus();
    setFocusPart(null);
  }, [focusPart, parts]);

  if (!selected || (!isContainer && links.length === 0)) return null;

  /** One `replace` built from the item Puck holds now (not the rendered one), so no edit is lost. */
  const commit = (build: (current: ComponentData) => ComponentData): boolean => {
    const api = getPuck();
    const sel = selectedId ? api.getSelectorForId(selectedId) : undefined;
    const current = sel ? (api.getItemBySelector(sel) as ComponentData | undefined) : undefined;
    if (!sel || !current) return false;
    dispatch({ type: 'replace', destinationIndex: sel.index, destinationZone: sel.zone ?? ROOT_ZONE, data: build(current) });
    return true;
  };
  const add = (p: PartState) => {
    const taken = new Set<string>();
    forEachComponent(getPuck().appState.data.content as ComponentData[], (c) => { if (typeof c.props.id === 'string') taken.add(c.props.id); });
    if (!commit((current) => withPartAdded(current, p.type, layout, taken))) return;
    setStatus(`${p.label} added`);
    setFocusPart(p.type);
  };
  const reset = () => {
    if (!commit((current) => withDefaultArrangement(current, layout))) return;
    setStatus('Arrangement reset');
    resetRef.current?.focus();
  };
  const shown = isContainer ? notices(type, layout, wholesale) : [];
  const ownedText = owned === 1 ? 'Also removes 1 block you added' : `Also removes ${owned} blocks you added`;

  return (
    <div ref={rootRef} className={styles.root} data-sfb-container-panel="">
      <p className={styles.visuallyHidden} role="status" aria-live="polite">{status}</p>
      {isContainer && (
        <section className={styles.section} aria-labelledby={`${id}-parts`}>
          <h3 id={`${id}-parts`} className={styles.title}>Parts</h3>
          {shown.map((text) => (
            <p key={text} className={styles.notice} role="note"><TipIcon />{text}</p>
          ))}
          <ul role="list" aria-label="Parts" className={styles.list}>
            {parts.map((p) => (
              <li key={p.type} className={styles.part} data-state={p.present ? 'on' : 'off'} data-part-type={p.type}>
                <span className={styles.node} aria-hidden="true" />
                <span className={styles.text}>
                  <span className={styles.label} data-part-label="" tabIndex={-1}>{p.label}</span>
                  <span className={styles.state}>{p.required && p.present && <LockIcon />}{stateText(p)}</span>
                </span>
                {!p.present && (
                  <button type="button" className={styles.add} aria-label={`Add ${p.label}`} onClick={() => add(p)}>
                    <PlusIcon />Add
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className={styles.reset}>
            <button
              ref={resetRef}
              type="button"
              className={styles.secondary}
              aria-describedby={owned > 0 ? `${id}-owned ${id}-reset` : `${id}-reset`}
              onClick={reset}
            >
              Reset arrangement
            </button>
            {owned > 0 && <p id={`${id}-owned`} className={styles.warn}><WarnIcon />{ownedText}</p>}
            <p id={`${id}-reset`} className={styles.hint}>{RESET_HINT}</p>
          </div>
        </section>
      )}
      {links.length > 0 && (
        <section className={styles.section} aria-labelledby={`${id}-cards`}>
          <h3 id={`${id}-cards`} className={styles.title}>Product cards</h3>
          <div className={styles.links}>
            {links.map((l) => (
              <button key={l.key} type="button" className={styles.secondary} onClick={() => useEditorStore.getState().selectDoc(l.key)}>
                {l.label}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
