import { Fragment, type ReactNode } from 'react';
import classes from '@/features/catalog/Provenance.module.css';

/** Split a line into plain runs and `**bold**` runs. Odd indices are the bold captures. */
function inline(text: string): ReactNode[] {
  return text
    .split(/\*\*([^*]+)\*\*/g)
    .map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>));
}

/**
 * The product's provenance note, as written by the client in admin. Markdown-lite
 * on purpose: blank-line separated blocks, `**bold**`, and `- ` lists — no parser
 * dependency, and nothing a pasted supplier email can turn into markup.
 */
export function Provenance({ markdown }: { markdown: string }) {
  const blocks = markdown.trim().split(/\n{2,}/).filter((b) => b.trim());
  if (blocks.length === 0) return null;

  return (
    <div className={classes.root}>
      {blocks.map((block, i) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.every((l) => /^[-*]\s+/.test(l))) {
          return (
            <ul key={i} className={classes.list}>
              {lines.map((line, j) => (
                <li key={j}>{inline(line.replace(/^[-*]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className={classes.para}>
            {inline(lines.join(' '))}
          </p>
        );
      })}
    </div>
  );
}
