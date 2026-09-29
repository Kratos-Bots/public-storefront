import { BASE_TOKENS, COLOR_KEYS, defineTemplate } from '@/templates/define.ts';

const TEKTUR = { family: 'Tektur', weights: [400, 600, 700, 900] };
const FONTS = { heading: TEKTUR, body: TEKTUR, mono: { family: 'Share Tech Mono', weights: [400] } };

export default defineTemplate({
  contractVersion: 1,
  id: 'cyber-brutalism',
  name: 'Cyber Brutalism',
  version: '1.0.0',
  description: 'A live system, not a brochure: heavy uppercase type on a hard grid, mono readouts of real store data, one acid accent, zero radius, 1px borders.',
  author: 'Kratos Bots',
  schemes: ['dark', 'light'],
  presets: [
    {
      id: 'acid-dark', name: 'Acid Dark', scheme: 'dark', radius: 'none', fonts: FONTS,
      colors: { primary: '#d4ff00', bg: '#0d0d0d', surface: '#1a1a1a', text: '#ffffff', muted: '#8a8a8a', success: '#00ff88', warn: '#ffb800', danger: '#ff3b30' },
    },
    {
      id: 'purple-light', name: 'Purple Light', scheme: 'light', radius: 'none', fonts: FONTS,
      colors: { primary: '#6b3ff6', bg: '#f4f4ee', surface: '#e8e8e2', text: '#111111', muted: '#5f5f5a', success: '#00a35c', warn: '#b37400', danger: '#d0021b' },
    },
  ],
  defaultPreset: 'acid-dark',
  tokens: {
    ...BASE_TOKENS,
    button: { radius: 0, fill: 'solid', transform: 'uppercase', tracking: { sm: '0.04em', md: '0.04em', lg: '0.04em' }, weight: 600, font: 'heading' },
    card: { radius: 0, border: '1px solid var(--sf-line)', shadow: 'none', shadowHover: 'none' },
    heading: { weight: 700, tracking: '-0.02em', transform: 'uppercase' },
    label: { style: 'numbered' },
    input: { style: 'underline' },
    chassis: 'flat',
    glass: 'off', // no frosted chrome: Plan 2's shared rules paint .glass bars and Mantine overlays solid
    badge: { radius: 0 },
  },
  editable: { colors: [...COLOR_KEYS], fonts: false, radius: false, density: true },
  options: [
    { key: 'systemBar', type: 'boolean', label: 'System bar', help: 'SYS.TIME / NODE / SKU strip above the header.', default: true },
    { key: 'statusBar', type: 'boolean', label: 'Bottom status bar', help: '"CONNECTION SECURE · ACCESS GRANTED" strip at the foot of the page. Gives way to the cart bar on phones.', default: true },
    { key: 'crosshairs', type: 'boolean', label: 'Crosshair marks', help: '+ marks at the hero, footer and screen corners (hidden on small phones).', default: true },
    { key: 'showFooter', type: 'boolean', label: 'Footer', help: 'The striped footer: brand, support links, contact and node row. Hiding it also removes the bottom status bar.', default: true },
    { key: 'buttonArrow', type: 'boolean', label: 'Button arrow', help: 'The ↗ arrow on primary buttons.', default: true },
    { key: 'nodeLabel', type: 'text', label: 'Node label', help: 'Shown as NODE: … in the system bar and footer.', default: 'NODE_01', maxLength: 24 },
  ],
  preview: './preview.webp',
});
