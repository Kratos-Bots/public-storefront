import { defineTextArea } from '@/text/define.ts';

/** Area `faq`: the shop's FAQ page, where the shop's questions and answers (written in the admin) are shown. */
export default defineTextArea('faq', {
  'page.title': { en: 'Frequently asked questions', max: 60 },
  'page.documentTitle': { en: '{page} — {shop}', max: 100 },
  'page.empty.title': { en: 'No questions yet', max: 60 },
  'page.empty.body': { en: 'The shop has not added any answers yet. Please check back soon.', max: 160 },
  'page.loadFailedTitle': { en: "We couldn't load the questions", max: 80 },
  'page.loadFailedBody': { en: 'Check your connection and try again.', max: 160 },
});
