import type cart from '@/text/keys/cart.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "cart.summary.items": {"one":"{count} articolo","other":"{count} articoli"},
  "cart.summary.mixedNotice": "Questo ordine contiene articoli disponibili e in preordine: i preordini partono quando arrivano.",
  "cart.summary.afterPromotions": "Carrello dopo le promozioni",
  "cart.summary.terms": "Spedizione e sconti vengono calcolati al momento del pagamento.",
  "cart.summary.held": "Risolvi gli articoli segnalati per continuare.",
  "cart.limit.maxUnits": {"one":"Massimo {count} articolo per ordine. Rimuovine {excess} per continuare.","other":"Massimo {count} articoli per ordine. Rimuovine {excess} per continuare."},
  "cart.summary.checkout": "Vai al pagamento",
  "cart.summary.keepShopping": "Continua lo shopping",
  "cart.drawer.title": "Il tuo carrello",
  "cart.page.eyebrow": "Carrello",
  "cart.page.title": "Il tuo carrello",
  "cart.empty.title": "Ancora nulla nell'ordine",
  "cart.empty.description": "Tutto ciò che aggiungi compare qui, con il prezzo per la quantità che acquisti.",
  "cart.line.removeButton": "Rimuovi",
  "cart.line.perUnit": "/pz",
  "cart.line.priceUpdated": "Prezzo aggiornato",
  "cart.line.quantityLabel": "Quantità di {name}",
  "cart.line.unavailable": "Non più disponibile: rimuovilo per continuare",
  "cart.line.minimum": "Minimo {count} per ordine",
  "cart.line.maximum": "Massimo {count} per ordine",
  "cart.line.setTo": "Imposta a {count}",
  "cart.bar.viewCartLabel": "Vedi il carrello: {items}, {subtotal}",
  "cart.sync.signInAgain": "Accedi di nuovo",
  "cart.sync.updateFailed": "Non siamo riusciti ad aggiornare il tuo carrello",
} satisfies AreaPack<typeof cart>;
