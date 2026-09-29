import { block, doc, type DefaultEntry } from '@/builder/defaults/helpers.ts';

// v0.6.0's StorefrontShell / MenuShell / WebAppShell, top to bottom (the frame adds the system mounts).
export const DEFAULTS: DefaultEntry[] = [
  { docKey: 'shell', layouts: ['storefront'], doc: doc([block('Header'), block('NoticeBanners'), block('CutoffBar'), block('PageOutlet'), block('Footer')]) },
  { docKey: 'shell', layouts: ['menu'], doc: doc([block('Header'), block('NoticeBanners'), block('CutoffBar'), block('PageOutlet'), block('Footer'), block('ContactStrip')]) },
  { docKey: 'shell', layouts: ['webapp'], doc: doc([block('Header'), block('NoticeBanners'), block('CutoffBar'), block('PageOutlet')]) },
];
