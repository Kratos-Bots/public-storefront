import { useMemo, type ReactNode } from 'react';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { ancestorChain } from '@/features/catalog/category-tree.ts';
import { AddToCart } from '@/features/catalog/AddToCart.tsx';
import { ProductSheetBody } from '@/features/catalog/ProductDetailSheet.tsx';
import { CloseIcon } from '@/components/icons.tsx';
import { ProductHostContext, type ProductHost } from '@/builder/families.ts';
import { usePreviewProduct } from '@/builder/editor/preview-product.ts';
import { useText } from '@/text/runtime.tsx';
import type { Category, Product } from '@/types/catalog.ts';
import sheetChrome from '@/components/Sheet.module.css';
import sheetClasses from '@/features/catalog/ProductDetailSheet.module.css';
import styles from '@/builder/editor/SheetStage.module.css';

/** The sheet's eyebrow, as ProductDetailSheet builds it: the category path, else its flattened name. */
function categoryTrail(categories: Category[], product: Product): string {
  const chain = ancestorChain(categories, product.categoryId);
  if (chain.length > 0) return chain.map((c) => c.name).join(' / ');
  return product.categoryName ? product.categoryName.split('>').map((s) => s.trim()).join(' / ') : '';
}

const noop = () => {};

/**
 * The menu / web-app product sheet on the canvas (spec §11): the editable document in a 420 px
 * column between non-interactive copies of the sheet's header and pinned add-to-cart footer. The
 * document renders through the real sheet surface (the ProductDetail block sees the host and draws
 * `ProductSheetBody`) for the "Preview with" product; an upsell tap goes nowhere while editing.
 */
export function SheetStage({ children }: { children: ReactNode }) {
  const product = usePreviewProduct();
  const { data: catalog } = useCatalog();
  const { t } = useText();
  const host = useMemo<ProductHost>(() => ({ productId: product.id, onSelect: noop, surface: 'sheet', SheetBody: ProductSheetBody }), [product.id]);
  const trail = categoryTrail(catalog?.categories ?? [], product);
  return (
    <div className={styles.stage} data-sf-builder-sheet="">
      <div className={`${sheetChrome.content} ${styles.sheet}`}>
        <div className={styles.head} inert aria-hidden="true">
          <span className={sheetChrome.handle} />
          <div className={sheetClasses.head}>
            <span className={sheetClasses.eyebrow}>{trail || t('product.detail.product')}</span>
            <span className={sheetClasses.close}>
              <CloseIcon size={16} />
            </span>
          </div>
        </div>
        <div className={sheetClasses.body}>
          <ProductHostContext.Provider value={host}>{children}</ProductHostContext.Provider>
        </div>
        <div className={`${sheetChrome.footer} ${styles.foot}`} inert aria-hidden="true">
          <AddToCart product={product} size="lg" />
        </div>
      </div>
      <p className={styles.caption}>The sheet’s header and add button are fixed. Arrange the parts between them.</p>
    </div>
  );
}
