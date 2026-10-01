import type { ComponentType } from 'react';
import { Link } from 'react-router';
import { categoryPath } from '@/features/catalog/CategoryNav.tsx';
import { ancestorChain } from '@/features/catalog/category-tree.ts';
import { ProductFamily, type ProductData } from '@/builder/families.ts';
import type { PartViewProps } from '@/builder/parts.ts';
import type { SlotRender } from '@/builder/define.ts';
import type { Category, Product } from '@/types/catalog.ts';
import { useText } from '@/text/runtime.tsx';
import pageClasses from '@/features/catalog/ProductDetailPage.module.css';
import sheetClasses from '@/features/catalog/ProductDetailSheet.module.css';

/** The container's data: the product and its category trail (the catalogue may not carry the category yet). */
export function productData(product: Product, categories: Category[], onSelect?: (p: Product) => void): ProductData {
  const trail = ancestorChain(categories, product.categoryId);
  // Before the catalogue arrives (or for a category it doesn't carry) fall back to
  // the flattened path the product itself came with, as plain text.
  const fallbackTrail = trail.length === 0 && product.categoryName ? product.categoryName.split('>').map((s) => s.trim()) : [];
  return onSelect ? { product, trail, fallbackTrail, onSelect } : { product, trail, fallbackTrail };
}

/** ProductBreadcrumbs — the same nav on both surfaces (spec §5.1). */
export function BreadcrumbsView({ styleAttrs }: PartViewProps) {
  const { trail, fallbackTrail } = ProductFamily.useData();
  const { t } = useText();
  return (
    <nav className={pageClasses.crumbs} aria-label={t('product.detail.breadcrumb')} {...styleAttrs}>
      <Link to="/" className={pageClasses.crumb}>
        {t('product.detail.shop')}
      </Link>
      {trail.map((step) => (
        <span key={step.id} className={pageClasses.step}>
          <span className={pageClasses.slash} aria-hidden>
            /
          </span>
          <Link to={categoryPath(step)} className={pageClasses.crumb}>
            {step.name}
          </Link>
        </span>
      ))}
      {fallbackTrail.map((name) => (
        <span key={name} className={pageClasses.step}>
          <span className={pageClasses.slash} aria-hidden>
            /
          </span>
          <span className={pageClasses.crumb}>{name}</span>
        </span>
      ))}
    </nav>
  );
}

/** The three group wrappers, the same on both surfaces (spec §5.1). `fade` is lib/motion's FADE. */
export function groupClassMap(fade: string): Record<'priceRow' | 'identity' | 'identityText', string> {
  return { priceRow: pageClasses.priceRow, identity: `${sheetClasses.identity} ${fade}`, identityText: sheetClasses.identityText };
}

/** ProductGroup's view over a surface's class map; an unknown kind draws the default (side by side). */
export function makeGroupView(classOf: Record<string, string>): ComponentType<PartViewProps> {
  return function ProductGroupView({ props, styleAttrs }: PartViewProps) {
    const kind = typeof props.kind === 'string' && Object.hasOwn(classOf, props.kind) ? props.kind : 'priceRow';
    const items = props.items as SlotRender | undefined;
    return <div className={classOf[kind]} {...styleAttrs}>{typeof items === 'function' ? items() : null}</div>;
  };
}
