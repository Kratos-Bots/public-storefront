import { ArrowUpRightIcon, type ButtonAdornmentProps } from '@/templates/contract.ts';

/** ↗ on primary buttons. Grid add-to-cart buttons (cta=false) drop it under 768px. */
export function CyberButtonAdornment({ variant, cta, options }: ButtonAdornmentProps) {
  if (variant !== 'primary' || options.buttonArrow === false) return null;
  return <ArrowUpRightIcon size="1em" className="cb-arrow" data-cta={cta ? 'true' : 'false'} />;
}
