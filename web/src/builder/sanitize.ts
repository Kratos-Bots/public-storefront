import DOMPurify from 'dompurify';

/** Same allowlist as the backend's isomorphic-dompurify config (spec §4.3). */
export const RICHTEXT_ALLOWED_TAGS: readonly string[] = ['p', 'h2', 'h3', 'h4', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'br', 'code'];
// A leading slash must not be followed by another slash or a backslash (both protocol-relative in browsers).
const SAFE_HREF = /^(?:https:\/\/|mailto:|tel:|\/(?![/\\]))/i;

let purifier: ReturnType<typeof DOMPurify> | null = null;

function instance(): ReturnType<typeof DOMPurify> {
  if (purifier) return purifier;
  const p = DOMPurify(window);
  p.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName !== 'A') return;
    const href = node.getAttribute('href');
    // Browsers strip tab/CR/LF before parsing, so any control/whitespace char disqualifies the href.
    if (href !== null && (/[\u0000- \u007f]/.test(href) || !SAFE_HREF.test(href))) node.removeAttribute('href');
    const kept = node.getAttribute('href');
    if (kept !== null && /^https:/i.test(kept)) node.setAttribute('rel', 'noopener noreferrer');
  });
  purifier = p;
  return p;
}

/** Defence in depth: the backend sanitised this already; the storefront never trusts it. */
export function sanitizeRichtext(html: string): string {
  return instance().sanitize(html, {
    ALLOWED_TAGS: [...RICHTEXT_ALLOWED_TAGS],
    ALLOWED_ATTR: ['href'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}

/** Richtext tags plus what Markdown adds: more heading levels, code blocks, rules, strike-through and tables. No images. */
const MARKDOWN_ALLOWED_TAGS: readonly string[] = [
  ...RICHTEXT_ALLOWED_TAGS, 'h1', 'h5', 'h6', 'pre', 'hr', 'del', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

/**
 * For HTML rendered from Markdown (product descriptions). Same purifier and href rules as `sanitizeRichtext`,
 * a wider tag list, `href` the only attribute. Safe https links are then opened in a new tab; that is added
 * to the already-clean DOM afterwards, so the sanitiser's own allowlist stays untouched.
 */
export function sanitizeMarkdown(html: string): string {
  const fragment = instance().sanitize(html, {
    ALLOWED_TAGS: [...MARKDOWN_ALLOWED_TAGS],
    ALLOWED_ATTR: ['href'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  for (const a of Array.from(fragment.querySelectorAll('a[href]'))) {
    if (/^https:/i.test(a.getAttribute('href') ?? '')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  }
  // A table gets a bare wrapper to scroll in, so a wide one never widens the page. `div` is not an allowed tag,
  // so the only divs in the result are these.
  for (const table of Array.from(fragment.querySelectorAll('table'))) {
    const scroller = document.createElement('div');
    table.replaceWith(scroller);
    scroller.appendChild(table);
  }
  const holder = document.createElement('div');
  holder.appendChild(fragment);
  return holder.innerHTML;
}
