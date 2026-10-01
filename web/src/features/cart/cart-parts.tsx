import type { ComponentType } from 'react';
import { Button } from '@mantine/core';
import { Link } from 'react-router';
import { CartFamily } from '@/builder/family-cart.ts';
import type { FamilyValue, PartViewProps } from '@/builder/parts.ts';
import { EmptyState } from '@/components/EmptyState.tsx';
import { CartLine } from '@/features/cart/CartLine.tsx';
import { useText } from '@/text/runtime.tsx';
import pageClasses from '@/features/cart/CartPage.module.css';
import drawerClasses from '@/features/cart/CartDrawer.module.css';

/** CartHeading, page surface: eyebrow, title, count and the sync pulse. Nothing for an empty cart. */
function HeadingPageView({ styleAttrs }: PartViewProps) {
  const { t, tp } = useText();
  const { lines, count, isSyncing } = CartFamily.useData();
  if (lines.length === 0) return null;
  return (
    <header className={pageClasses.head} {...styleAttrs}>
      <span className={pageClasses.eyebrow}>{t('cart.page.eyebrow')}</span>
      <h1 className={pageClasses.title}>{t('cart.page.title')}</h1>
      <p className={pageClasses.sub}>
        {tp('cart.summary.items', count)}
        {isSyncing ? <span className={pageClasses.pulse} aria-hidden /> : null}
      </p>
    </header>
  );
}

function linesView(classes: Readonly<Record<string, string>>): ComponentType<PartViewProps> {
  return function LinesView({ styleAttrs }: PartViewProps) {
    const { lines, issueByProduct, setQuantity, remove } = CartFamily.useData();
    if (lines.length === 0) return null;
    return (
      <ul className={classes.lines} {...styleAttrs}>
        {lines.map((line, i) => (
          <CartLine
            key={line.productId}
            line={line}
            issue={issueByProduct.get(line.productId)}
            onQuantity={setQuantity}
            onRemove={remove}
            index={i}
          />
        ))}
      </ul>
    );
  };
}

/** CartEmpty: the empty state with its way back to the catalogue (the drawer's button also closes the drawer). */
function EmptyView({ styleAttrs }: PartViewProps) {
  const { t } = useText();
  const { lines, dismiss } = CartFamily.useData();
  if (lines.length > 0) return null;
  return (
    <EmptyState
      eyebrow={t('cart.page.eyebrow')}
      title={t('cart.empty.title')}
      description={t('cart.empty.description')}
      rootAttrs={styleAttrs}
      action={
        <Button component={Link} to="/" variant="default" size="sm" onClick={dismiss}>
          {t('common.actions.browseCatalogue')}
        </Button>
      }
    />
  );
}

const nothing = () => null;

export const CART_PAGE_VIEWS: FamilyValue<never>['views'] = {
  CartHeading: HeadingPageView,
  CartLines: linesView(pageClasses),
  CartEmpty: EmptyView,
};

/** The drawer's own header (title, count) is the heading, so the part draws nothing there. */
export const CART_DRAWER_VIEWS: FamilyValue<never>['views'] = {
  CartHeading: nothing,
  CartLines: linesView(drawerClasses),
  CartEmpty: EmptyView,
};
