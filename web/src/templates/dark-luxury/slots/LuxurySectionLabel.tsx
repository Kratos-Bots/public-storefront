import { useText, type SectionLabelProps } from '@/templates/contract.ts';

/**
 * `[Label]` bracket notation, mono, accent. Not `[${title}]` — the heading right under
 * it already says the title, so the label names the section's role instead.
 */
export function LuxurySectionLabel({ index, level }: SectionLabelProps) {
  const { t } = useText();
  const text = level === 'page' ? t('templates.dark-luxury.label.catalogue') : `[${String(index).padStart(2, '0')}]`;
  return <p className="lux-label" data-sf-part="section-label" aria-hidden>{text}</p>;
}
