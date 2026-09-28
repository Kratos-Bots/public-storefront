import type { OverlayProps } from '@/templates/contract.ts';

/**
 * No decoration — bento draws nothing over the page. The Overlay slot only carries a hidden flag
 * when the "Feature the first product" option is off, because options never reach <html> as
 * attributes: template.css keys the hero-product tile on `:root:not(:has([data-bento-featured="off"]))`.
 */
export function BentoOverlay({ options }: OverlayProps) {
  if (options.featured !== false) return null;
  return <span data-bento-featured="off" hidden />;
}
