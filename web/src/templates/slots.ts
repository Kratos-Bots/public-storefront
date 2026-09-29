import type { ComponentType, ReactNode } from 'react';
import type { Brand, LayoutKind, SupportLink } from '@/types/settings.ts';
import type { OptionValues, Scheme, TemplateTokens } from '@/templates/define.ts';

/** Filled in by <Slot> — callers never pass these. */
export interface SlotBaseProps {
  brand: Brand;
  options: OptionValues;   // resolved: manifest defaults ⊕ stored values
  scheme: Scheme;
  layout: LayoutKind;      // 'storefront' | 'menu' | 'webapp' (always 'webapp' inside Telegram)
  tokens: TemplateTokens;
}
/** Above the header, first child of both shells (not on the chromeless order page). */
export type TopBarProps = SlotBaseProps;
/** StorefrontShell: replaces the footer. MenuShell: rendered after <main>, before the contact strip. */
export interface FooterProps extends SlotBaseProps { supportLinks: SupportLink[]; hasChat: boolean }
/** Catalogue intro. grid = ProductGrid hero; list = ProductList welcome; wholesale = WholesaleCatalogPage welcome. */
export interface CatalogHeroProps extends SlotBaseProps {
  surface: 'grid' | 'list' | 'wholesale';
  tagline: string;
  welcomeMessage: string | null;
  productCount: number;
  categoryCount: number;
}
/** Eyebrow above a heading. page = the catalogue page title (index 1); group = a menu-layout category section (1-based). */
export interface SectionLabelProps extends SlotBaseProps { index: number; title: string; level: 'page' | 'group' }
/** Fixed decoration layer, last child of all three shells. Must be pointer-events: none. */
export type OverlayProps = SlotBaseProps;
/** Trailing adornment inside primary buttons. cta = the page's single main call to action.
 *  busy (optional) = the action behind this button is in flight (e.g. checkout's Place order
 *  while the order is being submitted) — a template may swap in a spinner glyph; callers that
 *  never have an in-flight state simply omit it. */
export interface ButtonAdornmentProps extends SlotBaseProps { variant: 'primary' | 'secondary'; cta: boolean; busy?: boolean }

export interface SlotPropsMap {
  TopBar: TopBarProps;
  Footer: FooterProps;
  CatalogHero: CatalogHeroProps;
  SectionLabel: SectionLabelProps;
  Overlay: OverlayProps;
  ButtonAdornment: ButtonAdornmentProps;
}
export type SlotName = keyof SlotPropsMap;
export type TemplateSlots = { [K in SlotName]?: ComponentType<SlotPropsMap[K]> };
export interface TemplateModule { slots?: TemplateSlots }
export type SlotChildren = ReactNode;
