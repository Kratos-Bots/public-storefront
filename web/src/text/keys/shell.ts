import { defineTextArea } from '@/text/define.ts';

/** Area `shell`: header, footer and navigation around every page (editable-text spec §6.1). */
export default defineTextArea('shell', {
  'nav.ariaLabel': { en: 'Site', note: 'Screen-reader name of a Links block left without its own label', max: 40 },
});
