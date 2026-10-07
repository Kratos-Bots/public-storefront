import { useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Button } from '@mantine/core';
import { useSettings } from '@/app/settings.ts';
import { useCatalog, useProduct } from '@/features/catalog/use-catalog.ts';
import { ancestorChain } from '@/features/catalog/category-tree.ts';
import { Sheet } from '@/components/Sheet.tsx';
import { ProductImage } from '@/features/catalog/ProductImage.tsx';
import { StockChip } from '@/features/catalog/StockChip.tsx';
import { PromoBadge } from '@/features/catalog/PromoBadge.tsx';
import { AddToCart } from '@/features/catalog/AddToCart.tsx';
import { BulkPricing } from '@/features/catalog/BulkPricing.tsx';
import { Provenance } from '@/features/catalog/Provenance.tsx';
import { Coa } from '@/features/catalog/Coa.tsx';
import { displayableCoas } from '@/features/catalog/coa-format.ts';
import { Upsells } from '@/features/catalog/Upsells.tsx';
import { BreadcrumbsView, groupClassMap, makeGroupView, productData, useAutoCoa } from '@/features/catalog/product-parts.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { CloseIcon } from '@/components/icons.tsx';
import { ProductFamily, ProductHostContext, type ProductData, type ProductHost, type ProductSlots } from '@/builder/families.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import type { StyleAttrs } from '@/builder/define.ts';
import type { LayoutKind } from '@/builder/types.ts';
import { usePageSetContext } from '@/builder/page-set-context.ts';
import { validateDoc } from '@/builder/guard.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { DocBoundary, RenderDoc } from '@/builder/render.tsx';
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
 * The body is the layout's `product` document (spec §7.2); the chrome and the tab title stay here.
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

  const host = useMemo<ProductHost>(() => ({ productId, onSelect, surface: 'sheet', SheetBody: ProductSheetBody }), [productId, onSelect]);
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
        <ProductHostContext.Provider value={host}>
          <SheetDocument />
        </ProductHostContext.Provider>
      </div>
    </Sheet>
  );
}

/**
 * The layout's `product` document drives the sheet body (spec §7.2); guarded, else the built-in one.
 * The storefront layout's product document is a page, so a list placed there keeps the built-in sheet.
 */
function SheetDocument() {
  const ctx = usePageSetContext();
  const layout = ctx?.layout ?? 'menu';
  const docLayout: LayoutKind = layout === 'storefront' ? 'menu' : layout;
  const stored = layout === 'storefront' ? undefined : ctx?.pageSet?.pages.product;
  // Guard once per stored document object, not on every sheet render.
  const guarded = useMemo(() => (stored ? validateDoc(stored, 'product', docLayout).doc : null), [stored, docLayout]);
  const fallback = useMemo(() => defaultDoc('product', docLayout)!, [docLayout]);
  if (!guarded) return <RenderDoc doc={fallback} docKey="product" layout={docLayout} />;
  return (
    <DocBoundary docKey="product" fallback={<RenderDoc doc={fallback} docKey="product" layout={docLayout} />}>
      <RenderDoc doc={guarded} docKey="product" layout={docLayout} />
    </DocBoundary>
  );
}

/** The ProductDetail container's sheet surface: today's loading / failed states, then the parts. Never sets the title. */
export function ProductSheetBody({ slots }: { slots: ProductSlots }) {
  const host = useContext(ProductHostContext)!;
  const { t } = useText();
  const query = useProduct(host.productId);
  const catalog = useCatalog();
  const product = query.data;
  const data = useMemo(
    () => (product ? productData(product, catalog.data?.categories ?? [], host.onSelect) : null),
    [product, catalog.data, host.onSelect],
  );
  const value = useMemo(() => (data ? { data, views: SHEET_VIEWS } : null), [data]);
  const autoCoa = useAutoCoa(product, slots);
  return (
    <>
      {query.isPending ? <SheetLoading /> : null}
      {query.isError ? (
        <div className={classes.failed}>
          <p className={classes.failedText}>{t('product.sheet.loadFailed')}</p>
          <Button variant="default" size="sm" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        </div>
      ) : null}
      {value ? (
        <ProductFamily.Provider value={value}>
          {slots.top()}
          {slots.media()}
          {slots.main()}
          {autoCoa ? <SheetCoa props={{}} /> : null}
          {slots.below()}
        </ProductFamily.Provider>
      ) : null}
    </>
  );
}

