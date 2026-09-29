import { BASE_TOKENS, COLOR_KEYS, defineTemplate } from '@/templates/define.ts';

// Heading and body stay on the self-hosted Inter Variable stack (null) — it already
// covers 400–800, so loading Inter from Google Fonts too would be a wasted request.
const FONTS = { heading: null, body: null, mono: { family: 'JetBrains Mono', weights: [400, 500] } };

export default defineTemplate({
  contractVersion: 1,
  id: 'dark-luxury',
  name: 'Dark Luxury',
  version: '1.0.0',
  description: 'Near-black ground, one warm metallic accent, film grain and a single soft glow. Borderless raised cards and glowing outlined buttons — premium without ornament.',
  author: 'Kratos Bots',
  schemes: ['dark'],
  presets: [
    {
      id: 'gold', name: 'Gold', scheme: 'dark', radius: 'lg', fonts: FONTS,
      colors: { primary: '#d4a03c', bg: '#0a0907', surface: '#161412', text: '#f0ebe0', muted: '#8a8070', success: '#3d9e5c', warn: '#c98a2e', danger: '#b83c38' },
    },
    {
      id: 'silver', name: 'Silver', scheme: 'dark', radius: 'lg', fonts: FONTS,
      colors: { primary: '#b4c0d4', bg: '#080809', surface: '#121316', text: '#eceef5', muted: '#808898', success: '#3d9e5c', warn: '#c9a24a', danger: '#b83c38' },
    },
    {
      id: 'emerald', name: 'Emerald', scheme: 'dark', radius: 'lg', fonts: FONTS,
      colors: { primary: '#42b872', bg: '#070908', surface: '#101410', text: '#e8f2ec', muted: '#708078', success: '#3d9e5c', warn: '#c9a24a', danger: '#b83c38' },
    },
    {
      id: 'crimson', name: 'Crimson', scheme: 'dark', radius: 'lg', fonts: FONTS,
      colors: { primary: '#d9486a', bg: '#09070a', surface: '#130f14', text: '#f2eaf0', muted: '#907080', success: '#3d9e5c', warn: '#c9a24a', danger: '#e0524f' },
    },
  ],
  defaultPreset: 'gold',
  tokens: {
    ...BASE_TOKENS,
    button: { radius: 10, fill: 'outline-glow', transform: 'none', tracking: { sm: '0', md: '0', lg: '0' }, weight: 600, font: 'body' },
    card: {
      radius: 16,
      border: 'none',
      shadow: 'inset 0 1px 0 rgba(255, 248, 230, 0.08), 0 4px 24px rgba(0, 0, 0, 0.45)',
      shadowHover: 'inset 0 1px 0 rgba(255, 248, 230, 0.10), 0 12px 40px rgba(0, 0, 0, 0.55)',
    },
    heading: { weight: 700, tracking: '-0.03em', transform: 'none' },
    label: { style: 'bracket' },
    input: { style: 'box' },
    chassis: 'flat',
    badge: { radius: 'pill' },
  },
  editable: { colors: [...COLOR_KEYS], fonts: false, radius: false, density: true },
  options: [
    { key: 'grain', type: 'boolean', label: 'Grain texture', help: 'A faint film grain over the whole page.', default: true },
    { key: 'orb', type: 'boolean', label: 'Hero glow', help: 'One soft accent-coloured glow behind the catalogue intro.', default: true },
    { key: 'showFooter', type: 'boolean', label: 'Footer', help: 'The rounded panel at the foot of the page. Hiding it also hides the ordering status badge.', default: true },
    { key: 'statusBadge', type: 'boolean', label: 'Ordering status badge', help: 'Shows [ACCEPTING ORDERS] or [ORDERING PAUSED] in the footer.', default: true },
  ],
  preview: './preview.webp',
});
