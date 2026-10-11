export type FaqPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

/** A run of non-space, non-markup characters after `http://` or `https://`. Nothing else is ever made a link. */
const URL_RE = /https?:\/\/[^\s<>"]+/gi;
const TRAILING = '.,;:!?\'"';

/** Takes sentence punctuation (and a closing bracket with no opener in the URL) back off the end of a matched URL. */
function trimUrl(url: string): string {
  let end = url.length;
  for (;;) {
    const last = url[end - 1];
    if (last === undefined) break;
    if (TRAILING.includes(last)) { end -= 1; continue; }
    if (last === ')' || last === ']') {
      const open = last === ')' ? '(' : '[';
      const head = url.slice(0, end);
      if (head.split(last).length > head.split(open).length) { end -= 1; continue; }
    }
    break;
  }
  return url.slice(0, end);
}

/**
 * An answer's plain text, cut into text and link parts. Only bare `http(s)://` URLs become links; the parts always
 * join back into the original string, so the caller renders them as text nodes and anchors (never as HTML).
 */
export function linkify(input: string): FaqPart[] {
  const parts: FaqPart[] = [];
  const pushText = (text: string) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last?.kind === 'text') last.text += text;
    else parts.push({ kind: 'text', text });
  };
  let cursor = 0;
  for (const match of input.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    const url = trimUrl(match[0]);
    // "https://" followed only by punctuation is not an address.
    if (!/^https?:\/\/[^\s.,;:!?'"()[\]]/i.test(url)) continue;
    pushText(input.slice(cursor, start));
    parts.push({ kind: 'link', text: url, href: url });
    cursor = start + url.length;
  }
  pushText(input.slice(cursor));
  return parts;
}
