import type { ReactNode } from 'react';
import type { StyleAttrs } from '@/builder/define.ts';
import { sanitizeRichtext } from '@/builder/sanitize.ts';

/**
 * A richtext prop (spec §13 A2): stored as an HTML string and sanitised again here;
 * inside the editor Puck may hand over a React node instead, rendered as-is.
 * `attrs`: a styled RichText's style attributes, spread last.
 * `data-sf-prose` marks inline text links, which are exempt from the 44px tap-target rule.
 */
export function RichHtml({ value, className, block, attrs }: { value: unknown; className?: string; block?: string; attrs?: StyleAttrs }) {
  if (typeof value === 'string') {
    return <div className={className} data-sf-prose="" data-sf-block={block} {...attrs} dangerouslySetInnerHTML={{ __html: sanitizeRichtext(value) }} />;
  }
  return <div className={className} data-sf-prose="" data-sf-block={block} {...attrs}>{value as ReactNode}</div>;
}
