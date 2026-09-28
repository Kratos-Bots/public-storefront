import './template.css';
import type { TemplateSlots } from '@/templates/contract.ts';
import { BentoCatalogHero } from './slots/BentoCatalogHero.tsx';
import { BentoFooter } from './slots/BentoFooter.tsx';
import { BentoOverlay } from './slots/BentoOverlay.tsx';

// SectionLabel is the default: tokens.label.style = 'plain' renders nothing — no eyebrows.
export const slots: TemplateSlots = {
  CatalogHero: BentoCatalogHero,
  Footer: BentoFooter,
  Overlay: BentoOverlay,
};
