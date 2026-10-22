import type cart from '@/text/keys/cart.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "cart.summary.items": {"one":"{count} article","other":"{count} articles"},
  "cart.summary.mixedNotice": "Cette commande mêle articles en stock et précommandes. Les précommandes sont expédiées dès leur arrivée.",
  "cart.summary.afterPromotions": "Panier après promotions",
  "cart.summary.terms": "La livraison et les remises sont calculées au moment de la commande.",
  "cart.summary.held": "Réglez les articles signalés pour continuer.",
  "cart.limit.maxUnits": {"one":"Maximum {count} article par commande. Retirez-en {excess} pour continuer.","other":"Maximum {count} articles par commande. Retirez-en {excess} pour continuer."},
  "cart.summary.checkout": "Commander",
  "cart.summary.keepShopping": "Continuer mes achats",
  "cart.drawer.title": "Votre panier",
  "cart.page.eyebrow": "Panier",
  "cart.page.title": "Votre panier",
  "cart.empty.title": "Votre panier est vide",
  "cart.empty.description": "Tout ce que vous ajoutez apparaît ici, au prix correspondant à la quantité choisie.",
  "cart.line.removeButton": "Retirer",
  "cart.line.perUnit": "/u.",
  "cart.line.priceUpdated": "Prix mis à jour",
  "cart.line.quantityLabel": "Quantité de {name}",
  "cart.line.unavailable": "Plus disponible. Retirez-le pour continuer",
  "cart.line.minimum": "Minimum {count} par commande",
  "cart.line.maximum": "Maximum {count} par commande",
  "cart.line.setTo": "Passer à {count}",
  "cart.bar.viewCartLabel": "Voir le panier : {items}, {subtotal}",
  "cart.sync.signInAgain": "Veuillez vous reconnecter",
  "cart.sync.updateFailed": "Impossible de mettre à jour votre panier",
} satisfies AreaPack<typeof cart>;
