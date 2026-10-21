import type errors from '@/text/keys/errors.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "errors.generic": "Qualcosa è andato storto",
  "errors.rateLimited": "Troppi tentativi: attendi un momento e riprova",
  "errors.unavailable": "Il negozio è temporaneamente non disponibile",
  "errors.requestFailed": "Richiesta non riuscita",
  "errors.timeout": "La richiesta è scaduta",
  "errors.network": "Errore di rete",
  "errors.loginRequired": "Accedi per continuare.",
  "errors.accessDenied": "Il tuo account non ha accesso a questo negozio.",
  "errors.registrationClosed": "Questo negozio al momento non accetta nuovi clienti.",
} satisfies AreaPack<typeof errors>;
