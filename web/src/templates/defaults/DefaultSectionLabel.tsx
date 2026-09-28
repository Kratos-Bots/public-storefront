import type { SectionLabelProps } from '@/templates/slots.ts';
import classes from '@/templates/defaults/SectionLabel.module.css';

export function DefaultSectionLabel({ index, title, level, tokens }: SectionLabelProps) {
  const style = tokens.label.style;
  if (style === 'plain') return null;
  // Numbered: the page label is /00 so the first menu group can own /01 (a sequence never repeats).
  const n = level === 'page' ? 0 : index;
  const text = style === 'bracket' ? `[${title}]` : `/${String(n).padStart(2, '0')}`;
  return <p className={classes.label} data-sf-part="section-label" aria-hidden>{text}</p>;
}
