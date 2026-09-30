import { useSettings } from '@/app/settings.ts';
import { useCartStore } from '@/stores/cart.ts';
import { addToCart, setCartQuantity } from '@/features/cart/useServerCart.ts';
import { deriveStockStatus, formatMoney } from '@/lib/format.ts';
import { StockChip } from '@/features/catalog/StockChip.tsx';
import { MinusIcon, PlusIcon } from '@/components/icons.tsx';
import { rowAnim } from '@/lib/motion.ts';
import type { Product } from '@/types/catalog.ts';
import { useCoreOptions } from '@/templates/hooks.ts';
import { useText } from '@/text/runtime.tsx';
import { useCardDesign } from '@/builder/card-design.tsx';
import { CardRowFamily, type CardData } from '@/builder/families.ts';
import { fixedSlot, type FamilyValue, type PartViewProps } from '@/builder/parts.ts';
import type { SlotRender } from '@/builder/define.ts';
import classes from '@/features/catalog/ProductRow.module.css';

export interface ProductRowProps {
  product: Product;
  /** Opens the detail sheet. The whole row is the target; the gutter sits above it. */
  onSelect: (product: Product) => void;
  /** Position in the list, for the entrance stagger. Omit when a wrapping
   *  element (e.g. `ProductGrid`'s `<li>`) already animates — see `ProductList`
   *  vs. `ProductGrid` for the two call shapes. */
  index?: number;
}

const NONE: Record<string, unknown> = {};
const rowData = ({ product, onSelect, index }: ProductRowProps): CardData => ({ product, onSelect, index, eager: false, hasSiblingImages: true });

/** The lowest-price bulk rung, or null. */
function bestTier(product: Product): Product['pricingTiers'][number] | null {
  return product.pricingTiers.reduce<Product['pricingTiers'][number] | null>(
    (lowest, tier) => (!lowest || tier.price < lowest.price ? tier : lowest),
    null,
  );
}

// ── views (spec §5.3): each renders one part of the row from the card's context ──────────────

function RowFrame({ props, styleAttrs }: PartViewProps) {
  const { index } = CardRowFamily.useData();
  return (
    <div
      className={index === undefined ? classes.row : `${classes.row} ${rowAnim(index).className}`}
      style={index === undefined ? undefined : rowAnim(index).style}
      data-sf-part="product-row"
      {...styleAttrs}
    >
      {(props.content as SlotRender)()}
    </div>
  );
}

const ROW_GROUP: Record<string, string | undefined> = { text: classes.text };
function RowGroup({ props, styleAttrs }: PartViewProps) {
  const kind = typeof props.kind === 'string' && Object.hasOwn(ROW_GROUP, props.kind) ? props.kind : 'text';
  return <div className={ROW_GROUP[kind]} {...styleAttrs}>{(props.items as SlotRender)()}</div>;
}

function RowName({ styleAttrs }: PartViewProps) {
  const { product, onSelect } = CardRowFamily.useData();
  return (
    <h3 className={classes.name} {...styleAttrs}>
      <button type="button" className={classes.open} onClick={() => onSelect?.(product)}>
        {product.displayName}
      </button>
    </h3>
  );
}

function RowMeta({ styleAttrs }: PartViewProps) {
  const { product } = CardRowFamily.useData();
  const { currency } = useSettings();
  const { showSku } = useCoreOptions();
  const { t } = useText();
  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  const best = bestTier(product);
  // With product codes hidden an ordinary line can have nothing to say under its name.
  const hasMeta = showSku || product.minOrderQuantity != null || !!best || product.isPreorder || status !== 'in';
  return hasMeta ? (
    <p className={classes.meta} {...styleAttrs}>
      {showSku ? <span className={classes.sku}>{product.sku}</span> : null}
      {product.minOrderQuantity != null ? (
        <span className={classes.limit}>{t('product.limit.min', { min: product.minOrderQuantity })}</span>
      ) : null}
      {best ? (
        <span className={classes.tier}>
          {best.minQuantity}+ {formatMoney(best.price, currency)}
        </span>
      ) : null}
      {product.isPreorder ? <span className={classes.preorder}>{t('common.product.preorder')}</span> : null}
      {status !== 'in' ? <StockChip status={status} /> : null}
    </p>
  ) : null;
}

