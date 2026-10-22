import type errors from '@/text/keys/errors.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "errors.generic": "Une erreur s’est produite",
  "errors.rateLimited": "Trop de tentatives. Patientez un instant avant de réessayer",
  "errors.unavailable": "La boutique est temporairement indisponible",
  "errors.requestFailed": "La requête a échoué",
  "errors.timeout": "La requête a expiré",
  "errors.network": "Erreur réseau",
  "errors.loginRequired": "Veuillez vous connecter pour continuer.",
  "errors.accessDenied": "Votre compte n’a pas accès à cette boutique.",
  "errors.registrationClosed": "Cette boutique n’accepte pas de nouveaux clients pour le moment.",
} satisfies AreaPack<typeof errors>;
