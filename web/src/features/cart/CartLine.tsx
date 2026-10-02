import { useEffect, useState } from 'react';
import { useSettings } from '@/app/settings.ts';
import { formatMoney } from '@/lib/format.ts';
import { lineFigures } from '@/lib/promotions.ts';
import { PromoBadge } from '@/features/catalog/PromoBadge.tsx';
import { ProductImage } from '@/features/catalog/ProductImage.tsx';
import { MinusIcon, PlusIcon } from '@/components/icons.tsx';
import { rowAnim } from '@/lib/motion.ts';
import type { LocalLine } from '@/stores/cart.ts';
import type { ServerCartLine } from '@/types/cart.ts';
import classes from '@/features/cart/CartLine.module.css';
import { useText } from '@/text/runtime.tsx';

export interface CartLineProps {
  line: LocalLine;
  /** The server's word on this line — flags a repriced, sold-out, withdrawn, or
   *  quantity-limit-violating product. */
  issue?: ServerCartLine;
  /** The server's line while it still matches this one: where the promotion discount and label come from. */
  server?: ServerCartLine;
  onQuantity: (productId: number, quantity: number) => void;
  onRemove: (productId: number) => void;
  /** Position in the docket, for the entrance stagger. */
  index?: number;
}

/**
 * One line of the docket: what it is, what it costs at the quantity on order,
 * and the two controls that change it. The unit price is quoted at the current
 * quantity — cross a bulk break and the base price strikes through beside it,
 * so the saving shows where the decision is made rather than in the total.
 *
 * The field never takes the line below one. Emptying it is how you retype a
 * quantity, not how you delete a line — Remove is the only thing that does that.
 */
export function CartLine({ line, issue, server, onQuantity, onRemove, index = 0 }: CartLineProps) {
  const { t } = useText();
  const { currency } = useSettings();
  const [draft, setDraft] = useState(String(line.quantity));
  useEffect(() => setDraft(String(line.quantity)), [line.quantity]);

  const withdrawn = issue?.inactive ?? false;
  const discounted = line.unitPrice < line.basePrice;
  const total = line.unitPrice * line.quantity;
  // A promotion's discount is the server's figure, struck against the line total it was taken from —
  // never re-derived here. Until the reconcile lands `server` is absent and the line reads as before.
  const promo = lineFigures(total, server?.promotionDiscount);

  // The server's resolved limits ride along on `issue` whenever the line has
  // any flag at all (not only a quantity one), so a repriced or out-of-stock
  // line still clamps correctly. A clean line carries no `issue` and so no
  // limit info — the stepper can't preemptively know a bound it hasn't been
  // told yet, and relies on the next server round trip to flag it.
  const minBound = issue?.minOrderQuantity ?? 1;
  const maxBound = issue?.maxOrderQuantity ?? null;

  const type = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setDraft(digits);
    const next = parseInt(digits, 10);
    if (Number.isFinite(next) && next >= 1) onQuantity(line.productId, next);
  };

  const removeButton = (
    <button
      type="button"
      className={classes.remove}
      onClick={() => onRemove(line.productId)}
      aria-label={t('common.qty.remove', { name: line.displayName })}
    >
      {t('cart.line.removeButton')}
    </button>
  );

  return (
    <li
      className={`${classes.line} ${line.imageProductId === null ? classes.lineNoImage : ''} ${withdrawn ? classes.withdrawn : ''} ${rowAnim(index).className}`}
      style={rowAnim(index).style}
    >
      {line.imageProductId !== null ? (
        <ProductImage
          productId={line.imageProductId}
          variant="thumbnail"
          alt=""
          className={classes.thumb}
        />
      ) : null}

      <span className={classes.name}>{line.displayName}</span>

      {promo.discounted ? (
        <span className={`${classes.total} ${classes.totalPromo}`}>
          <s className={classes.totalWas}>{formatMoney(total, currency)}</s>
          <span className={promo.free ? classes.free : undefined}>
            {promo.free ? t('common.promo.free') : formatMoney(promo.net, currency)}
          </span>
        </span>
      ) : (
        <span className={classes.total}>{formatMoney(total, currency)}</span>
      )}

      <span className={classes.meta}>
        {discounted ? (
          <span className={classes.was}>{formatMoney(line.basePrice, currency)}</span>
        ) : null}
        <span className={classes.unit}>{formatMoney(line.unitPrice, currency)}</span>
        <span className={classes.each}>{t('cart.line.perUnit')}</span>
        {promo.discounted ? <PromoBadge promotions={server?.promotions} /> : null}
        {line.isPreorder ? <span className={classes.preorder}>{t('common.product.preorder')}</span> : null}
        {issue?.priceChanged ? <span className={classes.chip}>{t('cart.line.priceUpdated')}</span> : null}
      </span>

      {withdrawn ? null : (
        <>
          <span className={classes.qty}>
            <button
              type="button"
              className={classes.step}
              disabled={line.quantity <= minBound}
              onClick={() => onQuantity(line.productId, line.quantity - 1)}
              aria-label={t('common.qty.fewer', { name: line.displayName })}
            >
              <MinusIcon size={15} />
            </button>
            <input
              className={classes.input}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              aria-label={t('cart.line.quantityLabel', { name: line.displayName })}
              value={draft}
              onChange={(e) => type(e.currentTarget.value)}
              onBlur={() => setDraft(String(line.quantity))}
            />
            <button
              type="button"
              className={classes.step}
              disabled={maxBound !== null && line.quantity >= maxBound}
              onClick={() => onQuantity(line.productId, line.quantity + 1)}
              aria-label={t('common.qty.more', { name: line.displayName })}
            >
              <PlusIcon size={15} />
            </button>
          </span>

          <span className={classes.removeSlot}>{removeButton}</span>
        </>
      )}

      {issue?.inactive ? (
        <span className={`${classes.note} ${classes.gone}`}>
          <span className={classes.noteText}>{t('cart.line.unavailable')}</span>
          {removeButton}
        </span>
      ) : issue && issue.belowMin && issue.minOrderQuantity != null ? (
        <span className={`${classes.note} ${classes.short}`}>
          <span className={classes.noteText}>{t('cart.line.minimum', { count: issue.minOrderQuantity })}</span>
          <button
            type="button"
            className={classes.fix}
            onClick={() => onQuantity(line.productId, issue.minOrderQuantity as number)}
          >
            {t('cart.line.setTo', { count: issue.minOrderQuantity })}
          </button>
        </span>
      ) : issue && issue.aboveMax && issue.maxOrderQuantity != null ? (
        <span className={`${classes.note} ${classes.short}`}>
          <span className={classes.noteText}>{t('cart.line.maximum', { count: issue.maxOrderQuantity })}</span>
          <button
            type="button"
            className={classes.fix}
            onClick={() => onQuantity(line.productId, issue.maxOrderQuantity as number)}
          >
            {t('cart.line.setTo', { count: issue.maxOrderQuantity })}
          </button>
        </span>
      ) : issue?.outOfStock ? (
        <span className={`${classes.note} ${classes.short}`}>
          <span className={classes.noteText}>{t('common.product.outOfStock')}</span>
        </span>
      ) : null}
    </li>
  );
}
