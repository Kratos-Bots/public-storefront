import { BASE_TOKENS, COLOR_KEYS, defineTemplate } from '@/templates/define.ts';

export default defineTemplate({
  contractVersion: 1,
  id: 'modern',
  name: 'Modern',
  version: '1.0.0',
  description: 'The original storefront: glass bars, tracked mono-caps buttons, underlined inputs. Every colour, font and shape is yours to change.',
  author: 'Kratos Bots',
  schemes: ['dark', 'light'],
  presets: [{
    id: 'default',
    name: 'Default',
    scheme: 'dark',
    colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
    fonts: { heading: null, body: null, mono: null },
    radius: 'none',
  }],
  defaultPreset: 'default',
  tokens: BASE_TOKENS,
  editable: { colors: [...COLOR_KEYS], fonts: true, radius: true, density: true },
  options: [],
});
