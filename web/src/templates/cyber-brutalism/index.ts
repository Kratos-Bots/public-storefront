import './template.css';
import type { TemplateSlots } from '@/templates/contract.ts';
import { CyberButtonAdornment } from './slots/CyberButtonAdornment.tsx';
import { CyberCatalogHero } from './slots/CyberCatalogHero.tsx';
import { CyberFooter } from './slots/CyberFooter.tsx';
import { CyberOverlay } from './slots/CyberOverlay.tsx';
import { CyberTopBar } from './slots/CyberTopBar.tsx';

// SectionLabel is the default: tokens.label.style = 'numbered' renders /01, /02 …
export const slots: TemplateSlots = {
  TopBar: CyberTopBar,
  Overlay: CyberOverlay,
  CatalogHero: CyberCatalogHero,
  Footer: CyberFooter,
  ButtonAdornment: CyberButtonAdornment,
};
