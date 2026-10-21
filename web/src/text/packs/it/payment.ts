import type payment from '@/text/keys/payment.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "payment.reference.label": "Riferimento",
  "payment.missing.title": "Riferimento ordine mancante",
  "payment.missing.description": "Torna al negozio e riprova, oppure scrivici per ricevere aiuto.",
  "payment.success.eyebrow": "Pagamento ricevuto",
  "payment.success.headline": "Grazie: stiamo confermando il tuo ordine",
  "payment.success.detail": "Stiamo finalizzando il tuo ordine. Ti scriveremo non appena sarà confermato: tieni a portata di mano questo riferimento se devi contattarci.",
  "payment.cancel.eyebrow": "Pagamento annullato",
  "payment.cancel.headline": "Nessun addebito effettuato",
  "payment.cancel.detail": "Il tuo ordine è ancora salvato. Torna all'ordine per riprovare o scegliere un altro metodo di pagamento, oppure scrivici se ti serve una mano.",
  "payment.cancel.returnToOrder": "Torna al tuo ordine",
  "payment.cancel.backToShop": "Torna al negozio",
  "payment.placed.eyebrow": "Ordine confermato",
  "payment.placed.headline": "Ordine effettuato",
  "payment.placed.warning": "Non siamo riusciti a configurare il pagamento online per questo ordine: scrivici e ti aiuteremo a pagare.",
  "payment.placed.chatHint": "Scrivici su WhatsApp o Telegram per concordare il pagamento: il riferimento del tuo ordine è già compilato.",
  "payment.placed.checkoutHint": "Il tuo ordine è salvato e in attesa di pagamento. Usa il pulsante qui sotto per pagare online in sicurezza.",
  "payment.placed.payViaWhatsapp": "Paga tramite WhatsApp",
  "payment.placed.payViaTelegram": "Paga tramite Telegram",
  "payment.placed.viewOrder": "Vedi il tuo ordine",
  "payment.signIn.action": "Accedi per vedere il tuo ordine",
  "payment.signIn.hint": "Usa l'email o il numero di telefono che hai indicato al momento del pagamento.",
  "payment.placed.fallback": "Contattaci sul canale che usi di solito, indicando il riferimento dell'ordine, per concordare il pagamento.",
  "payment.placed.notify": "Ricevi una notifica quando il tuo ordine viene spedito",
} satisfies AreaPack<typeof payment>;
