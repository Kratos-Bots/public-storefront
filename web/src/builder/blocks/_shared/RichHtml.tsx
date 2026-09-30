import type { ReactNode } from 'react';
import { sanitizeRichtext } from '@/builder/sanitize.ts';

/**
 * A richtext prop (spec §13 A2): stored as an HTML string and sanitised again here;
 * inside the editor Puck may hand over a React node instead, rendered as-is.
 * `data-sf-prose` marks inline text links, which are exempt from the 44px tap-target rule.
 */
export function RichHtml({ value, className, block }: { value: unknown; className?: string; block?: string }) {
  if (typeof value === 'string') {
    return <div className={className} data-sf-prose="" data-sf-block={block} dangerouslySetInnerHTML={{ __html: sanitizeRichtext(value) }} />;
  }
  return <div className={className} data-sf-prose="" data-sf-block={block}>{value as ReactNode}</div>;
}
