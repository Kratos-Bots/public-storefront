import type payment from '@/text/keys/payment.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "payment.reference.label": "Référence",
  "payment.missing.title": "Référence de commande manquante",
  "payment.missing.description": "Retournez à la boutique et réessayez, ou écrivez-nous pour obtenir de l’aide.",
  "payment.success.eyebrow": "Paiement reçu",
  "payment.success.headline": "Merci, votre commande est en cours de confirmation",
  "payment.success.detail": "Nous finalisons votre commande. Vous aurez de nos nouvelles dès qu’elle sera confirmée. Gardez cette référence sous la main si vous devez nous contacter.",
  "payment.cancel.eyebrow": "Paiement annulé",
  "payment.cancel.headline": "Aucun montant débité",
  "payment.cancel.detail": "Votre commande est toujours enregistrée. Revenez-y pour réessayer ou choisir un autre mode de paiement, ou écrivez-nous si vous avez besoin d’aide.",
  "payment.cancel.returnToOrder": "Retourner à votre commande",
  "payment.cancel.backToShop": "Retour à la boutique",
  "payment.placed.eyebrow": "Commande confirmée",
  "payment.placed.headline": "Commande passée",
  "payment.placed.warning": "Nous n’avons pas pu mettre en place le paiement en ligne pour cette commande. Écrivez-nous et nous vous aiderons à payer.",
  "payment.placed.chatHint": "Écrivez-nous sur WhatsApp ou Telegram pour convenir du paiement. Votre référence de commande est déjà renseignée.",
  "payment.placed.checkoutHint": "Votre commande est enregistrée et en attente de paiement. Utilisez le bouton ci-dessous pour payer en ligne en toute sécurité.",
  "payment.placed.payViaWhatsapp": "Payer via WhatsApp",
  "payment.placed.payViaTelegram": "Payer via Telegram",
  "payment.placed.viewOrder": "Voir votre commande",
  "payment.signIn.action": "Connectez-vous pour voir votre commande",
  "payment.signIn.hint": "Utilisez l’adresse e-mail ou le numéro de téléphone indiqué lors de la commande.",
  "payment.placed.fallback": "Contactez-nous via votre canal habituel en indiquant votre référence de commande pour convenir du paiement.",
  "payment.placed.notify": "Être prévenu de l’expédition de votre commande",
} satisfies AreaPack<typeof payment>;
