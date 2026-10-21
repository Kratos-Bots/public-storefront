import type catalog from '@/text/keys/catalog.ts';
import type { AreaPack } from '@/text/packs/index.ts';

export default {
  "catalog.search.placeholder": "Buscar productos",
  "catalog.search.ariaLabel": "Buscar productos",
  "catalog.list.allProducts": "Todos los productos",
  "catalog.list.count": "{count} productos",
  "catalog.list.matching": "{count} coinciden",
  "catalog.list.unit": {"one":"producto","other":"productos"},
  "catalog.list.of": "de",
  "catalog.list.eyebrowCatalogue": "Catálogo",
  "catalog.list.eyebrowCategory": "Categoría",
  "catalog.list.eyebrowSearch": "Búsqueda",
  "catalog.list.loadFailedDetail": "La tienda sigue ahí: ha sido un fallo puntual entre tu navegador y nosotros.",
  "catalog.list.categoryMissingDetail": "Puede que se haya renombrado o retirado. Todo el catálogo está a un toque.",
  "catalog.list.showAll": "Ver todos los productos",
  "catalog.list.noMatchesDetail": "Prueba con una palabra más corta o con el código de producto de tu último pedido.",
  "catalog.list.emptyCategoryDetail": "Esta parte de la tienda está vacía por ahora. Vuelve pronto.",
  "catalog.nav.categories": "Categorías",
  "catalog.nav.all": "Todo",
  "catalog.nav.allCategories": "Todas las categorías",
  "catalog.filter.sub": "Ir a una sección de la lista",
  "catalog.group.other": "Otros",
  "catalog.group.uncategorised": "Sin categoría",
  "catalog.featured.ariaLabel": "Productos destacados",
} satisfies AreaPack<typeof catalog>;
