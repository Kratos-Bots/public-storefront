import { useEffect, useMemo } from 'react';
import { Button } from '@mantine/core';
import { Link, useParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useCatalog, useProduct } from '@/features/catalog/use-catalog.ts';
import { ProductImage } from '@/features/catalog/ProductImage.tsx';
import { StockChip } from '@/features/catalog/StockChip.tsx';
import { PromoBadge } from '@/features/catalog/PromoBadge.tsx';
import { AddToCart } from '@/features/catalog/AddToCart.tsx';
import { BulkPricing } from '@/features/catalog/BulkPricing.tsx';
import { Provenance } from '@/features/catalog/Provenance.tsx';
import { Upsells } from '@/features/catalog/Upsells.tsx';
import { BreadcrumbsView, groupClassMap, makeGroupView, productData } from '@/features/catalog/product-parts.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { ProductFamily, type ProductData, type ProductSlots } from '@/builder/families.ts';
import { NO_SILENT, slotShows, type FamilyValue, type PartViewProps } from '@/builder/parts.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import { deriveStockStatus, formatDate, formatMoney } from '@/lib/format.ts';
import { FADE } from '@/lib/motion.ts';
import { useCoreOptions } from '@/templates/hooks.ts';
import { useText } from '@/text/runtime.tsx';
import classes from '@/features/catalog/ProductDetailPage.module.css';

/** Which optional parts the page shows — the ProductDetail block's toggles. All on by default. */
export interface ProductDetailSections { gallery: boolean; bulkPricing: boolean; provenance: boolean; upsells: boolean }
const ALL_SECTIONS: ProductDetailSections = { gallery: true, bulkPricing: true, provenance: true, upsells: true };

const GroupView = makeGroupView(groupClassMap(FADE));
const GALLERY_SILENT: ReadonlySet<string> = new Set(['ProductGallery']);

