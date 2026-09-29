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
/** Slot props (typed `ComponentData[]` in P) arrive at render as `SlotRender`. */
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

/** The block's props from stored data: whole-object parse, else field by field onto defaults. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseBlockProps(def: BlockDef<any>, raw: Record<string, unknown>): Record<string, unknown> {
  const whole = def.schema.safeParse(raw);
  if (whole.success) return whole.data as Record<string, unknown>;
  const out: Record<string, unknown> = structuredClone(def.defaultProps) as Record<string, unknown>;
  if (def.schema instanceof z.ZodObject) {
    const shape = def.schema.shape as Record<string, z.ZodType>;
    for (const key of Object.keys(shape)) {
      const r = shape[key]!.safeParse(raw[key]);
      if (r.success) out[key] = r.data;
    }
  }
  return out;
}

// ── field helpers ────────────────────────────────────────────────────────────

/** A slot: an array of component-shaped children (the guard validates each child). */
export const slot = () => z.array(z.custom<ComponentData>((v) => isComponentLike(v)));

/** Richtext is an HTML string (spec §13 A2); the prop key must end in `Html`. */
export const richtext = () => z.string().max(20_000);

/** '', a site-relative path (not `//` or `/\`, both protocol-relative in browsers), or an https:/mailto:/tel: URL. */
export function isSafeHref(h: string): boolean {
  if (h === '') return true;
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
