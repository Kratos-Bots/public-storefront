import { useEffect, type ReactNode } from 'react';
import { Button } from '@mantine/core';
import { useSettings } from '@/app/settings.ts';
import { useCatalog, useProduct } from '@/features/catalog/use-catalog.ts';
import { ancestorChain } from '@/features/catalog/category-tree.ts';
import { Sheet } from '@/components/Sheet.tsx';
import { ProductImage } from '@/features/catalog/ProductImage.tsx';
import { StockChip } from '@/features/catalog/StockChip.tsx';
import { AddToCart } from '@/features/catalog/AddToCart.tsx';
import { BulkPricing } from '@/features/catalog/BulkPricing.tsx';
import { Provenance } from '@/features/catalog/Provenance.tsx';
import { Upsells } from '@/features/catalog/Upsells.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { CloseIcon } from '@/components/icons.tsx';
import { deriveStockStatus, formatDate, formatMoney } from '@/lib/format.ts';
import { FADE } from '@/lib/motion.ts';
import type { Category, Product } from '@/types/catalog.ts';
import { useCoreOptions } from '@/templates/hooks.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/catalog/ProductDetailSheet.module.css';

/**
 * "Parent / Child" from the real category ids, so the sheet's eyebrow uses the
 * same separator as the list's section rules. The catalogue's own `categoryName`
 * is a flattened `Parent > Child` string — kept only as a fallback for a category
 * the catalogue no longer carries.
 */
function categoryTrail(categories: Category[], product: Product): string {
  const chain = ancestorChain(categories, product.categoryId);
  if (chain.length > 0) return chain.map((c) => c.name).join(' / ');
  return product.categoryName ? product.categoryName.split('>').map((s) => s.trim()).join(' / ') : '';
}

export interface ProductDetailSheetProps {
  /** The product in `?p=`, or null when the sheet is closed. */
  productId: number | null;
  onClose: () => void;
  /** Swaps the sheet's product in place — an upsell tap stays in the sheet. */
  onSelect: (product: Product) => void;
}

/**
 * The product page's content, in the menu layout's sheet. Everything the page
 * shows is here — price, bulk ladder, provenance, upsells, the ask-first links —
 * carried by the same components, only stacked in one column and topped by a
 * thumbnail instead of a full plate, because the sheet is 88% of a phone.
 */
export function ProductDetailSheet({ productId, onClose, onSelect }: ProductDetailSheetProps) {
  const { brand } = useSettings();
  const { t } = useText();
  const query = useProduct(productId);
  const catalog = useCatalog();
  const product = query.data;
  const opened = productId !== null;
  const trail = product ? categoryTrail(catalog.data?.categories ?? [], product) : '';

  // `?p=` is a shareable URL, so the tab is named after what it opens — and the
  // shop's own title comes back the moment the sheet closes.
  useEffect(() => {
    if (!opened || !product) return;
    document.title = `${product.displayName} — ${brand.name}`;
    return () => {
      document.title = brand.title;
    };
  }, [opened, product, brand.name, brand.title]);

  return (
    <Sheet
      opened={opened}
      onClose={onClose}
      label={product?.displayName ?? t('product.detail.product')}
      header={
        <div className={classes.head}>
          <span className={classes.eyebrow}>{trail || t('product.detail.product')}</span>
          <button type="button" className={classes.close} onClick={onClose} aria-label={t('common.actions.close')}>
            <CloseIcon size={16} />
          </button>
        </div>
      }
      footer={product ? <AddToCart product={product} size="lg" /> : null}
    >
      <div className={classes.body}>
        {query.isPending ? <Loading /> : null}
        {query.isError ? (
          <div className={classes.failed}>
            <p className={classes.failedText}>{t('product.sheet.loadFailed')}</p>
            <Button variant="default" size="sm" onClick={() => void query.refetch()}>
              {t('common.actions.tryAgain')}
            </Button>
          </div>
        ) : null}
        {product ? <Detail product={product} onSelect={onSelect} /> : null}
      </div>
    </Sheet>
  );
}

function Detail({ product, onSelect }: { product: Product; onSelect: (product: Product) => void }) {
  const { brand, currency } = useSettings();
  const { showSku } = useCoreOptions();
  const { t } = useText();
  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  const eta = product.isPreorder && product.preorderEta ? formatDate(new Date(product.preorderEta).toISOString()) : '';

  return (
    <>
      <div className={`${classes.identity} ${FADE}`}>
        <div className={classes.identityText}>
          <h2 className={classes.name} data-sf-part="sheet-title">{product.displayName}</h2>
          <p className={classes.flags}>
            {showSku ? <span className={classes.sku}>{product.sku}</span> : null}
            <StockChip status={status} />
            {product.isPreorder ? (
              <span className={classes.preorder}>{eta ? t('product.sheet.ships', { eta }) : t('common.product.preorder')}</span>
            ) : null}
            {product.minOrderQuantity != null ? (
              <span className={classes.limit}>{t('product.limit.min', { min: product.minOrderQuantity })}</span>
            ) : null}
          </p>
        </div>
        {product.imageProductId !== null ? (
          <ProductImage
            productId={product.imageProductId}
            variant="web"
            alt={product.displayName}
            eager
            className={classes.thumb}
          />
        ) : null}
      </div>

      {/* The one number the shopper came for, on its own rule. */}
      <div className={classes.priceBand}>
        <span className={classes.priceLabel}>{t('product.sheet.unit')}</span>
        <span className={classes.price} data-sf-part="price">{formatMoney(product.price, currency)}</span>
      </div>

      {product.description ? (
        <Block label={t('product.sheet.description')}>
          <p className={classes.description}>{product.description}</p>
        </Block>
      ) : null}

      {product.pricingTiers.length > 0 ? (
        <Block label={t('product.bulk.heading')}>
          <BulkPricing tiers={product.pricingTiers} price={product.price} />
        </Block>
      ) : null}

      {product.provenance ? (
        <Block label={t('product.provenance.heading')}>
          <Provenance markdown={product.provenance} />
        </Block>
      ) : null}

      {brand.links.whatsapp || brand.links.telegram ? (
        <Block label={t('product.ask.heading')}>
          <p className={classes.askText}>
            {t('product.ask.text', { name: product.displayName })}
          </p>
          <ContactLinks prefill={t('product.ask.prefill', { name: product.displayName, sku: product.sku })} />
        </Block>
      ) : null}

      <Upsells product={product} onSelect={onSelect} />
    </>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={classes.block}>
      <h3 className={classes.blockHead}>{label}</h3>
      {children}
    </section>
  );
}

function Loading() {
  const { t } = useText();
  return (
    <div className={classes.loading} role="status" aria-label={t('common.status.loading')}>
      <span className={classes.shape} style={{ width: '65%', height: 22 }} />
      <span className={classes.shape} style={{ width: '35%', height: 12 }} />
      <span className={classes.shape} style={{ width: '100%', height: 56 }} />
      <span className={classes.shape} style={{ width: '90%', height: 12 }} />
      <span className={classes.shape} style={{ width: '80%', height: 12 }} />
    </div>
  );
}
