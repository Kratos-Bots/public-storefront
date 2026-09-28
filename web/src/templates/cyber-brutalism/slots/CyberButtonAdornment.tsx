import { ArrowUpRightIcon, type ButtonAdornmentProps } from '@/templates/contract.ts';

/** ↗ on primary buttons. Grid add-to-cart buttons (cta=false) drop it under 768px. */
export function CyberButtonAdornment({ variant, cta }: ButtonAdornmentProps) {
  if (variant !== 'primary') return null;
  return <ArrowUpRightIcon size="1em" className="cb-arrow" data-cta={cta ? 'true' : 'false'} />;
}
