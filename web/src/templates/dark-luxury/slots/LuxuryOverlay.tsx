import type { OverlayProps } from '@/templates/contract.ts';

/** The grain: a fixed, tap-transparent film over the whole page (styled in template.css). */
export function LuxuryOverlay({ options }: OverlayProps) {
  if (options.grain !== true) return null;
  return <div className="lux-grain" data-lux="grain" aria-hidden />;
}
