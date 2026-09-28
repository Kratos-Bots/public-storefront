import { ContactLinks, useCutoffInfo, useOrderingState, type CatalogHeroProps } from '@/templates/contract.ts';
import { LayoutGridIcon, MessageCircleIcon, PackageIcon, StoreIcon, TruckIcon } from './icons.tsx';

const DAY_LABEL: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

/**
 * Grid: the shop board — a small bento of the shop's real facts. The tagline (or, without one,
 * the shop's name) takes the 2×2 hero cell; the product count is the one accent-filled cell;
 * categories, ordering status, the next dispatch cut-off and the chat links each get a cell only
 * when there is real data behind it. Cells never hold a primary action: the product grid below
 * and the cart bar own those. List/wholesale surfaces are dense — the welcome line only.
 */
export function BentoCatalogHero({ surface, brand, tagline, welcomeMessage, productCount, categoryCount, options }: CatalogHeroProps) {
  const { accepting } = useOrderingState();
  const { next } = useCutoffInfo();

  if (surface !== 'grid') {
    return welcomeMessage ? <p className="bento-welcome">{welcomeMessage}</p> : null;
  }

  // A welcome message can run to a paragraph, so it never becomes the display line: without a
  // tagline the shop's name heads the hero cell and the welcome sits beneath it.
  const headline = tagline.trim() || (welcomeMessage ? brand.name : '');
  const body = welcomeMessage;
  const showShip = options.dispatch === true && next !== null;
  const showTalk = options.contact === true && !!(brand.links.whatsapp || brand.links.telegram);
  const showCats = categoryCount > 0;
  // A lone cell in a pair stretches to fill its partner's place, so a missing fact never leaves a hole.
  const wideSingle = showShip !== showTalk;

  return (
    <section className="bento-board" aria-label="About this shop" data-sf-part="hero" data-hero={headline ? 'on' : 'off'}>
      {headline ? (
        <div className="bento-cell bento-cell--hero">
          <p className="bento-hero__headline">{headline}</p>
          {body ? <p className="bento-hero__body">{body}</p> : null}
        </div>
      ) : null}

      <div className="bento-cell bento-cell--stock">
        <PackageIcon />
        <p className="bento-stat">
          <span className="bento-stat__num">{productCount}</span>
          <span className="bento-stat__label">{productCount === 1 ? 'Product to browse' : 'Products to browse'}</span>
        </p>
      </div>

      {showCats ? (
        <div className="bento-cell bento-cell--small">
          <LayoutGridIcon />
          <p className="bento-fact">
            <span className="bento-fact__value">{categoryCount}</span>
            <span className="bento-fact__label">{categoryCount === 1 ? 'Category' : 'Categories'}</span>
          </p>
        </div>
      ) : null}

      <div className={`bento-cell bento-cell--small${showCats ? '' : ' bento-cell--tall'}`} data-state={accepting ? 'open' : 'paused'}>
        <StoreIcon />
        <p className="bento-fact">
          <span className="bento-fact__status">
            <span className="bento-dot" aria-hidden />
            {accepting ? 'Taking orders' : 'Ordering paused'}
          </span>
          <span className="bento-fact__label">{accepting ? 'Checkout is open' : 'Browse now, order later'}</span>
        </p>
      </div>

      {showShip ? (
        <div className={`bento-cell bento-cell--wide${wideSingle ? ' bento-cell--full' : ''}`}>
          <TruckIcon />
          <p className="bento-fact">
            <span className="bento-fact__headline">
              Order by <time dateTime={next.at.toISOString()}>{next.cutoff}</time>
              {next.isToday ? ' today' : ` ${DAY_LABEL[next.day] ?? next.day}`}
            </span>
            <span className="bento-fact__label">for {next.shipsOn} dispatch</span>
          </p>
        </div>
      ) : null}

      {showTalk ? (
        <div className={`bento-cell bento-cell--wide bento-cell--talk${wideSingle ? ' bento-cell--full' : ''}`}>
          <MessageCircleIcon />
          <div className="bento-fact">
            <span className="bento-fact__headline">Questions before you order?</span>
            <ContactLinks />
          </div>
        </div>
      ) : null}
    </section>
  );
}
