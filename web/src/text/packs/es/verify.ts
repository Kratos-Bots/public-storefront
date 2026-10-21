import type verify from '@/text/keys/verify.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "verify.page.eyebrow": "Autenticidad",
  "verify.page.title": "Verifica un producto",
  "verify.page.lead": "Introduce los códigos impresos en la etiqueta de tu producto para confirmar que es original.",
  "verify.form.codeLabel": "Código de verificación",
  "verify.form.codePlaceholder": "AB3D-SKU12",
  "verify.form.authLabel": "Código de autenticación",
  "verify.form.submit": "Verificar producto",
  "verify.errors.digitsOnly": "Solo dígitos",
  "verify.result.verifiedHead": "Producto auténtico",
  "verify.result.verifiedBody": "Este código coincide con una unidad original de nuestros registros.",
  "verify.result.issued": "Emitido",
  "verify.result.expires": "Caduca",
  "verify.result.expiredNote": "Nota: esta unidad ha superado su fecha de caducidad.",
  "verify.result.invalidHead": "No verificado",
  "verify.result.invalidBody": "No hemos podido relacionar esta pareja de códigos con una unidad original. Revisa que ambos códigos coincidan exactamente con los de la etiqueta.",
  "verify.result.invalidHint": "Si son correctos y aun así no se verifican, contacta con nosotros y nuestro equipo lo comprobará manualmente.",
  "verify.result.errorHead": "Error de conexión",
  "verify.result.errorBody": "No hemos podido conectar con el servicio de verificación. Inténtalo de nuevo en un momento o contacta con nosotros más abajo.",
} satisfies AreaPack<typeof verify>;
