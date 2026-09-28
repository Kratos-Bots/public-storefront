import { BASE_TOKENS, COLOR_KEYS, defineTemplate } from '@/templates/define.ts';

export default defineTemplate({
  contractVersion: 1,
  id: '__ID__',
  name: '__NAME__',
  version: '0.1.0',
  description: 'Describe the look in one sentence — the admin shows this under the thumbnail.',
  author: 'Your name',
  schemes: ['dark'],
  presets: [{
    id: 'default',
    name: 'Default',
    scheme: 'dark',
    colors: { primary: '#ffffff', bg: '#0f0f10', surface: '#18181b', text: '#f4f4f5', muted: '#a1a1aa', success: '#4ade80', warn: '#fbbf24', danger: '#f87171' },
    fonts: { heading: null, body: null, mono: null },
    radius: 'md',
  }],
  defaultPreset: 'default',
  tokens: BASE_TOKENS,
  editable: { colors: [...COLOR_KEYS], fonts: true, radius: true, density: true },
  options: [],
});
