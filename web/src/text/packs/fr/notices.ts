import type notices from '@/text/keys/notices.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "notices.banners.pinnedLabel": "Annonces épinglées de la boutique",
  "notices.banners.label": "Annonces de la boutique",
  "notices.banners.dismissTitled": "Fermer : {title}",
  "notices.banners.dismiss": "Fermer l’annonce",
  "notices.pushInvite.aria": "Suivi de commande",
  "notices.pushInvite.message": "Recevez les mises à jour de vos commandes sur ce téléphone",
  "notices.pushInvite.turnOn": "Activer",
  "notices.pushInvite.notNow": "Plus tard",
  "notices.cutoff.ariaLabel": "Heure limite d’expédition",
  "notices.cutoff.message": "Commandez avant {time} · Expédition : {dispatch}",
  "notices.cutoff.left": "Plus que {time}",
  "notices.cutoff.days.mon": "Lun",
  "notices.cutoff.days.tue": "Mar",
  "notices.cutoff.days.wed": "Mer",
  "notices.cutoff.days.thu": "Jeu",
  "notices.cutoff.days.fri": "Ven",
  "notices.cutoff.days.sat": "Sam",
  "notices.cutoff.days.sun": "Dim",
} satisfies AreaPack<typeof notices>;
