import { defineTextArea } from '@/text/define.ts';

/** Area `faq`: the shop's FAQ, shown as a section of the Help page (the questions and answers are written in the admin). */
export default defineTextArea('faq', {
  'section.title': { en: 'Common questions', max: 60 },
});
