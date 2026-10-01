import { Link } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { deriveStockStatus, formatMoney } from '@/lib/format.ts';
import { ProductImage } from '@/features/catalog/ProductImage.tsx';
import { StockChip } from '@/features/catalog/StockChip.tsx';
import { PromoBadge } from '@/features/catalog/PromoBadge.tsx';
import { AddToCart } from '@/features/catalog/AddToCart.tsx';
import { rowAnim } from '@/lib/motion.ts';
import { useText } from '@/text/runtime.tsx';
import { useCardDesign } from '@/builder/card-design.tsx';
import { CardTileFamily, type CardData } from '@/builder/families.ts';
import { fixedSlot, type FamilyValue, type PartViewProps } from '@/builder/parts.ts';
import type { SlotRender } from '@/builder/define.ts';
import type { Product } from '@/types/catalog.ts';
import { useOutOfStockInPriceSlot } from '@/features/catalog/stock-price.ts';
import { bestTier } from '@/features/catalog/best-tier.ts';
import classes from '@/features/catalog/ProductCard.module.css';
import imageClasses from '@/features/catalog/ProductImage.module.css';

export interface ProductCardProps {
  product: Product;
  /** The first row of the grid loads its images straight away. */
  eager?: boolean;
  /** False when nothing in the visible set has a photo: the well is dropped entirely. */
  hasSiblingImages?: boolean;
  /** Position in the grid, for the entrance stagger. */
  index?: number;
}

const NONE: Record<string, unknown> = {};
const tileData = ({ product, eager = false, hasSiblingImages = true, index = 0 }: ProductCardProps): CardData => ({ product, eager, hasSiblingImages, index });

// ── views (spec §5.3): each renders one part of the tile from the card's context ─────────────

function TileFrame({ props, styleAttrs }: PartViewProps) {
  const { index = 0 } = CardTileFamily.useData();
  const anim = rowAnim(index);
  return (
    <article className={`${classes.card} ${anim.className}`} style={anim.style} data-sf-part="product-card" {...styleAttrs}>
      {(props.content as SlotRender)()}
    </article>
  );
}

function TileImage({ styleAttrs }: PartViewProps) {
  const { product, eager, hasSiblingImages } = CardTileFamily.useData();
  if (product.imageProductId !== null) {
    return (
      <ProductImage
        productId={product.imageProductId}
        variant="thumbnail"
        alt={product.displayName}
        eager={eager}
        className={classes.media}
        rootAttrs={styleAttrs}
      />
    );
  }
  return hasSiblingImages ? (
    <span className={`${imageClasses.well} ${classes.media}`} aria-hidden {...styleAttrs}>
      <span className={imageClasses.rule} />
    </span>
  ) : null;
}

const TILE_GROUP: Record<string, string | undefined> = { body: classes.body, foot: classes.foot };
function TileGroup({ props, styleAttrs }: PartViewProps) {
  const kind = typeof props.kind === 'string' && Object.hasOwn(TILE_GROUP, props.kind) ? props.kind : 'body';
  return <div className={TILE_GROUP[kind]} {...styleAttrs}>{(props.items as SlotRender)()}</div>;
}

function TileName({ styleAttrs }: PartViewProps) {
  const { product } = CardTileFamily.useData();
  return (
    <>
      <h3 className={classes.name} {...styleAttrs}>
        <Link to={`/p/${product.id}`} className={classes.link}>
          {product.displayName}
        </Link>
      </h3>
      {product.shortDescription ? <p className={classes.blurb}>{product.shortDescription}</p> : null}
    </>
  );
}

function TileFlags({ styleAttrs }: PartViewProps) {
  const { product } = CardTileFamily.useData();
  const { t } = useText();
  // When the price slot already says "Out of stock", the flags do not repeat it.
  const outInPrice = useOutOfStockInPriceSlot(product);
  const status = outInPrice ? 'in' : deriveStockStatus(product.inStock, product.lowStockAlert);
  const promoted = (product.promotions?.length ?? 0) > 0;
  if (!(promoted || product.isPreorder || status !== 'in' || product.minOrderQuantity != null)) return null;
  return (
    <div className={classes.flags} {...styleAttrs}>
      <PromoBadge promotions={product.promotions} />
      {product.minOrderQuantity != null ? (
        <span className={classes.limit}>{t('product.limit.min', { min: product.minOrderQuantity })}</span>
      ) : null}
      {product.isPreorder ? <span className={classes.preorder}>{t('common.product.preorder')}</span> : null}
      {status !== 'in' ? <StockChip status={status} /> : null}
    </div>
  );
}

function TilePrice({ styleAttrs }: PartViewProps) {
  const { product } = CardTileFamily.useData();
  const { currency } = useSettings();
  const best = bestTier(product);
  const outInPrice = useOutOfStockInPriceSlot(product);
  return (
    <p className={classes.prices} {...styleAttrs}>
      <span className={classes.price} data-sf-part="price">{outInPrice ? <StockChip status="out" /> : formatMoney(product.price, currency)}</span>
      {best && !outInPrice ? (
        <span className={classes.tier}>
          {best.minQuantity}+ {formatMoney(best.price, currency)}
        </span>
      ) : null}
    </p>
  );
}

function TileAdd({ styleAttrs }: PartViewProps) {
  const { product } = CardTileFamily.useData();
  return (
    <div className={classes.add} {...styleAttrs}>
      <AddToCart product={product} size="sm" showPrice={false} />
    </div>
  );
}

export const TILE_VIEWS: FamilyValue<CardData>['views'] = {
  CardTile: TileFrame, CardTileImage: TileImage, CardTileGroup: TileGroup, CardTileName: TileName,
  CardTileFlags: TileFlags, CardTilePrice: TilePrice, CardTileAdd: TileAdd,
};

/** The built-in tile: today's composition, drawn from the same views (spec §6.3). */
function BuiltInTile({ data }: { data: CardData }) {
  return (
    <CardTileFamily.Provider value={{ data, views: TILE_VIEWS }}>
      <TileFrame props={{ content: fixedSlot(<>
        <TileImage props={NONE} />
        <TileGroup props={{ kind: 'body', items: fixedSlot(<>
          <TileName props={NONE} />
          <TileFlags props={NONE} />
          <TileGroup props={{ kind: 'foot', items: fixedSlot(<>
            <TilePrice props={NONE} />
            <TileAdd props={NONE} />
          </>) }} />
        </>) }} />
      </>) }} />
    </CardTileFamily.Provider>
  );
}

/**
 * One product in the grid. The whole tile opens the product page — the name link
 * stretches over the card — and the quick-add sits above it so a tap on the
 * button never navigates. A published tile design (spec §6) rearranges the same views.
 */
export function ProductCard(props: ProductCardProps) {
  const design = useCardDesign('tile');
  const data = tileData(props);
  return design ? <>{design.render(data, TILE_VIEWS)}</> : <BuiltInTile data={data} />;
}
