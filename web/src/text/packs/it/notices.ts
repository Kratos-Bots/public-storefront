import type notices from '@/text/keys/notices.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "notices.banners.pinnedLabel": "Avvisi del negozio in evidenza",
  "notices.banners.label": "Avvisi del negozio",
  "notices.banners.dismissTitled": "Chiudi: {title}",
  "notices.banners.dismiss": "Chiudi avviso",
  "notices.pushInvite.aria": "Aggiornamenti sull'ordine",
  "notices.pushInvite.message": "Ricevi gli aggiornamenti sull'ordine su questo telefono",
  "notices.pushInvite.turnOn": "Attiva",
  "notices.pushInvite.notNow": "Non ora",
  "notices.cutoff.ariaLabel": "Orario limite di spedizione",
  "notices.cutoff.message": "Ordina entro le {time} · Spedizione: {dispatch}",
  "notices.cutoff.left": "Ancora {time}",
  "notices.cutoff.days.mon": "Lun",
  "notices.cutoff.days.tue": "Mar",
  "notices.cutoff.days.wed": "Mer",
  "notices.cutoff.days.thu": "Gio",
  "notices.cutoff.days.fri": "Ven",
  "notices.cutoff.days.sat": "Sab",
  "notices.cutoff.days.sun": "Dom",
} satisfies AreaPack<typeof notices>;
