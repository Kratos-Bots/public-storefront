import type catalog from '@/text/keys/catalog.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "catalog.search.placeholder": "Cerca prodotti",
  "catalog.search.ariaLabel": "Cerca prodotti",
  "catalog.list.allProducts": "Tutti i prodotti",
  "catalog.list.count": "{count} prodotti",
  "catalog.list.matching": "{count} risultati",
  "catalog.list.unit": {"one":"prodotto","other":"prodotti"},
  "catalog.list.of": "di",
  "catalog.list.eyebrowCatalogue": "Catalogo",
  "catalog.list.eyebrowCategory": "Categoria",
  "catalog.list.eyebrowSearch": "Ricerca",
  "catalog.list.loadFailedDetail": "Il negozio è sempre qui: c'è stato solo un intoppo tra il tuo browser e noi.",
  "catalog.list.categoryMissingDetail": "Potrebbe essere stata rinominata o rimossa. L'intera gamma è a un tocco di distanza.",
  "catalog.list.showAll": "Mostra tutti i prodotti",
  "catalog.list.noMatchesDetail": "Prova con una parola più corta o con il codice prodotto dal tuo ultimo ordine.",
  "catalog.list.emptyCategoryDetail": "Questa parte del negozio per ora è vuota: ripassa presto.",
  "catalog.nav.categories": "Categorie",
  "catalog.nav.all": "Tutti",
  "catalog.nav.allCategories": "Tutte le categorie",
  "catalog.filter.sub": "Vai a una sezione dell'elenco",
  "catalog.group.other": "Altro",
  "catalog.group.uncategorised": "Senza categoria",
  "catalog.featured.ariaLabel": "Prodotti in evidenza",
} satisfies AreaPack<typeof catalog>;
