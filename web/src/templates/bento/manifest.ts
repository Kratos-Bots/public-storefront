import { BASE_TOKENS, COLOR_KEYS, defineTemplate, type TemplatePreset } from '@/templates/define.ts';

// Display face is Bricolage Grotesque; body stays on the self-hosted Inter stack (null), and the
// mono voice (null) falls back to the body face with tabular figures — prices read as money, not code.
const FONTS = { heading: { family: 'Bricolage Grotesque', weights: [600, 700, 800] }, body: null, mono: null };

const DARK = { bg: '#0a0a0a', surface: '#141414', text: '#f0f0f0', muted: '#8f8f8f', success: '#40c057', warn: '#f59f00', danger: '#fa5252' };
const LIGHT = { bg: '#f5f5f4', surface: '#ffffff', text: '#111111', muted: '#62626b', success: '#2b8a3e', warn: '#b35c00', danger: '#c92a2a' };

/** One dark and one light preset per store type: the accent follows what the shop sells. */
function storeType(id: string, name: string, dark: string, light: string): TemplatePreset[] {
  return [
    { id: `${id}-dark`, name: `${name} (dark)`, scheme: 'dark', radius: 'lg', fonts: FONTS, colors: { ...DARK, primary: dark } },
    { id: `${id}-light`, name: `${name} (light)`, scheme: 'light', radius: 'lg', fonts: FONTS, colors: { ...LIGHT, primary: light } },
  ];
}

export default defineTemplate({
  contractVersion: 1,
  id: 'bento',
  name: 'Bento',
  version: '1.0.0',
  description: 'Asymmetric cells on one grid: a shop board of real store facts, a promoted first product, and one accent picked by what the store sells — tech, fashion, wellness, home, grocery or mono, each in dark and light.',
  author: 'Kratos Bots',
  schemes: ['dark', 'light'],
  presets: [
    ...storeType('tech', 'Tech & electronics', '#3b82f6', '#2563eb'),
    ...storeType('fashion', 'Fashion & apparel', '#f97316', '#c2410c'),
    ...storeType('wellness', 'Beauty & wellness', '#14b8a6', '#0f766e'),
    ...storeType('home', 'Home & lifestyle', '#f59e0b', '#b45309'),
    ...storeType('grocery', 'Food & grocery', '#40c057', '#237032'),
    ...storeType('mono', 'Monochrome', '#f0f0f0', '#111111'),
  ],
  defaultPreset: 'tech-dark',
  tokens: {
    ...BASE_TOKENS,
    button: { radius: 12, fill: 'solid', transform: 'none', tracking: { sm: '0', md: '0', lg: '0' }, weight: 600, font: 'body' },
    card: { radius: 18, border: '1px solid var(--sf-line)', shadow: 'none', shadowHover: 'none' },
    heading: { weight: 700, tracking: '-0.02em', transform: 'none' },
    label: { style: 'plain' },
    input: { style: 'box' },
    chassis: 'flat',
    badge: { radius: 'pill' },
  },
  editable: { colors: [...COLOR_KEYS], fonts: false, radius: false, density: true },
  options: [
    { key: 'dispatch', type: 'boolean', label: 'Dispatch cell', help: 'Shows the next order cut-off on the shop board. Hidden anyway when no dispatch schedule is set.', default: true },
    { key: 'contact', type: 'boolean', label: 'Contact cell', help: 'Shows your WhatsApp and Telegram links on the shop board. Hidden anyway when neither is set.', default: true },
    { key: 'featured', type: 'boolean', label: 'Feature the first product', help: 'The first product in each list gets a large tile.', default: true },
  ],
  preview: './preview.webp',
});
