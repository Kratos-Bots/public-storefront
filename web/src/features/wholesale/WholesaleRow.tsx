import { useEffect, useId, useState } from 'react';
import { useSettings } from '@/app/settings.ts';
import { useCartStore } from '@/stores/cart.ts';
import { addToCart, setCartQuantity } from '@/features/cart/useServerCart.ts';
import { deriveStockStatus, formatMoney, resolveUnitPrice } from '@/lib/format.ts';
import { StockChip } from '@/features/catalog/StockChip.tsx';
import { TierLadder } from '@/features/wholesale/TierLadder.tsx';
import { ChevronIcon, MinusIcon, PlusIcon } from '@/components/icons.tsx';
import { rowAnim } from '@/lib/motion.ts';
import type { Product } from '@/types/catalog.ts';
import classes from '@/features/wholesale/WholesaleRow.module.css';

export interface WholesaleRowProps {
  product: Product;
  /** This row's category run is a banded one — see `bandRows`. */
  band: boolean;
  /** Last row of its run; closes it with the heavier rule. */
  groupEnd: boolean;
  ordering: boolean;
  /** Position in the sheet, for the entrance stagger. */
  index?: number;
}

/**
 * One line of the trade sheet, as its own row group: code, name, the unit price
 * at the quantity in the box, the bulk chip, the line total, and the stepper.
 *
 * Every figure is quoted at the quantity you have actually typed — that is the
 * whole argument of the sheet — so the unit price moves as the stepper passes a
 * price break, and the chip turns into the discount it just won.
 */
