import type webapp from '@/text/keys/webapp.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "webapp.action.checkout": "Commander · {subtotal}",
  "webapp.action.back": "Retour",
  "webapp.action.viewCart": "Voir le panier · {subtotal}",
} satisfies AreaPack<typeof webapp>;
