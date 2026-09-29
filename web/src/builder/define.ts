import type { CSSProperties, ElementType, ReactNode } from 'react';
import { z } from 'zod';
import type { CoreOptions } from '@/templates/hooks.ts';
import type { HeaderIconMode } from '@/templates/define.ts';
import { isComponentLike, type ComponentData, type DocKey, type LayoutKind } from '@/builder/types.ts';

// Runtime-safe: nothing here may value-import @puckeditor/core (spec §13 A1).

export type BlockCategory = 'shell' | 'catalogue' | 'product' | 'commerce' | 'post-order' | 'content';
/** A slot prop at render time. No argument (or none of the three keys) = the children with no wrapper. */
export type SlotRender = (p?: { className?: string; style?: CSSProperties; as?: ElementType }) => ReactNode;
export interface BlockRenderContext { editing: boolean; docKey: DocKey; layout: LayoutKind }
/** Slot props (declared as REQUIRED `ComponentData[]` in P; an optional slot won't map) arrive at render as `SlotRender`. */
export type SlotProps<P> = { [K in keyof P]: P[K] extends ComponentData[] ? SlotRender : P[K] };

export interface BlockDef<P extends Record<string, unknown>> {
  name: string;
  label: string;
  category: BlockCategory;
  layouts: LayoutKind[] | 'all';
  /** A §5.3 route block (+ PageOutlet, ProductDetail): required on its route, may only appear there, locked in the editor. */
  routeBound: boolean;
  /** Prop names holding ComponentData[]. */
  slots: readonly (keyof P & string)[];
  /** Every prop except `id`; slot props use `slot()`. Parse failures fall back per field. */
  schema: z.ZodType<Omit<P, 'id'>>;
  defaultProps: Omit<P, 'id'>;
  /**
   * Must not call hooks directly: return JSX of an inner component. The editor (Plan 3)
   * may invoke it as a plain function.
   */
  render(props: SlotProps<P> & { puck: BlockRenderContext }): ReactNode;
}

export function defineBlock<P extends Record<string, unknown>>(def: BlockDef<P>): BlockDef<P> {
  return def;
}

/**
 * How a failed field is filled. `neutral` (every stored doc, via the guard): '' for a string, [] for
 * an array, the block's own default only for enums/numbers/booleans — never the insert-time
 * placeholder copy, which a shopper must not see. `defaults`: `defaultProps` (a freshly inserted block).
 */
export type FieldFallback = 'neutral' | 'defaults';

export interface ParsedBlockProps {
  props: Record<string, unknown>;
  /** Keys that fell back (`items`), and array items that were left out (`items[2]`), in order. */
  fallbacks: string[];
}

function neutralValue(schema: z.ZodType, safeDefault: unknown): unknown {
  if (schema instanceof z.ZodArray) return [];
  if (schema instanceof z.ZodString || schema.safeParse('').success) return '';
  return structuredClone(safeDefault);
}

