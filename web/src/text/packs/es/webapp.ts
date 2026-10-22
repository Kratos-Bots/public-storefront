import type webapp from '@/text/keys/webapp.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "webapp.action.checkout": "Finalizar compra · {subtotal}",
  "webapp.action.back": "Atrás",
  "webapp.action.viewCart": "Ver carrito · {subtotal}",
} satisfies AreaPack<typeof webapp>;
