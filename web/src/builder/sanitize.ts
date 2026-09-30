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
