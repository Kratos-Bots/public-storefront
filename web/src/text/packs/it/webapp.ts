import type webapp from '@/text/keys/webapp.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "webapp.action.checkout": "Pagamento · {subtotal}",
  "webapp.action.back": "Indietro",
  "webapp.action.viewCart": "Vedi carrello · {subtotal}",
} satisfies AreaPack<typeof webapp>;
