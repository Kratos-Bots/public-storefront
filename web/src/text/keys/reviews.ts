import { defineTextArea } from '@/text/define.ts';

/** Area `reviews`: the review form on the order page, the "how was your order" reminder and the shop's reviews page. */
export default defineTextArea('reviews', {
  // ── stars (form and read-only) ────────────────────────────────────────────
  'stars.count': { en: { one: '{count} star', other: '{count} stars' }, max: 40 },
  'stars.outOf': { en: { one: '{count} star out of {max}', other: '{count} stars out of {max}' }, max: 60 },

  // ── the form on the order page ────────────────────────────────────────────
  'form.title': { en: 'Rate your order', max: 60 },
  'form.lede': { en: 'Tell us how it went. Reviews are shown without your name.', max: 160 },
  'form.rating': { en: 'Your rating', max: 40 },
  'form.comment': { en: 'Your comments', max: 40 },
  'form.optional': { en: 'Optional', max: 30 },
  'form.placeholder': { en: 'What arrived, how it was packed, how quick it was', max: 120 },
  'form.counter': { en: '{count} of {max}', max: 40 },
  'form.submit': { en: 'Send review', max: 40 },
  'form.sending': { en: 'Sending', max: 40 },
  'form.pickRating': { en: 'Choose a rating to send your review.', max: 120 },
  'form.thanks': { en: 'Thank you for your review.', max: 120 },
  'form.networkError': { en: 'We could not send your review. Check your connection and try again.', max: 160 },
  'form.alreadyReviewed': { en: 'This order already has a review.', max: 120 },

  // ── a submitted review, read-only ─────────────────────────────────────────
  'sent.title': { en: 'Your review', max: 60 },
  'sent.pending': { en: 'Thanks, your review is awaiting approval.', max: 120 },
  'sent.approved': { en: 'Published', max: 60 },
  'sent.submitted': { en: 'Submitted', max: 60 },
  'sent.on': { en: 'Sent {date}', max: 60 },
  'sent.noComment': { en: 'No comments added.', max: 80 },

  // ── the reminder dialog ───────────────────────────────────────────────────
  'prompt.title': { en: 'How was your order?', max: 80 },
  'prompt.body': { en: 'Order {reference} has arrived. A rating takes a few seconds and helps other shoppers.', max: 200 },
  'prompt.review': { en: 'Leave a review', max: 40 },
  'prompt.later': { en: 'Not now', max: 40 },
  'prompt.close': { en: 'Close', max: 30 },

  // ── the public reviews page ───────────────────────────────────────────────
  'page.title': { en: 'Customer reviews', max: 60 },
  'page.lede': { en: 'From people who have received an order. No names are shown.', max: 160 },
  'page.average': { en: 'Average rating', max: 40 },
  'page.averageValue': { en: '{average} out of 5', max: 40 },
  'page.count': { en: { one: '{count} review', other: '{count} reviews' }, max: 40 },
  'page.empty.title': { en: 'No reviews yet', max: 60 },
  'page.empty.body': { en: 'Reviews from delivered orders will appear here.', max: 160 },
  'page.scale': { en: '/ 5', max: 20 },
  'page.loadMoreFailed': { en: 'More reviews did not load.', max: 80 },
  'page.loadMore': { en: 'Load more reviews', max: 40 },
  'page.loadFailedTitle': { en: 'Reviews did not load', max: 60 },
  'page.loadFailedBody': { en: 'Check your connection and try again.', max: 160 },
  'page.noComment': { en: 'Rated without a comment.', max: 80 },
  'link': { en: 'Customer reviews', max: 40 },
});
