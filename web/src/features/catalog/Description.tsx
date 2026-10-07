import { useMemo } from 'react';
import { Marked } from 'marked';
import type { StyleAttrs } from '@/builder/define.ts';
import { sanitizeMarkdown } from '@/builder/sanitize.ts';
import classes from '@/features/catalog/Description.module.css';

// GFM, and a single newline is a line break — plain-text descriptions written before Markdown keep their shape.
const md = new Marked({ gfm: true, breaks: true, async: false });

/** Parses a product description (Markdown) and sanitises the result; the output is never trusted raw. */
export function descriptionHtml(source: string): string {
  return sanitizeMarkdown(md.parse(source, { async: false }));
}

/**
 * A product description as formatted prose. `className` positions it (measure, size, colour);
 * `styleAttrs` are the builder block's style attributes, spread last. `data-sf-prose` exempts inline
 * links from the 44px tap-target rule.
 */
export function Description({ markdown, className, styleAttrs }: { markdown: string | null | undefined; className?: string; styleAttrs?: StyleAttrs }) {
  const html = useMemo(() => (markdown && markdown.trim() ? descriptionHtml(markdown) : ''), [markdown]);
  if (!html) return null;
  return <div className={className ? `${classes.prose} ${className}` : classes.prose} data-sf-prose="" {...styleAttrs} dangerouslySetInnerHTML={{ __html: html }} />;
}
