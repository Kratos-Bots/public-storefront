import type verify from '@/text/keys/verify.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "verify.page.eyebrow": "Autenticità",
  "verify.page.title": "Verifica un prodotto",
  "verify.page.lead": "Inserisci i codici stampati sull'etichetta del prodotto per confermare che sia originale.",
  "verify.form.codeLabel": "Codice di verifica",
  "verify.form.codePlaceholder": "AB3D-SKU12",
  "verify.form.authLabel": "Codice di autenticazione",
  "verify.form.submit": "Verifica prodotto",
  "verify.errors.digitsOnly": "Solo cifre",
  "verify.result.verifiedHead": "Prodotto autentico",
  "verify.result.verifiedBody": "Questo codice corrisponde a un'unità originale nei nostri registri.",
  "verify.result.issued": "Emesso",
  "verify.result.expires": "Scadenza",
  "verify.result.expiredNote": "Nota: questa unità ha superato la data di scadenza.",
  "verify.result.invalidHead": "Non verificato",
  "verify.result.invalidBody": "Non siamo riusciti ad abbinare questa coppia di codici a un'unità originale. Ricontrolla entrambi i codici esattamente come stampati sull'etichetta.",
  "verify.result.invalidHint": "Se sono corretti e la verifica non va comunque a buon fine, contattaci e il nostro team controllerà manualmente.",
  "verify.result.errorHead": "Errore di connessione",
  "verify.result.errorBody": "Non siamo riusciti a raggiungere il servizio di verifica. Riprova tra un momento o contattaci qui sotto.",
} satisfies AreaPack<typeof verify>;
