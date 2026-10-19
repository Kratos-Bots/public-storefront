import { defineTextArea } from '@/text/define.ts';

/** Area `support`: the tickets page, the new-ticket form, the conversation, and the entry points from the account and an order. */
export default defineTextArea('support', {
  // ── the tickets page ──────────────────────────────────────────────────────
  'page.lede': { en: 'Questions about an order or anything else? Send us a message.', max: 160 },
  'page.new': { en: 'New ticket', max: 40 },
  'page.yours': { en: 'Your tickets', max: 60 },
  'page.empty': { en: 'No tickets yet.', max: 80 },
  'page.signIn': { en: 'Sign in to open a ticket', max: 80 },
  'page.preferChat': { en: 'Prefer chat?', max: 60 },
  'page.fromSupport': { en: 'Support', max: 30 },
  'page.preview': { en: '{who}: {text}', max: 40 },

  // ── status labels ─────────────────────────────────────────────────────────
  'status.needsReply': { en: 'Waiting', max: 30 },
  'status.waiting': { en: 'Reply', max: 30 },
  'status.closed': { en: 'Closed', max: 30 },
  'general': { en: 'General', max: 40 },

  // ── the new-ticket form ───────────────────────────────────────────────────
  'new.title': { en: 'New ticket', max: 60 },
  'new.aboutOrder': { en: 'About an order', max: 60 },
  'new.other': { en: 'Something else', max: 60 },
  'new.whichOrder': { en: 'Which order?', max: 60 },
  'new.moreOrders': { en: 'Show older orders', max: 60 },
  'new.orderSubject': { en: 'Order {reference}', max: 60 },
  'new.subject': { en: 'Subject', max: 40 },
  'new.message': { en: 'Message', max: 40 },
  'new.addPhotos': { en: 'Add photos', max: 40 },
  'new.removePhoto': { en: 'Remove photo', max: 40 },
  'new.photoLimit': { en: 'Up to {max} photos', max: 60 },
  'new.send': { en: 'Send', max: 30 },
  'new.disabled': { en: 'New tickets are not being accepted right now.', max: 120 },
  'new.back': { en: 'Back to support', max: 40 },

  // ── the conversation ──────────────────────────────────────────────────────
  'thread.you': { en: 'You', max: 30 },
  'thread.opened': { en: 'Ticket opened', max: 60 },
  'thread.closed': { en: 'Ticket closed', max: 60 },
  'thread.reopened': { en: 'Ticket reopened', max: 60 },
  'thread.placeholder': { en: 'Write a message…', max: 60 },
  'thread.close': { en: 'Close ticket', max: 40 },
  'thread.closedNote': { en: 'This ticket is closed. Replying reopens it.', max: 120 },
  'thread.expired': { en: 'This ticket is closed.', max: 80 },
  'thread.newTicket': { en: 'Open a new ticket', max: 60 },
  'thread.viewOrder': { en: 'View order', max: 40 },
  'thread.failed': { en: "Couldn't send. Tap to retry.", max: 80 },

  // ── photos and entry points ───────────────────────────────────────────────
  'photo.invalid': { en: 'Photos must be JPEG, PNG, WebP or GIF, up to 5 MB.', max: 120 },
  'account.nav': { en: 'Support', max: 30 },
  'order.getHelp': { en: 'Get help with this order', max: 60 },
});
