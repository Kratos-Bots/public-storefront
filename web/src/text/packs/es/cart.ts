import type cart from '@/text/keys/cart.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "cart.summary.items": {"one":"{count} artículo","other":"{count} artículos"},
  "cart.summary.mixedNotice": "Este pedido combina artículos en stock y en preventa: los de preventa se envían cuando lleguen.",
  "cart.summary.afterPromotions": "Carrito tras las promociones",
  "cart.summary.terms": "Los gastos de envío y los descuentos se calculan al finalizar la compra.",
  "cart.summary.held": "Resuelve los artículos señalados para continuar.",
  "cart.limit.maxUnits": {"one":"Máximo {count} artículo por pedido. Quita {excess} para continuar.","other":"Máximo {count} artículos por pedido. Quita {excess} para continuar."},
  "cart.summary.checkout": "Finalizar compra",
  "cart.summary.keepShopping": "Seguir comprando",
  "cart.drawer.title": "Tu carrito",
  "cart.page.eyebrow": "Carrito",
  "cart.page.title": "Tu carrito",
  "cart.empty.title": "Tu carrito está vacío",
  "cart.empty.description": "Todo lo que añadas aparecerá aquí, con el precio según la cantidad que compres.",
  "cart.line.removeButton": "Quitar",
  "cart.line.perUnit": "/ud.",
  "cart.line.priceUpdated": "Precio actualizado",
  "cart.line.quantityLabel": "Cantidad de {name}",
  "cart.line.unavailable": "Ya no está disponible: quítalo para continuar",
  "cart.line.minimum": "Mínimo {count} por pedido",
  "cart.line.maximum": "Máximo {count} por pedido",
  "cart.line.setTo": "Poner {count}",
  "cart.bar.viewCartLabel": "Ver carrito: {items}, {subtotal}",
  "cart.sync.signInAgain": "Vuelve a iniciar sesión",
  "cart.sync.updateFailed": "No hemos podido actualizar tu carrito",
} satisfies AreaPack<typeof cart>;
