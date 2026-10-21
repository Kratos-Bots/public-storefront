import type verify from '@/text/keys/verify.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "verify.page.eyebrow": "Authenticité",
  "verify.page.title": "Vérifier un produit",
  "verify.page.lead": "Saisissez les codes imprimés sur l’étiquette de votre produit pour confirmer son authenticité.",
  "verify.form.codeLabel": "Code de vérification",
  "verify.form.codePlaceholder": "AB3D-SKU12",
  "verify.form.authLabel": "Code d’authentification",
  "verify.form.submit": "Vérifier le produit",
  "verify.errors.digitsOnly": "Chiffres uniquement",
  "verify.result.verifiedHead": "Produit authentique",
  "verify.result.verifiedBody": "Ce code correspond à une unité authentique dans nos registres.",
  "verify.result.issued": "Émis le",
  "verify.result.expires": "Expire le",
  "verify.result.expiredNote": "Remarque : cette unité a dépassé sa date d’expiration.",
  "verify.result.invalidHead": "Non vérifié",
  "verify.result.invalidBody": "Nous n’avons pas pu associer cette paire de codes à une unité authentique. Vérifiez bien les deux codes, exactement comme imprimés sur l’étiquette.",
  "verify.result.invalidHint": "Si les codes sont corrects et que la vérification échoue, contactez-nous et notre équipe vérifiera manuellement.",
  "verify.result.errorHead": "Erreur de connexion",
  "verify.result.errorBody": "Impossible de joindre le service de vérification. Réessayez dans un instant ou contactez-nous ci-dessous.",
} satisfies AreaPack<typeof verify>;
