/** One question and its answer, as `GET storefront/faq` serves it: enabled sections with an answer, in the shop's order. */
export interface FaqSection { id: string; title: string; body: string }

export interface FaqData { sections: FaqSection[] }
