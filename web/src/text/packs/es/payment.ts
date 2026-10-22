import type payment from '@/text/keys/payment.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "payment.reference.label": "Referencia",
  "payment.missing.title": "Falta la referencia del pedido",
  "payment.missing.description": "Vuelve a la tienda e inténtalo de nuevo, o escríbenos para obtener ayuda.",
  "payment.success.eyebrow": "Pago recibido",
  "payment.success.headline": "Gracias: estamos confirmando tu pedido",
  "payment.success.detail": "Estamos terminando de procesar tu pedido. Te avisaremos en cuanto esté confirmado; ten a mano esta referencia por si necesitas contactar con nosotros.",
  "payment.cancel.eyebrow": "Pago cancelado",
  "payment.cancel.headline": "No se ha cobrado nada",
  "payment.cancel.detail": "Tu pedido sigue guardado. Vuelve a él para intentarlo de nuevo o elige otra forma de pago, o escríbenos si necesitas ayuda.",
  "payment.cancel.returnToOrder": "Volver a tu pedido",
  "payment.cancel.backToShop": "Volver a la tienda",
  "payment.placed.eyebrow": "Pedido confirmado",
  "payment.placed.headline": "Pedido realizado",
  "payment.placed.warning": "No hemos podido configurar el pago online de este pedido. Escríbenos y te ayudamos a pagar.",
  "payment.placed.chatHint": "Escríbenos por WhatsApp o Telegram para acordar el pago: la referencia de tu pedido ya va incluida.",
  "payment.placed.checkoutHint": "Tu pedido está guardado y pendiente de pago. Usa el botón de abajo para pagar online de forma segura.",
  "payment.placed.payViaWhatsapp": "Pagar por WhatsApp",
  "payment.placed.payViaTelegram": "Pagar por Telegram",
  "payment.placed.viewOrder": "Ver tu pedido",
  "payment.signIn.action": "Inicia sesión para ver tu pedido",
  "payment.signIn.hint": "Usa el correo o el teléfono que indicaste al finalizar la compra.",
  "payment.placed.fallback": "Contáctanos por tu canal habitual e indícanos la referencia de tu pedido para acordar el pago.",
  "payment.placed.notify": "Avísame cuando se envíe mi pedido",
} satisfies AreaPack<typeof payment>;
