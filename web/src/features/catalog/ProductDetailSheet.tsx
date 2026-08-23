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
import type { Category, Product } from '@/types/catalog.ts';
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
      label={product?.displayName ?? 'Product'}
      header={
        <div className={classes.head}>
          <span className={classes.eyebrow}>{trail || 'Product'}</span>
          <button type="button" className={classes.close} onClick={onClose} aria-label="Close">
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
            <p className={classes.failedText}>We couldn't load this product.</p>
            <Button variant="default" size="sm" onClick={() => void query.refetch()}>
              Try again
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
  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  const eta = product.isPreorder && product.preorderEta ? formatDate(new Date(product.preorderEta).toISOString()) : '';

  return (
    <>
      <div className={classes.identity}>
        <div className={classes.identityText}>
          <h2 className={classes.name}>{product.displayName}</h2>
          <p className={classes.flags}>
            <span className={classes.sku}>{product.sku}</span>
            <StockChip status={status} />
            {product.isPreorder ? (
              <span className={classes.preorder}>{eta ? `Ships ${eta}` : 'Pre-order'}</span>
            ) : null}
          </p>
        </div>
        <ProductImage
          productId={product.imageProductId ?? product.id}
          variant="web"
          alt={product.displayName}
          eager
          className={classes.thumb}
        />
      </div>

      {/* The one number the shopper came for, on its own rule. */}
      <div className={classes.priceBand}>
        <span className={classes.priceLabel}>Unit</span>
        <span className={classes.price}>{formatMoney(product.price, currency)}</span>
      </div>

      {product.description ? (
        <Block label="Description">
          <p className={classes.description}>{product.description}</p>
        </Block>
      ) : null}

      {product.pricingTiers.length > 0 ? (
        <Block label="Buy more, pay less">
          <BulkPricing tiers={product.pricingTiers} price={product.price} />
        </Block>
      ) : null}

      {product.provenance ? (
        <Block label="Provenance">
          <Provenance markdown={product.provenance} />
        </Block>
      ) : null}

      {brand.links.whatsapp || brand.links.telegram ? (
        <Block label="Ask first">
          <p className={classes.askText}>
            Send us a message about {product.displayName} and we'll answer before you order.
          </p>
          <ContactLinks prefill={`Hi — a question about ${product.displayName} (${product.sku})`} />
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
  return (
    <div className={classes.loading} role="status" aria-label="Loading">
      <span className={classes.shape} style={{ width: '65%', height: 22 }} />
      <span className={classes.shape} style={{ width: '35%', height: 12 }} />
      <span className={classes.shape} style={{ width: '100%', height: 56 }} />
      <span className={classes.shape} style={{ width: '90%', height: 12 }} />
      <span className={classes.shape} style={{ width: '80%', height: 12 }} />
    </div>
  );
}
