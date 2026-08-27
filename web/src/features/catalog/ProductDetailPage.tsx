import { useEffect } from 'react';
import { Button } from '@mantine/core';
import { Link, useParams } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useCatalog, useProduct } from '@/features/catalog/use-catalog.ts';
import { categoryPath } from '@/features/catalog/CategoryNav.tsx';
import { ancestorChain } from '@/features/catalog/category-tree.ts';
import { ProductImage } from '@/features/catalog/ProductImage.tsx';
import { StockChip } from '@/features/catalog/StockChip.tsx';
import { AddToCart } from '@/features/catalog/AddToCart.tsx';
import { BulkPricing } from '@/features/catalog/BulkPricing.tsx';
import { Provenance } from '@/features/catalog/Provenance.tsx';
import { Upsells } from '@/features/catalog/Upsells.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { deriveStockStatus, formatDate, formatMoney } from '@/lib/format.ts';
import { FADE } from '@/lib/motion.ts';
import classes from '@/features/catalog/ProductDetailPage.module.css';

/** The single product page — the storefront layout's detail view. */
export function ProductDetailPage() {
  const { brand, currency } = useSettings();
  const { id } = useParams();
  const productId = Number(id);
  const query = useProduct(productId);
  const catalog = useCatalog();
  const product = query.data;

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
  if (query.isError || !product) return <NotFound retry={() => void query.refetch()} />;

  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  const hasImage = product.imageProductId !== null;
  const trail = ancestorChain(catalog.data?.categories ?? [], product.categoryId);
  // Before the catalogue arrives (or for a category it doesn't carry) fall back to
  // the flattened path the product itself came with, as plain text.
  const fallback = trail.length === 0 && product.categoryName ? product.categoryName.split('>').map((s) => s.trim()) : [];
  const eta = product.isPreorder && product.preorderEta ? formatDate(new Date(product.preorderEta).toISOString()) : '';

  return (
    <article className={`${classes.page} ${FADE}`}>
      <nav className={classes.crumbs} aria-label="Breadcrumb">
        <Link to="/" className={classes.crumb}>
          Shop
        </Link>
        {trail.map((step) => (
          <span key={step.id} className={classes.step}>
            <span className={classes.slash} aria-hidden>
              /
            </span>
            <Link to={categoryPath(step)} className={classes.crumb}>
              {step.name}
            </Link>
          </span>
        ))}
        {fallback.map((name) => (
          <span key={name} className={classes.step}>
            <span className={classes.slash} aria-hidden>
              /
            </span>
            <span className={classes.crumb}>{name}</span>
          </span>
        ))}
      </nav>

      <div className={hasImage ? classes.layout : `${classes.layout} ${classes.layoutNoImage}`}>
        {hasImage ? (
          <div className={classes.media}>
            <ProductImage
              productId={product.imageProductId!}
              variant="web"
              alt={product.displayName}
              eager
            />
          </div>
        ) : null}

        <div className={classes.detail}>
          <header className={classes.head}>
            <h1 className={classes.name}>{product.displayName}</h1>
            <p className={classes.sku}>{product.sku}</p>
          </header>

          <div className={classes.priceRow}>
            <p className={classes.price}>{formatMoney(product.price, currency)}</p>
            <div className={classes.flags}>
              <StockChip status={status} />
              {product.isPreorder ? (
                <span className={classes.preorder}>{eta ? `Pre-order · ships ${eta}` : 'Pre-order'}</span>
              ) : null}
            </div>
          </div>

          <AddToCart product={product} size="lg" />

          {product.description ? <p className={classes.description}>{product.description}</p> : null}

          {product.pricingTiers.length > 0 ? (
            <section className={classes.section} aria-labelledby="bulk-heading">
              <h2 id="bulk-heading" className={classes.sectionHead}>
                Buy more, pay less
              </h2>
              <BulkPricing tiers={product.pricingTiers} price={product.price} />
            </section>
          ) : null}

          {product.provenance ? (
            <section className={classes.section} aria-labelledby="provenance-heading">
              <h2 id="provenance-heading" className={classes.sectionHead}>
                Provenance
              </h2>
              <Provenance markdown={product.provenance} />
            </section>
          ) : null}

          {brand.links.whatsapp || brand.links.telegram ? (
            <section className={classes.ask} aria-labelledby="ask-heading">
              <h2 id="ask-heading" className={classes.sectionHead}>
                Ask first
              </h2>
              <p className={classes.askText}>
                Send us a message about {product.displayName} and we'll answer before you order.
              </p>
              <ContactLinks prefill={`Hi — a question about ${product.displayName} (${product.sku})`} />
            </section>
          ) : null}
        </div>
      </div>

      <Upsells product={product} />
    </article>
  );
}

function NotFound({ retry }: { retry?: () => void }) {
  return (
    <EmptyState
      eyebrow="Product"
      title="We can't find that product"
      description="It may have sold out and been retired, or the link may be out of date."
      action={
        retry ? (
          <div className={classes.notFoundActions}>
            <Button variant="default" size="sm" onClick={retry}>
              Try again
            </Button>
            <Button component={Link} to="/" variant="subtle" size="sm">
              Browse the shop
            </Button>
          </div>
        ) : (
          <Button component={Link} to="/" variant="default" size="sm">
            Browse the shop
          </Button>
        )
      }
    />
  );
}
