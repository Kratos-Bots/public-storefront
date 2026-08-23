/**
 * Append the prefilled message as ?text= — supported by wa.me/<number> and
 * t.me/<username> links. Other link shapes (wa.me/message/…, t.me/+invite) keep
 * working but open without the prefill.
 */
export function withPrefilledText(link: string | null, text: string): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    url.searchParams.set('text', text);
    return url.toString();
  } catch {
    return link;
  }
}

/** The prefilled chat message sent along with a "pay via chat" link after checkout. */
export function orderChatMessage(ref: string): string {
  return `I've just placed an order, here is my Order ID: ${ref}. I'd like to pay.`;
}
