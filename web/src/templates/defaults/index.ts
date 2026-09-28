import type { ComponentType } from 'react';
import type { SlotName, SlotPropsMap } from '@/templates/slots.ts';
import { DefaultCatalogHero } from '@/templates/defaults/DefaultCatalogHero.tsx';
import { DefaultFooter } from '@/templates/defaults/DefaultFooter.tsx';
import { DefaultSectionLabel } from '@/templates/defaults/DefaultSectionLabel.tsx';

const Nothing = () => null;

/** Modern's slots — what renders whenever the active template leaves a slot out. */
export const DEFAULT_SLOTS: { [K in SlotName]: ComponentType<SlotPropsMap[K]> } = {
  TopBar: Nothing,
  Footer: DefaultFooter,
  CatalogHero: DefaultCatalogHero,
  SectionLabel: DefaultSectionLabel,
  Overlay: Nothing,
  ButtonAdornment: Nothing,
};
