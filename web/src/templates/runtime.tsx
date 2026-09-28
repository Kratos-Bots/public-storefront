import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useSettings } from '@/app/settings.ts';
import { BASE_TOKENS } from '@/templates/define.ts';
import { getTemplate } from '@/templates/registry.ts';
import type { ResolvedTheme } from '@/templates/resolve.ts';
import type { SlotBaseProps, SlotName, SlotPropsMap, TemplateModule, TemplateSlots } from '@/templates/slots.ts';
import { DEFAULT_SLOTS } from '@/templates/defaults/index.ts';

const pending = new Map<string, Promise<TemplateModule>>();
const settled = new Map<string, TemplateModule>();

/** One fetch per template per page load; a failure is forgotten so a later render can retry. */
export function loadTemplateModule(id: string): Promise<TemplateModule> {
  const entry = getTemplate(id);
  const key = entry.manifest.id;
  let p = pending.get(key);
  if (!p) {
    p = entry.load().then((mod) => { settled.set(key, mod); return mod; });
    p.catch(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}

/** Called from main.tsx with the id the last visit stored, before settings arrive. */
export function prefetchTemplate(id: string | null): void {
  if (!id) return;
  void loadTemplateModule(id).catch(() => undefined);
}

interface TemplateContextValue { resolved: ResolvedTheme | null; slots: TemplateSlots }
const NO_PROVIDER: TemplateContextValue = { resolved: null, slots: {} };
const TemplateContext = createContext<TemplateContextValue>(NO_PROVIDER);

/** Outside a provider (component tests) this is "modern, no custom slots". */
export function useTemplateContext(): TemplateContextValue {
  return useContext(TemplateContext);
}

export interface TemplateProviderProps {
  resolved: ResolvedTheme;
  /** Shown while the active template's chunk loads (first visit only; prefetch usually wins). */
  fallback: ReactNode;
  children: ReactNode;
  load?: (id: string) => Promise<TemplateModule>;
  peek?: (id: string) => TemplateModule | undefined;
  timeoutMs?: number;
}

const peekSettled = (id: string): TemplateModule | undefined => settled.get(id);

export function TemplateProvider({ resolved, fallback, children, load = loadTemplateModule, peek = peekSettled, timeoutMs = 4000 }: TemplateProviderProps) {
  const id = resolved.templateId;
  const [loaded, setLoaded] = useState<{ id: string; slots: TemplateSlots } | null>(() => {
    const mod = peek(id);
    return mod ? { id, slots: mod.slots ?? {} } : null;
  });
  // Once true, the provider has rendered real children at least once — the first chunk
  // resolved, failed, or timed out. A *later* template switch (settings refetch, admin
  // preview) must never fall back to `fallback` again: that would unmount the whole app
  // (Notifications/ClosedGate/RouterProvider) and wipe in-progress state such as a
  // half-filled checkout form. Instead the switch renders `children` straight away with
  // default slots until the new module lands or times out (see `slots` below).
  const everMounted = useRef(loaded !== null);

  // Refs, not deps: callers (tests) pass inline functions, and re-running the effect on every
  // render would refetch and re-arm the timeout forever. Only a template switch re-runs it.
  const loadRef = useRef(load);
  loadRef.current = load;
  const peekRef = useRef(peek);
  peekRef.current = peek;

  useEffect(() => {
    const already = peekRef.current(id);
    if (already) {
      everMounted.current = true;
      setLoaded((cur) => (cur?.id === id ? cur : { id, slots: already.slots ?? {} }));
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      console.warn(`[templates] "${id}" is taking longer than ${timeoutMs}ms — rendering default slots for now`);
      everMounted.current = true;
      if (live) setLoaded((cur) => (cur?.id === id ? cur : { id, slots: {} }));
    }, timeoutMs);
    loadRef.current(id).then(
      (mod) => { everMounted.current = true; if (live) setLoaded({ id, slots: mod.slots ?? {} }); },
      (err: unknown) => {
        console.warn(`[templates] "${id}" failed to load — rendering default slots`, err);
        everMounted.current = true;
        if (live) setLoaded({ id, slots: {} });
      },
    ).finally(() => clearTimeout(timer));
    return () => { live = false; clearTimeout(timer); };
  }, [id, timeoutMs]);

  // The previous template's slots never carry over to a new id — its CSS/root attributes
  // may not even be loaded yet, so a stale slot component could render against the wrong
  // tokens. Default slots stand in until the new id's own module lands.
  const slots = loaded?.id === id ? loaded.slots : {};
  const value = useMemo(() => ({ resolved, slots }), [resolved, slots]);
  if (!everMounted.current && (!loaded || loaded.id !== id)) return <>{fallback}</>;
  return <TemplateContext.Provider value={value}>{children}</TemplateContext.Provider>;
}

type SlotOwnProps<N extends SlotName> = Omit<SlotPropsMap[N], keyof SlotBaseProps>;

/**
 * Renders the active template's component for `name`, or modern's default. Base props
 * (brand, options, scheme, layout, tokens) are filled in here. A template's component is
 * wrapped in a display:contents div carrying data-sf-slot — defaults are not, so modern's
 * DOM is unchanged.
 */
export function Slot<N extends SlotName>(props: { name: N } & SlotOwnProps<N>) {
  const { name, ...own } = props;
  const ctx = useTemplateContext();
  const settings = useSettings();
  const custom = ctx.slots[name] as ComponentType<SlotPropsMap[N]> | undefined;
  const Component = (custom ?? DEFAULT_SLOTS[name]) as ComponentType<SlotPropsMap[N]>;
  const base: SlotBaseProps = {
    brand: settings.brand,
    options: ctx.resolved?.options ?? {},
    scheme: ctx.resolved?.scheme ?? settings.theme?.scheme ?? 'dark',
    layout: settings.features?.layout ?? 'storefront',
    tokens: ctx.resolved?.tokens ?? BASE_TOKENS,
  };
  // TS can't prove `{...base, ...own}` matches the specific `SlotPropsMap[N]` for a generic N
  // (it only sees the union of every slot's props) — an `unknown` intermediate is TS's own
  // suggested escape hatch for a generic cast it can't verify structurally.
  const element = createElement(Component, { ...base, ...own } as unknown as SlotPropsMap[N]);
  return custom ? <div data-sf-slot={name} style={{ display: 'contents' }}>{element}</div> : element;
}
