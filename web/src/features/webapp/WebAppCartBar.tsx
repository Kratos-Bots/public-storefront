import { CartBar } from '@/features/cart/MobileCartBar.tsx';
import { useWebAppCartBar } from '@/features/webapp/useResolvedPrimaryAction.ts';
import { useModalOpen } from '@/lib/use-modal-open.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';

/**
 * The web app's running tab while the shopper browses: the same band as the mobile storefront (subtotal and items
 * into the cart, Checkout beside them), drawn in the page both inside Telegram and in a browser tab. It replaces the
 * "View cart" button, so Telegram's MainButton is hidden while it shows. Like the single-button bar it steps aside
 * under a dialog (the product sheet has its own Add to cart at the foot), and the shell keeps its room meanwhile.
 */
export function WebAppCartBar() {
  const active = useWebAppCartBar();
  const modalOpen = useModalOpen();
  if (!active || modalOpen) return null;
  return <CartBar inset={isTelegramWebApp() ? 'telegram' : 'webapp'} />;
}