export function WholesaleRow({ product, band, groupEnd, ordering, index }: WholesaleRowProps) {
  const { currency } = useSettings();
  const quantity = useCartStore(
    (s) => s.lines.find((l) => l.productId === product.id)?.quantity ?? 0,
  );
  const [open, setOpen] = useState(false);
  const ladderId = useId();

  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  const unavailable = !product.isActive || (!product.isPreorder && status === 'out');
  const unitPrice = resolveUnitPrice(product, Math.max(quantity, 1));
  const saving = product.price > 0 ? Math.round((1 - unitPrice / product.price) * 100) : 0;
  const discounted = saving > 0;
  const hasTiers = product.pricingTiers.length > 0;
  const inCart = quantity > 0;

  const floor = Math.max(1, product.minOrderQuantity ?? 1);
  const max = product.maxOrderQuantity;
  const atCeiling = inCart && max != null && quantity >= max;

  /** The store keys quantity edits by product id, so a line has to exist first.
   *  Both writers go through the cart's sync path so a logged-in trade order mirrors to the server. */
  const setQty = (next: number) => {
    const q = Math.max(0, Math.floor(Number.isFinite(next) ? next : 0));
    if (q === quantity) return;
    if (quantity === 0) addToCart(product, q);
    else setCartQuantity(product.id, q);
  };

  // `+`/`−` clamp immediately against known bounds. The typed field can't: it
  // commits on every keystroke with no draft of its own, so clamping there
  // mid-type would fight the digits as they're entered (typing "10" toward a
  // floor of 10 would snap to 10 after the first "1" and strand the second
  // keystroke) — `draft`/`commitDraft` below give it the same on-blur pattern
  // `CartLine`'s quantity field already uses.
  const onDecrement = () => setQty(quantity > floor ? quantity - 1 : 0);
  const onIncrement = () => setQty(quantity === 0 ? floor : quantity + 1);

  const [draft, setDraft] = useState(quantity > 0 ? String(quantity) : '');
  useEffect(() => setDraft(quantity > 0 ? String(quantity) : ''), [quantity]);

  const commitDraft = () => {
    const digits = draft.replace(/\D/g, '');
    let q = digits === '' ? 0 : Math.max(0, parseInt(digits, 10));
    if (q > 0 && q < floor) q = floor;
    if (q > 0 && max != null && q > max) q = max;
    setDraft(q > 0 ? String(q) : '');
    setQty(q);
  };

  const groupClass = [classes.group, band ? classes.band : '', inCart ? classes.inCart : '']
    .filter(Boolean)
    .join(' ');
  // The run's closing rule belongs under the last thing the run renders — the
  // ladder when it is unrolled, the row itself when it is not.
  const ladderOpen = hasTiers && open;

  return (
    <>
      <tbody
        className={
          index === undefined
            ? `${groupClass} ${groupEnd && !ladderOpen ? classes.groupEnd : ''}`
            : `${groupClass} ${groupEnd && !ladderOpen ? classes.groupEnd : ''} ${rowAnim(index).className}`
        }
        style={index === undefined ? undefined : rowAnim(index).style}
        role="rowgroup"
      >
        <tr className={`${classes.row} ${unavailable ? classes.dim : ''}`} role="row">
          <td className={classes.code} role="cell">
            {product.sku}
          </td>

          <td className={classes.product} role="cell">
            {/* The flex lives on an inner span, not the cell: a cell that is a flex
                box gets wrapped in an anonymous one at 62em and loses its column. */}
            <span className={classes.identity}>
              <span className={classes.name}>{product.displayName}</span>
              {product.minOrderQuantity != null ? (
                <span className={classes.limit}>Min {product.minOrderQuantity}</span>
              ) : null}
              {product.isPreorder ? <span className={classes.preorder}>Pre-order</span> : null}
              {status !== 'in' ? <StockChip status={status} /> : null}
            </span>
          </td>

          <td className={classes.unit} role="cell">
            <span className={classes.unitPrice}>{formatMoney(unitPrice, currency)}</span>
            <span className={classes.each}>/ea</span>
          </td>

          <td className={classes.bulk} role="cell">
            {hasTiers ? (
              <button
                type="button"
                className={`${classes.chip} ${discounted ? classes.chipOn : ''}`}
                aria-expanded={open}
                aria-controls={open ? ladderId : undefined}
                aria-label={
                  discounted
                    ? `Bulk price applied, ${saving}% off — show the price breaks for ${product.displayName}`
                    : `Show the price breaks for ${product.displayName}`
                }
                onClick={() => setOpen((v) => !v)}
              >
                {discounted ? `−${saving}%` : 'Bulk'}
                {/* The chevron follows `aria-expanded` in CSS — the state is
                    declared once, in the place assistive tech reads it. */}
                <ChevronIcon size={11} />
              </button>
            ) : null}
          </td>

          {ordering ? (
            <>
              {/* Left genuinely empty when nothing is on order: the em dash is drawn
                  by CSS on the wide sheet, where the column needs a rail, and
                  dropped on a phone, where it would just be a stray character. */}
              <td className={classes.line} role="cell">
                {inCart ? formatMoney(unitPrice * quantity, currency) : null}
              </td>

              <td className={classes.qty} role="cell">
                {unavailable ? (
                  inCart ? (
                    <button
                      type="button"
                      className={classes.remove}
                      onClick={() => setQty(0)}
                      aria-label={`Remove ${product.displayName} from the order`}
                    >
                      Remove
                    </button>
                  ) : null
                ) : (
                  <span className={classes.stepper}>
                    <button
                      type="button"
                      className={classes.step}
                      disabled={!inCart}
                      onClick={onDecrement}
                      aria-label={`One fewer ${product.displayName}`}
                    >
                      <MinusIcon size={15} />
                    </button>
                    <input
                      className={classes.input}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      placeholder="0"
                      aria-label={`${product.displayName} quantity`}
                      value={draft}
                      onChange={(e) => setDraft(e.currentTarget.value.replace(/\D/g, ''))}
                      onBlur={commitDraft}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                    <button
                      type="button"
                      className={classes.step}
                      disabled={atCeiling}
                      onClick={onIncrement}
                      aria-label={`One more ${product.displayName}`}
                    >
                      <PlusIcon size={15} />
                    </button>
                  </span>
                )}
              </td>
            </>
          ) : null}
        </tr>
      </tbody>

      {ladderOpen ? (
        <TierLadder
          id={ladderId}
          product={product}
          quantity={quantity}
          band={band}
          inCart={inCart}
          groupEnd={groupEnd}
          ordering={ordering}
        />
      ) : null}
    </>
  );
}
