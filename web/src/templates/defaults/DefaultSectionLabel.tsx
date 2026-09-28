import type { SectionLabelProps } from '@/templates/slots.ts';
import classes from '@/templates/defaults/SectionLabel.module.css';

export function DefaultSectionLabel({ index, title, tokens }: SectionLabelProps) {
  const style = tokens.label.style;
  if (style === 'plain') return null;
  const text = style === 'bracket' ? `[${title}]` : `/${String(index).padStart(2, '0')}`;
  return <p className={classes.label} data-sf-part="section-label" aria-hidden>{text}</p>;
}