/**
 * The block's props from stored data: whole-object parse, else field by field. An array field keeps
 * its valid items (each invalid one is reported as `key[i]`) before the whole field falls back.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseBlockPropsDetailed(def: BlockDef<any>, raw: Record<string, unknown>, fallback: FieldFallback = 'neutral'): ParsedBlockProps {
  const whole = def.schema.safeParse(raw);
  if (whole.success) return { props: whole.data as Record<string, unknown>, fallbacks: [] };
  const defaults = def.defaultProps as Record<string, unknown>;
  const out: Record<string, unknown> = structuredClone(defaults);
  const fallbacks: string[] = [];
  if (def.schema instanceof z.ZodObject) {
    const shape = def.schema.shape as Record<string, z.ZodType>;
    for (const key of Object.keys(shape)) {
      const field = shape[key]!;
      const value = raw[key];
      const r = field.safeParse(value);
      if (r.success) { out[key] = r.data; continue; }
      // Forward compat: a key the stored doc doesn't have (a prop added in a later release) takes
      // its default silently. Only a PRESENT value that fails its schema is a reported fallback.
      if (value === undefined) continue;
      if (field instanceof z.ZodArray && Array.isArray(value)) {
        const kept: unknown[] = [];
        const dropped: string[] = [];
        value.forEach((item, i) => {
          const ri = (field.element as z.ZodType).safeParse(item);
          if (ri.success) kept.push(ri.data);
          else dropped.push(`${key}[${i}]`);
        });
        const again = field.safeParse(kept);
        if (again.success) { out[key] = again.data; fallbacks.push(...dropped); continue; }
      }
      fallbacks.push(key);
      out[key] = fallback === 'neutral' ? neutralValue(field, defaults[key]) : structuredClone(defaults[key]);
    }
  }
  return { props: out, fallbacks };
}

/** As parseBlockPropsDetailed with `defaults` fallbacks (the editor's view of a block); props only. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseBlockProps(def: BlockDef<any>, raw: Record<string, unknown>): Record<string, unknown> {
  return parseBlockPropsDetailed(def, raw, 'defaults').props;
}

// ── field helpers ────────────────────────────────────────────────────────────

/** A slot: an array of component-shaped children (the guard validates each child). */
export const slot = () => z.array(z.custom<ComponentData>((v) => isComponentLike(v)));

/** Richtext is an HTML string (spec §13 A2); the prop key must end in `Html`. */
export const richtext = () => z.string().max(20_000);

/** '', a site-relative path (not `//` or `/\`, both protocol-relative in browsers), or an https:/mailto:/tel: URL. */
export function isSafeHref(h: string): boolean {
  if (h === '') return true;
  // Browsers strip tab/CR/LF from URLs, so `/<TAB>/x` would become `//x`: reject any control or whitespace char.
  if (/[\u0000- \u007f]/.test(h)) return false;
  if (h.startsWith('/')) return !/^\/[/\\]/.test(h);
  return /^(https:\/\/|mailto:|tel:)/i.test(h);
}
export const routeLink = () => z.string().max(2048).refine(isSafeHref, { message: 'Link must be a site path, https:, mailto: or tel:' });

export const MEDIA_SRC_RE = /^\/media\/storefront-pages\/media\/[a-f0-9]{32}\.(png|jpg|webp|gif)$/;
/** An uploaded image (spec §13 A3) or ''. */
export const mediaSrc = () => z.string().regex(MEDIA_SRC_RE).or(z.literal(''));

export const PALETTE_TOKENS = ['none', 'bg', 'bg-deep', 'surface', 'surface-2', 'surface-3', 'line', 'line-strong',
  'text', 'muted', 'faint', 'primary', 'primary-soft', 'success', 'warn', 'danger'] as const;
export type PaletteToken = typeof PALETTE_TOKENS[number];
export const paletteToken = () => z.enum(PALETTE_TOKENS);
export function tokenVar(t: PaletteToken): string | undefined {
  return t === 'none' ? undefined : `var(--sf-${t})`;
}

export const SPACING = { none: '0', xs: '0.5rem', sm: '1rem', md: '1.5rem', lg: '2.5rem', xl: '4rem' } as const;
export type SpacingKey = keyof typeof SPACING;
export const spacing = () => z.enum(['none', 'xs', 'sm', 'md', 'lg', 'xl']);

export const OVERRIDES = ['inherit', 'show', 'hide'] as const;
export type Override = typeof OVERRIDES[number];
export const override = () => z.enum(OVERRIDES);
export function boolOverride(o: Override): boolean | undefined {
  return o === 'show' ? true : o === 'hide' ? false : undefined;
}
export function iconOverride(o: Override): HeaderIconMode | undefined {
  return o === 'show' ? 'all' : o === 'hide' ? 'none' : undefined;
}
/** Drops undefined keys, so `inherit` leaves the store-wide core option in charge. */
export function compactScope(o: { [K in keyof CoreOptions]?: CoreOptions[K] | undefined }): Partial<CoreOptions> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Partial<CoreOptions>;
}
