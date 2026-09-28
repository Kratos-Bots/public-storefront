export interface Headline { muted: string; bright: string }

/**
 * The dark-luxury headline move: every word the same bold weight, contrast by colour.
 * The last third of the words (at least one) are bright; the rest are dimmed.
 */
export function splitHeadline(text: string): Headline {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { muted: '', bright: words[0] ?? '' };
  const brightCount = Math.max(1, Math.ceil(words.length / 3));
  return {
    muted: words.slice(0, words.length - brightCount).join(' '),
    bright: words.slice(words.length - brightCount).join(' '),
  };
}
