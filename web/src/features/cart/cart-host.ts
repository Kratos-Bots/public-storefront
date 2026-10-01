import { createContext, type ReactNode } from 'react';

/**
 * Set by the cart drawer around the layout's `cart` document (stage 4 spec §7.3): the CartContents
 * container hands its body and footer to `frame`, which returns the drawer's Sheet. `null` = the page.
 */
export interface CartHost {
  surface: 'drawer';
  frame(regions: { body: ReactNode; footer: ReactNode | undefined }): ReactNode;
  dismiss(): void;
}
export const CartHostContext = createContext<CartHost | null>(null);