function RowPrice({ styleAttrs }: PartViewProps) {
  const { product } = CardRowFamily.useData();
  const { currency } = useSettings();
  return <p className={classes.price} data-sf-part="price" {...styleAttrs}>{formatMoney(product.price, currency)}</p>;
}

function RowAdd({ styleAttrs }: PartViewProps) {
  const { product } = CardRowFamily.useData();
  const { features } = useSettings();
  const { t } = useText();
  const quantity = useCartStore((s) => s.lines.find((l) => l.productId === product.id)?.quantity ?? 0);
  // Written through the cart's sync path, not the store: a signed-in shopper's
  // cart page adopts the server cart on open, so an edit that never reached
  // PUT /cart would vanish there.
  const add = addToCart;
  const setQuantity = setCartQuantity;

  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  const unavailable = !product.isActive || (!product.isPreorder && status === 'out');
  const floor = Math.max(1, product.minOrderQuantity ?? 1);
  const atCeiling = product.maxOrderQuantity != null && quantity >= product.maxOrderQuantity;

  return features.ordering ? (
    <div className={classes.gutter} {...styleAttrs}>
      {quantity > 0 ? (
        <>
          <button
            type="button"
            className={classes.step}
            onClick={() => setQuantity(product.id, quantity > floor ? quantity - 1 : 0)}
            aria-label={t('common.qty.fewer', { name: product.displayName })}
          >
            <MinusIcon size={15} />
          </button>
          <span className={classes.quantity} aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            className={classes.step}
            disabled={atCeiling}
            onClick={() => setQuantity(product.id, quantity + 1)}
            aria-label={t('common.qty.more', { name: product.displayName })}
          >
            <PlusIcon size={15} />
          </button>
        </>
      ) : (
        <button
          type="button"
          className={classes.quickAdd}
          disabled={unavailable}
          onClick={() => add(product, floor)}
          aria-label={
            !product.isActive
              ? t('product.row.unavailable', { name: product.displayName })
              : unavailable
                ? t('product.row.outOfStock', { name: product.displayName })
                : t('product.add.ariaLabel', { verb: product.isPreorder ? t('common.product.preorder') : t('product.add.verb'), name: product.displayName })
          }
        >
          <PlusIcon size={16} />
        </button>
      )}
    </div>
  ) : null;
}

export const ROW_VIEWS: FamilyValue<CardData>['views'] = {
  CardRow: RowFrame, CardRowGroup: RowGroup, CardRowName: RowName, CardRowMeta: RowMeta, CardRowPrice: RowPrice, CardRowAdd: RowAdd,
};

/** The built-in row: today's composition, drawn from the same views (spec §6.3). */
function BuiltInRow({ data }: { data: CardData }) {
  return (
    <CardRowFamily.Provider value={{ data, views: ROW_VIEWS }}>
      <RowFrame props={{ content: fixedSlot(<>
        <RowGroup props={{ kind: 'text', items: fixedSlot(<>
          <RowName props={NONE} />
          <RowMeta props={NONE} />
        </>) }} />
        <RowPrice props={NONE} />
        <RowAdd props={NONE} />
      </>) }} />
    </CardRowFamily.Provider>
  );
}

/**
 * One line of the manifest: name and code on the left, price in tabular mono, and
 * an action gutter of fixed width on the right. The gutter is the point — a `+`
 * and the quantity stepper occupy exactly the same slot, so the column of prices
 * holds its edge whether the cart is empty or full. A published row design (spec §6)
 * rearranges the same views.
 */
export function ProductRow(props: ProductRowProps) {
  const design = useCardDesign('row');
  const data = rowData(props);
  return design ? <>{design.render(data, ROW_VIEWS)}</> : <BuiltInRow data={data} />;
}
