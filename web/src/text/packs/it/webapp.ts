// TODO(translate)
import type webapp from '@/text/keys/webapp.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "webapp.action.checkout": "Checkout · {subtotal}",
  "webapp.action.back": "Back",
  "webapp.action.viewCart": "View cart · {subtotal}",
} satisfies AreaPack<typeof webapp>;