function PageGallery({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  if (product.imageProductId === null) return null;
  return <ProductImage productId={product.imageProductId} variant="web" alt={product.displayName} eager rootAttrs={styleAttrs} />;
}

function PageTitle({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { showSku } = useCoreOptions();
  return (
    <header className={classes.head} {...styleAttrs}>
      <h1 className={classes.name} data-sf-part="page-title">{product.displayName}</h1>
      {showSku ? <p className={classes.sku}>{product.sku}</p> : null}
    </header>
  );
}

function PagePrice({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { currency } = useSettings();
  return <p className={classes.price} data-sf-part="price" {...styleAttrs}>{formatMoney(product.price, currency)}</p>;
}

function PageStock({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { t } = useText();
  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  const eta = product.isPreorder && product.preorderEta ? formatDate(new Date(product.preorderEta).toISOString()) : '';
  return (
    <div className={classes.flags} {...styleAttrs}>
      <PromoBadge promotions={product.promotions} />
      <StockChip status={status} />
      {product.isPreorder ? (
        <span className={classes.preorder}>{eta ? t('product.detail.preorderShips', { eta }) : t('common.product.preorder')}</span>
      ) : null}
      {product.minOrderQuantity != null ? (
        <span className={classes.limit}>{t('product.limit.min', { min: product.minOrderQuantity })}</span>
      ) : null}
    </div>
  );
}

function PageAddToCart({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  return <AddToCart product={product} size="lg" rootAttrs={styleAttrs} />;
}

function PageDescription({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  return product.description ? <p className={classes.description} {...styleAttrs}>{product.description}</p> : null;
}

function PageBulkPricing({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { t } = useText();
  if (product.pricingTiers.length === 0) return null;
  return (
    <section className={classes.section} aria-labelledby="bulk-heading" {...styleAttrs}>
      <h2 id="bulk-heading" className={classes.sectionHead}>
        {t('product.bulk.heading')}
      </h2>
      <BulkPricing tiers={product.pricingTiers} price={product.price} />
    </section>
  );
}

function PageProvenance({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { t } = useText();
  if (!product.provenance) return null;
  return (
    <section className={classes.section} aria-labelledby="provenance-heading" {...styleAttrs}>
      <h2 id="provenance-heading" className={classes.sectionHead}>
        {t('product.provenance.heading')}
      </h2>
      <Provenance markdown={product.provenance} />
    </section>
  );
}

function PageAsk({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  const { brand } = useSettings();
  const { t } = useText();
  if (!(brand.links.whatsapp || brand.links.telegram)) return null;
  return (
    <section className={classes.ask} aria-labelledby="ask-heading" {...styleAttrs}>
      <h2 id="ask-heading" className={classes.sectionHead}>
        {t('product.ask.heading')}
      </h2>
      <p className={classes.askText}>
        {t('product.ask.text', { name: product.displayName })}
      </p>
      <ContactLinks prefill={t('product.ask.prefill', { name: product.displayName, sku: product.sku })} />
    </section>
  );
}

function PageUpsells({ styleAttrs }: PartViewProps) {
  const { product } = ProductFamily.useData();
  return <Upsells product={product} rootAttrs={styleAttrs} />;
}

/** The page surface's view for each product part (spec §5.1): the v0.7.0 JSX of that piece. */
export const PAGE_VIEWS: FamilyValue<ProductData>['views'] = {
  ProductBreadcrumbs: BreadcrumbsView, ProductGallery: PageGallery, ProductTitle: PageTitle, ProductPrice: PagePrice,
  ProductStock: PageStock, ProductAddToCart: PageAddToCart, ProductDescription: PageDescription,
  ProductBulkPricing: PageBulkPricing, ProductProvenance: PageProvenance, ProductAsk: PageAsk,
  ProductUpsells: PageUpsells, ProductGroup: GroupView,
};

/** Drops undefined values so the ALL_SECTIONS defaults survive a partial `sections`. */
const compact = (o: Record<string, boolean | undefined>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * The product page — the ProductDetail container's page surface (spec §5.1). `slots` come from the
 * block; without them (tests, v0.7.0 call sites) the default arrangement is drawn from `sections`.
 */
export function ProductDetailPage({ sections, slots }: { sections?: Partial<ProductDetailSections>; slots?: ProductSlots }) {
  const gallery = sections?.gallery;
  const bulkPricing = sections?.bulkPricing;
  const provenance = sections?.provenance;
  const upsells = sections?.upsells;
  const legacy = useMemo(
    () => (slots ? null : (defaultSlotRenders('ProductDetail', 'storefront', { ...ALL_SECTIONS, ...compact({ gallery, bulkPricing, provenance, upsells }) }) as unknown as ProductSlots)),
    [slots, gallery, bulkPricing, provenance, upsells],
  );
  const s = slots ?? legacy!;
  const { brand } = useSettings();
  const { id } = useParams();
  const productId = Number(id);
  const query = useProduct(productId);
  const catalog = useCatalog();
  const product = query.data;
  const data = useMemo(() => (product ? productData(product, catalog.data?.categories ?? []) : null), [product, catalog.data]);
  const value = useMemo(() => (data ? { data, views: PAGE_VIEWS } : null), [data]);

  // The tab is part of the page: name it after what the shopper is looking at,
  // and hand the shop's own title back when they leave.
  useEffect(() => {
    if (!product) return;
    document.title = `${product.displayName} — ${brand.name}`;
    return () => {
      document.title = brand.title;
    };
  }, [product, brand.name, brand.title]);

  if (Number.isNaN(productId)) return <NotFound />;
  if (query.isPending) return <PageSkeleton inline />;
  if (query.isError || !product || !value) return <NotFound retry={() => void query.refetch()} />;

  // Today's hasImage rule, read from the slot: no media column when nothing in it would render.
  const mediaShows = slotShows(s.media.items, product.imageProductId === null ? GALLERY_SILENT : NO_SILENT);
  return (
    <ProductFamily.Provider value={value}>
      <article className={`${classes.page} ${FADE}`}>
        {s.top()}
        <div className={mediaShows ? classes.layout : `${classes.layout} ${classes.layoutNoImage}`}>
          {mediaShows ? s.media({ className: classes.media }) : null}
          {s.main({ className: classes.detail })}
        </div>
        {s.below()}
      </article>
    </ProductFamily.Provider>
  );
}

function NotFound({ retry }: { retry?: () => void }) {
  const { t } = useText();
  return (
    <EmptyState
      eyebrow={t('product.detail.product')}
      title={t('product.detail.notFoundTitle')}
      description={t('product.detail.notFoundDetail')}
      action={
        retry ? (
          <div className={classes.notFoundActions}>
            <Button variant="default" size="sm" onClick={retry}>
              {t('common.actions.tryAgain')}
            </Button>
            <Button component={Link} to="/" variant="subtle" size="sm">
              {t('product.detail.browse')}
            </Button>
          </div>
        ) : (
          <Button component={Link} to="/" variant="default" size="sm">
            {t('product.detail.browse')}
          </Button>
        )
      }
    />
  );
}
