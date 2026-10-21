import type catalog from '@/text/keys/catalog.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "catalog.search.placeholder": "Rechercher des produits",
  "catalog.search.ariaLabel": "Rechercher des produits",
  "catalog.list.allProducts": "Tous les produits",
  "catalog.list.count": "{count} produits",
  "catalog.list.matching": "{count} résultats",
  "catalog.list.unit": {"one":"produit","other":"produits"},
  "catalog.list.of": "sur",
  "catalog.list.eyebrowCatalogue": "Catalogue",
  "catalog.list.eyebrowCategory": "Catégorie",
  "catalog.list.eyebrowSearch": "Recherche",
  "catalog.list.loadFailedDetail": "La boutique est toujours là. Il s’agit d’un petit accroc entre votre navigateur et nous.",
  "catalog.list.categoryMissingDetail": "Elle a peut-être été renommée ou retirée. Toute la gamme reste à portée de clic.",
  "catalog.list.showAll": "Afficher tous les produits",
  "catalog.list.noMatchesDetail": "Essayez un mot plus court, ou le code produit de votre dernière commande.",
  "catalog.list.emptyCategoryDetail": "Cette partie de la boutique est vide pour le moment. Revenez bientôt.",
  "catalog.nav.categories": "Catégories",
  "catalog.nav.all": "Tout",
  "catalog.nav.allCategories": "Toutes les catégories",
  "catalog.filter.sub": "Accéder à une section de la liste",
  "catalog.group.other": "Autres",
  "catalog.group.uncategorised": "Sans catégorie",
  "catalog.featured.ariaLabel": "Produits à la une",
} satisfies AreaPack<typeof catalog>;
