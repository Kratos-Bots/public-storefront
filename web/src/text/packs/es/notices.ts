import type notices from '@/text/keys/notices.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "notices.banners.pinnedLabel": "Avisos fijados de la tienda",
  "notices.banners.label": "Avisos de la tienda",
  "notices.banners.dismissTitled": "Descartar: {title}",
  "notices.banners.dismiss": "Descartar aviso",
  "notices.pushInvite.aria": "Novedades del pedido",
  "notices.pushInvite.message": "Recibe las novedades de tus pedidos en este móvil",
  "notices.pushInvite.turnOn": "Activar",
  "notices.pushInvite.notNow": "Ahora no",
  "notices.cutoff.ariaLabel": "Hora límite de envío",
  "notices.cutoff.message": "Pide antes de las {time} · Envío: {dispatch}",
  "notices.cutoff.left": "Quedan {time}",
  "notices.cutoff.days.mon": "Lun",
  "notices.cutoff.days.tue": "Mar",
  "notices.cutoff.days.wed": "Mié",
  "notices.cutoff.days.thu": "Jue",
  "notices.cutoff.days.fri": "Vie",
  "notices.cutoff.days.sat": "Sáb",
  "notices.cutoff.days.sun": "Dom",
} satisfies AreaPack<typeof notices>;
