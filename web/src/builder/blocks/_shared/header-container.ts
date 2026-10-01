import { part, partId, type ContainerSpec } from '@/builder/parts.ts';
import type { StyleKey } from '@/builder/style/model.ts';
import type { ComponentData, LayoutKind } from '@/builder/types.ts';

/** Header parts: no vertical spacing, margins, maxWidth or textSize (stage-4 spec ง9): the bar's height is fixed. */
export const BAR: readonly StyleKey[] = ['bg', 'fg', 'border', 'borderColor', 'borderStyle', 'radius', 'padX'];

/** `auto` follows the layout; the Telegram-shaped `webapp` variant only exists inside the web app (it falls back to `menu`). */
export const resolveVariant = (variant: unknown, layout: LayoutKind): 'storefront' | 'menu' | 'webapp' =>
  variant === 'storefront' || variant === 'menu' || variant === 'webapp'
    ? (variant === 'webapp' && layout !== 'webapp' ? 'menu' : variant) : layout;

const icon = (v: unknown) => (v === 'show' || v === 'hide' ? v : 'inherit');
const withIcon = (type: string, id: string, o: unknown): ComponentData => ({ type, props: { id: partId(id, type), icon: icon(o) } });

export const HEADER_CONTAINER: ContainerSpec = {
  family: 'header', insertSlot: 'end', required: ['HeaderBrand'],
  unique: ['HeaderBrand', 'HeaderBack', 'HeaderSearch', 'HeaderFilter', 'HeaderAccount', 'HeaderCart'],
  legacyProps: ['search', 'accountIcon', 'cartIcon'],
  // `nav` is never filled (spec ยง5.1) so Reset keeps owner content in it.
  defaultSlots: (props, { layout, id }) => {
    const v = resolveVariant(props.variant, layout);
    return {
      start: v === 'webapp' ? [part('HeaderBack', id), part('HeaderBrand', id)] : [part('HeaderBrand', id)],
      middle: props.search === false ? [] : [part('HeaderSearch', id)],
      end: [...(v === 'storefront' ? [] : [part('HeaderFilter', id)]), withIcon('HeaderAccount', id, props.accountIcon), withIcon('HeaderCart', id, props.cartIcon)],
    };
  },
};