function Block({ label, attrs, children }: { label: string; attrs?: StyleAttrs; children: ReactNode }) {
  return (
    <section className={classes.block} {...attrs}>
      <h3 className={classes.blockHead}>{label}</h3>
      {children}
    </section>
  );
}

function SheetGallery({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  if (product.imageProductId === null) return null;
  return (
    <ProductImage
      productId={product.imageProductId}
      variant="web"
      alt={product.displayName}
      eager
      className={classes.thumb}
      rootAttrs={styleAttrs}
    />
  );
}

function SheetTitle({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  return <h2 className={classes.name} data-sf-part="sheet-title" {...styleAttrs}>{product.displayName}</h2>;
}

function SheetPrice({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { currency } = useSettings();
  const { t } = useText();
  // The one number the shopper came for, on its own rule.
  return (
    <div className={classes.priceBand} {...styleAttrs}>
      <span className={classes.priceLabel}>{t('product.sheet.unit')}</span>
      <span className={classes.price} data-sf-part="price">{formatMoney(product.price, currency)}</span>
    </div>
  );
}

function SheetStock({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { showSku } = useCoreOptions();
  const { t } = useText();
  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  const eta = product.isPreorder && product.preorderEta ? formatDate(new Date(product.preorderEta).toISOString()) : '';
  return (
    <p className={classes.flags} {...styleAttrs}>
      {showSku ? <span className={classes.sku}>{product.sku}</span> : null}
      <PromoBadge promotions={product.promotions} />
      <StockChip status={status} />
      {product.isPreorder ? (
        <span className={classes.preorder}>{eta ? t('product.sheet.ships', { eta }) : t('common.product.preorder')}</span>
      ) : null}
      {product.minOrderQuantity != null ? (
        <span className={classes.limit}>{t('product.limit.min', { min: product.minOrderQuantity })}</span>
      ) : null}
    </p>
  );
}

function SheetDescription({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { t } = useText();
  return product.description ? (
    <Block label={t('product.sheet.description')} attrs={styleAttrs}>
      <p className={classes.description}>{product.description}</p>
    </Block>
  ) : null;
}

function SheetBulkPricing({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { t } = useText();
  return product.pricingTiers.length > 0 ? (
    <Block label={t('product.bulk.heading')} attrs={styleAttrs}>
      <BulkPricing tiers={product.pricingTiers} price={product.price} />
    </Block>
  ) : null;
}

function SheetProvenance({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { t } = useText();
  return product.provenance ? (
    <Block label={t('product.provenance.heading')} attrs={styleAttrs}>
      <Provenance markdown={product.provenance} />
    </Block>
  ) : null;
}

function SheetCoa({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { t } = useText();
  return displayableCoas(product.coas).length > 0 ? (
    <Block label={t('product.coa.heading')} attrs={styleAttrs}>
      <Coa coas={product.coas} />
    </Block>
  ) : null;
}

function SheetAsk({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { brand } = useSettings();
  const { t } = useText();
  return brand.links.whatsapp || brand.links.telegram ? (
    <Block label={t('product.ask.heading')} attrs={styleAttrs}>
      <p className={classes.askText}>
        {t('product.ask.text', { name: product.displayName })}
      </p>
      <ContactLinks prefill={t('product.ask.prefill', { name: product.displayName, sku: product.sku })} />
    </Block>
  ) : null;
}

function SheetUpsells({ styleAttrs }: PartViewProps) {
  const { product, onSelect } = ProductFamily.useData();
  return <Upsells product={product} onSelect={onSelect} rootAttrs={styleAttrs} />;
}

/** The add button is pinned to the sheet footer (spec §7.2); a stored one never renders here. */
const SheetAddToCart = () => null;

/** The sheet surface's view for each product part (spec §5.1): the v0.7.0 sheet JSX of that piece. */
export const SHEET_VIEWS: FamilyValue<ProductData>['views'] = {
  ProductBreadcrumbs: BreadcrumbsView, ProductGallery: SheetGallery, ProductTitle: SheetTitle, ProductPrice: SheetPrice,
  ProductStock: SheetStock, ProductAddToCart: SheetAddToCart, ProductDescription: SheetDescription,
  ProductBulkPricing: SheetBulkPricing, ProductProvenance: SheetProvenance, ProductCoa: SheetCoa, ProductAsk: SheetAsk,
  ProductUpsells: SheetUpsells, ProductGroup: makeGroupView(groupClassMap(FADE)),
};

/** The sheet's skeleton while the product loads (also the editor's sheet stage). */
export function SheetLoading() {
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
