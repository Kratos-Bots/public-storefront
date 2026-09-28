import './template.css';
import type { TemplateSlots } from '@/templates/contract.ts';
import { LuxuryCatalogHero } from './slots/LuxuryCatalogHero.tsx';
import { LuxuryFooter } from './slots/LuxuryFooter.tsx';
import { LuxuryOverlay } from './slots/LuxuryOverlay.tsx';
import { LuxurySectionLabel } from './slots/LuxurySectionLabel.tsx';

export const slots: TemplateSlots = {
  Overlay: LuxuryOverlay,
  CatalogHero: LuxuryCatalogHero,
  SectionLabel: LuxurySectionLabel,
  Footer: LuxuryFooter,
};
