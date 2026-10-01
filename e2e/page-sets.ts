import type { ComponentData, PageSet, PuckDoc } from '../web/src/builder/types.ts';
import type { Layout } from './mocks.ts';

/** Sparse props on purpose: the guard fills every missing field from the block's defaults. */
const c = (type: string, props: Record<string, unknown> = {}, id = `${type}-e2e`): ComponentData => ({ type, props: { id, ...props } });
const doc = (content: ComponentData[], title = '', chrome: 'shell' | 'none' = 'shell'): PuckDoc => ({ root: { props: { title, description: '', chrome } }, content });

const listBlock = (layout: Layout) => (layout === 'storefront' ? c('ProductGrid') : c('ProductList'));

type NavItem = { label: string; href: string };
const STORY_LINK: NavItem = { label: 'Our story', href: '/pages/our-story' };

function shell(layout: Layout, footer: ComponentData | null, navItems: NavItem[] = [STORY_LINK], extra: ComponentData[] = [], header: Record<string, unknown> = {}): PuckDoc {
  const nav = c('NavLinks', { ariaLabel: 'Site', direction: 'row', items: navItems });
  return doc([
    c('Header', { nav: [nav], ...header }),
    c('NoticeBanners'),
    c('CutoffBar'),
    c('PageOutlet'),
    ...(layout !== 'webapp' && footer ? [footer] : []),
    ...(layout === 'menu' ? [c('ContactStrip')] : []),
    ...extra,
  ]);
}

const STORY = doc([
  c('Heading', { text: 'Our story', level: 'h2' }),
  c('RichText', { bodyHtml: '<p>Northbound Supply started in a shed with one oven.</p>' }),
  c('Button', { label: 'Back to the shop', href: '/' }),
], 'Our story · Northbound Supply');

/** Content above the (re-ordered) list, a custom page, and a nav link to it. */
export function storySet(layout: Layout): PageSet {
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer')),
    pages: {
      catalog: doc([
        c('Section', { padding: 'md', backgroundToken: 'surface', content: [
          c('Heading', { text: 'Small batches, shipped fast' }, 'hero-heading'),
          c('RichText', { bodyHtml: '<p>Packed to order at Northbound Supply.</p>' }, 'hero-text'),
        ] }),
        c('CatalogHero', { variant: 'custom', title: 'Fresh this week', bodyHtml: '<p>Rolled and bottled on Monday.</p>' }),
        listBlock(layout),
      ]),
      'page:our-story': STORY,
    },
  };
}

export const IMAGE = `/media/storefront-pages/media/${'a'.repeat(32)}.png`;

/** Every content block (plus nav + composed footer) on the catalogue page. */
export function everyBlockSet(layout: Layout): PageSet {
  const footer = c('Footer', {
    variant: 'columns', columns: '2', colophon: true,
    col1: [c('NavLinks', { ariaLabel: 'Shop', direction: 'column', items: [{ label: 'All products', href: '/' }] }, 'f1')],
    col2: [c('NavLinks', { ariaLabel: 'Help', direction: 'column', items: [{ label: 'Track an order', href: '/tracking' }] }, 'f2')],
  });
  return {
    schemaVersion: 1,
    shell: shell(layout, footer),
    pages: {
      catalog: doc([
        c('Heading', { text: 'This week at Northbound Supply', eyebrow: 'New in' }),
        c('RichText', { bodyHtml: '<p>Everything is packed to order. <a href="/pages/our-story">Read our story</a>.</p>' }),
        c('Image', { src: IMAGE, alt: 'Oats in a jar', caption: 'Trail oats, freshly rolled', width: 'rail', aspect: '16/9' }),
        c('Button', { label: 'Shop the pantry', href: '/c/concentrates', variant: 'filled', align: 'stretch' }),
        c('Columns', { columns: '3', stackBelow: 'md', col1: [c('Heading', { text: 'Fast', level: 'h3' }, 'k1')], col2: [c('Heading', { text: 'Fresh', level: 'h3' }, 'k2')], col3: [c('Heading', { text: 'Fair', level: 'h3' }, 'k3')] }),
        c('Section', { backgroundToken: 'surface-2', width: 'full', content: [c('Testimonial', { quote: 'Arrived the next morning, packed like it mattered.', author: 'Sam', detail: 'Leeds' }, 't1')] }),
        c('Spacer', { size: 'sm' }),
        c('Divider', { toneToken: 'line-strong' }),
        c('FAQ', { title: 'Questions', items: [{ question: 'How fast do you ship?', answerHtml: '<p>Same working day.</p>' }, { question: 'Can I collect?', answerHtml: '<p>Not yet.</p>' }] }),
        c('Video', { provider: 'youtube', videoId: 'aB3_dE-fG9h', title: 'How we pack' }),
        c('FeaturedProducts', { title: 'Staff picks', source: 'picked', items: [{ productId: 101 }, { productId: 102 }] }),
        listBlock(layout),
      ]),
      'page:our-story': STORY,
    },
  };
}

/** A checkout document missing its CheckoutFlow — must fall back to the default. */
export function checkoutWithoutFlowSet(layout: Layout = 'storefront'): PageSet {
  return { schemaVersion: 1, shell: shell(layout, c('Footer')), pages: { checkout: doc([c('Heading', { text: 'Almost there' })]) } };
}

/** Header links enough to overflow a phone's header row, so the row must scroll inside itself. */
export const MANY_LINKS: NavItem[] = [
  STORY_LINK,
  { label: 'Layout lab', href: '/pages/layout-lab' },
  { label: 'Track an order', href: '/tracking' },
  { label: 'Concentrates', href: '/c/concentrates' },
  { label: 'Capsules', href: '/c/capsules' },
  { label: 'Verify a unit', href: '/verify' },
];

export const LONG_LABEL = 'Browse every small-batch extract we packed this week';

/**
 * Carried mobile checks: full-bleed Section nested in Columns and in another Section, a
 * full-bleed Image in a Columns cell, a standalone CategoryNav, a long Button label — on a
 * custom page — and a header nav row with more links than a phone can show.
 */
export function layoutLabSet(layout: Layout): PageSet {
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer'), MANY_LINKS),
    pages: {
      'page:layout-lab': doc([
        c('CategoryNav', {}, 'lab-cats'),
        c('Columns', { columns: '2', stackBelow: 'sm', col1: [
          c('Section', { width: 'full', backgroundToken: 'surface-2', content: [c('Heading', { text: 'Bleed in a column', level: 'h3' }, 'lab-h1')] }, 'lab-sec-in-col'),
        ], col2: [
          c('Image', { src: IMAGE, alt: 'Jars on a shelf', width: 'full', aspect: '4/3' }, 'lab-img-in-col'),
        ] }, 'lab-cols'),
        c('Section', { width: 'rail', backgroundToken: 'surface', content: [
          c('Section', { width: 'full', backgroundToken: 'surface-2', content: [c('Heading', { text: 'Bleed in a section', level: 'h3' }, 'lab-h2')] }, 'lab-sec-in-sec'),
        ] }, 'lab-outer'),
        c('Button', { label: LONG_LABEL, href: '/', align: 'start' }, 'lab-long-button'),
      ], 'Layout lab · Northbound Supply'),
    },
  };
}

/** A shell with a block that may appear at most once, twice: the guard refuses it and the default shell renders. */
export function doubledShellSet(layout: Layout, type: 'Header' | 'MobileCartBar'): PageSet {
  const extra = type === 'Header'
    ? [c('Header', {}, 'second-header')]
    : [c('MobileCartBar', {}, 'bar-1'), c('MobileCartBar', {}, 'bar-2')];
  return { schemaVersion: 1, shell: shell(layout, c('Footer'), [STORY_LINK], extra), pages: {} };
}

// ---- block styling (spec 2026-09-30-block-styling §12) ---------------------------------------

/** Every key at its largest that the block accepts. */
const MAX_BOX = { padX: 'xl', marginTop: 'xl', marginBottom: 'xl', border: 'thick', borderColor: 'primary', borderStyle: 'dashed', radius: 'pill', shadow: 'raised' };
const MAX_SECTION = { ...MAX_BOX, textSize: 'xl', align: 'end' };
const MAX_FULL = { bg: 'surface', fg: 'text', padTop: 'xl', padBottom: 'xl', ...MAX_BOX, textSize: 'xl', align: 'end', maxWidth: 'wide' };
const MAX_HEADING = { bg: 'surface-2', fg: 'text', padTop: 'xl', padBottom: 'xl', ...MAX_BOX, textSize: 'xl', maxWidth: 'wide' };
const MAX_FLOW = { bg: 'surface', padTop: 'xl', padBottom: 'xl', ...MAX_BOX, maxWidth: 'wide' };

export function styledCatalogSet(layout: Layout): PageSet {
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer')),
    pages: {
      catalog: doc([
        c('Heading', { text: 'Styled heading', level: 'h2', blockStyle: { bg: 'surface-2', padTop: 'lg', border: 'thin', borderColor: 'primary', radius: 'card', textSize: 'lg' } }, 'styled-heading'),
        c('Heading', { text: 'Plain heading', level: 'h2' }, 'plain-heading'),
        c('Section', { content: [c('Heading', { text: 'Only from 992 px' }, 'desk-h')], blockStyle: { hide: 'mobile' } }, 'hide-mobile'),
        c('Section', { content: [c('Heading', { text: 'Only below 992 px' }, 'phone-h')], blockStyle: { hide: 'desktop' } }, 'hide-desktop'),
        c('Upsells', { blockStyle: { bg: 'surface', padTop: 'xl', padBottom: 'xl', border: 'thick' } }, 'empty-upsells'),
        listBlock(layout),
      ]),
    },
  };
}

export function styledHeaderSet(layout: Layout): PageSet {
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer'), [STORY_LINK], [], { blockStyle: { bg: 'surface-3', shadow: 'raised' } }),
    pages: { catalog: doc([...Array.from({ length: 12 }, (_, i) => c('Spacer', { size: 'xl' }, `sp-${i}`)), listBlock(layout)]) },
  };
}

/** A Header hidden below 62em over a long catalogue: nothing is left to stick under on a phone. */
export function hiddenHeaderSet(layout: Layout): PageSet {
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer'), [STORY_LINK], [], { blockStyle: { hide: 'mobile' } }),
    pages: { catalog: doc([c('Spacer', { size: 'xl' }, 'sp-0'), listBlock(layout)]) },
  };
}

/** The trade list with a background: its cart bar must still meet both screen edges. */
export function styledWholesaleSet(layout: Layout): PageSet {
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer')),
    pages: { catalog: doc([c('WholesaleTable', { blockStyle: { bg: 'surface-2', padTop: 'sm' } }, 'styled-trade')]) },
  };
}

export function styledFlowSet(layout: Layout): PageSet {
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer')),
    pages: {
      checkout: doc([c('CheckoutFlow', { blockStyle: { bg: 'surface', padTop: 'md', padBottom: 'md', padX: 'sm', border: 'thin', radius: 'card' } }, 'styled-flow')]),
      cart: doc([c('CartContents', { summary: [c('CartSummary', { blockStyle: { bg: 'surface-2', padTop: 'sm', border: 'thin' } }, 'styled-summary')], blockStyle: { padTop: 'md', border: 'thin' } }, 'styled-lines')]),
    },
  };
}

/** Section › Columns › Section › Heading, every key at its largest, plus a styled flow. */
export function maximumStyleSet(layout: Layout): PageSet {
  const nest = (id: string) => c('Section', { blockStyle: MAX_SECTION, content: [
    c('Columns', { columns: '2', stackBelow: 'md', blockStyle: MAX_FULL, col1: [
      c('Section', { width: 'full', backgroundToken: 'surface-2', blockStyle: MAX_SECTION, content: [c('Heading', { text: 'Deep and wide', blockStyle: MAX_HEADING }, `${id}-h`)] }, `${id}-inner`),
    ], col2: [c('RichText', { bodyHtml: `<p>${LONG_LABEL}</p>`, blockStyle: { ...MAX_FULL, maxWidth: undefined } }, `${id}-rt`)] }, `${id}-cols`),
  ] }, `${id}-outer`);
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer')),
    pages: {
      catalog: doc([nest('cat'), listBlock(layout)]),
      checkout: doc([nest('co'), c('CheckoutFlow', { blockStyle: MAX_FLOW }, 'max-flow')]),
    },
  };
}

/** The catalogue grid inside a hidden Section: must fall back to the default catalogue. */
export function hiddenGridSet(layout: Layout): PageSet {
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer')),
    pages: { catalog: doc([c('Section', { blockStyle: { hide: 'mobile' }, content: [listBlock(layout)] }, 'hidden-grid'), c('Heading', { text: 'Should not render' }, 'hg-h')]) },
  };
}

/** For the editor: a Heading hidden below 992 px and a locked ProductGrid with a known id. */
export function editorStyleSet(): PageSet {
  return {
    schemaVersion: 1,
    shell: shell('storefront', c('Footer')),
    pages: { catalog: doc([c('Heading', { text: 'Ghost heading', blockStyle: { hide: 'mobile' } }, 'ghost-h'), c('ProductGrid', {}, 'grid-1')]) },
  };
}

// ---- product parts and card designs (spec 2026-09-30-product-parts) ----------------------------

const p = (type: string, id = `${type}-e2e`, props: Record<string, unknown> = {}) => c(type, props, id);
const g = (kind: string, items: ComponentData[], type = 'ProductGroup', id = `${type}-${kind}-e2e`) => c(type, { kind, items }, id);

/** Description above the price, a RichText between add to cart and bulk pricing, upsells removed. */
export function productPartsSet(layout: Layout): PageSet {
  return { schemaVersion: 1, shell: shell(layout, c('Footer')), pages: { product: doc([c('ProductDetail', {
    top: [p('ProductBreadcrumbs')], media: [p('ProductGallery')],
    main: [p('ProductTitle'), p('ProductDescription'), g('priceRow', [p('ProductPrice'), p('ProductStock')]), p('ProductAddToCart'),
      c('RichText', { bodyHtml: '<p>Packed to order at Northbound Supply.</p>' }, 'between-rt'), p('ProductBulkPricing'), p('ProductProvenance'), p('ProductAsk')],
    below: [],
  }, 'pd-e2e')]) } };
}
/** A product document without the add button: must render the default page. */
export function productWithoutAddSet(): PageSet {
  const set = productPartsSet('storefront');
  const pd = set.pages.product!.content[0]!;
  const main = (pd.props.main as ComponentData[]).filter((x) => x.type !== 'ProductAddToCart');
  return { ...set, pages: { product: doc([{ ...pd, props: { ...pd.props, main } }]) } };
}
/** The menu sheet with bulk pricing first; the add button stays in the footer. */
export function menuSheetSet(layout: 'menu' | 'webapp' = 'menu'): PageSet {
  return { schemaVersion: 1, shell: shell(layout, c('Footer')), pages: { product: doc([c('ProductDetail', {
    top: [], media: [], below: [p('ProductUpsells')],
    main: [p('ProductBulkPricing'), g('identity', [g('identityText', [p('ProductTitle'), p('ProductStock')]), p('ProductGallery')]), p('ProductPrice'), p('ProductDescription')],
  }, 'pd-sheet-e2e')]) } };
}
/** Search moved into main, rail removed (noNav). */
export function gridArrangedSet(): PageSet {
  return { schemaVersion: 1, shell: shell('storefront', c('Footer')), pages: { catalog: doc([c('ProductGrid', {
    top: [p('CatalogIntro')], rail: [], main: [p('CatalogSearch'), p('CatalogTitle'), p('CatalogEmpty'), p('CatalogResults')],
  }, 'grid-arr-e2e')]) } };
}
export function listNoIntroSet(layout: 'menu' | 'webapp' = 'menu'): PageSet {
  return { schemaVersion: 1, shell: shell(layout, c('Footer')), pages: { catalog: doc([c('ProductList', {
    content: [p('CatalogTitle'), p('CatalogEmpty'), p('CatalogResults')] }, 'list-e2e')]) } };
}
/** Price above name, flags removed; used by the grid, FeaturedProducts on a custom page and page upsells. */
export function tileDesignSet(layout: Layout): PageSet {
  const tile = doc([c('CardTile', { content: [p('CardTileImage', 't-img'), g('body', [
    p('CardTilePrice', 't-price'), p('CardTileName', 't-name'), g('foot', [p('CardTileAdd', 't-add')], 'CardTileGroup', 't-foot'),
  ], 'CardTileGroup', 't-body')] }, 'tile-e2e')]);
  const base = storySet(layout);
  return { ...base, pages: { ...base.pages,
    'page:featured': doc([c('FeaturedProducts', { title: 'Featured', source: 'picked', items: [{ productId: 101 }, { productId: 102 }] }, 'feat-e2e')], 'Featured · Northbound Supply') },
    cards: { tile } };
}
/** A row design (price first) for the list and the sheet's upsells. */
export function rowDesignSet(layout: 'menu' | 'webapp' = 'menu'): PageSet {
  const row = doc([c('CardRow', { content: [p('CardRowPrice', 'r-price'), g('text', [p('CardRowName', 'r-name')], 'CardRowGroup', 'r-text'), p('CardRowAdd', 'r-add')] }, 'row-e2e')]);
  return { schemaVersion: 1, shell: shell(layout, c('Footer')), pages: {}, cards: { row } };
}
/** Add button without price: must fall back to the built-in card. */
export function brokenTileSet(layout: Layout): PageSet {
  const tile = doc([c('CardTile', { content: [p('CardTileName', 'b-name'), p('CardTileAdd', 'b-add')] }, 'tile-broken-e2e')]);
  return { schemaVersion: 1, shell: shell(layout, c('Footer')), pages: {}, cards: { tile } };
}
/** A v0.7.0-shaped product document: no slots, gallery off, upsells off. */
export function legacyProductSet(): PageSet {
  return { schemaVersion: 1, shell: shell('storefront', c('Footer')), pages: { product: doc([c('ProductDetail', { gallery: false, upsells: false }, 'pd-legacy')]) } };
}

/** The catalogue page as a published document of just the container: the guard fills every default. */
export function catalogDefaultSet(layout: Layout): PageSet {
  return { schemaVersion: 1, shell: shell(layout, c('Footer')), pages: { catalog: doc([listBlock(layout)]) } };
}

// ---- shell, cart and account parts (spec 2026-09-30-shell-cart-account-parts) -------------------

const RT = (html: string, id: string) => c('RichText', { bodyHtml: html }, id);

/** The shell's notice banners, cutoff bar and footer, around a given Header (stage-4 arrangements). */
function shellWith(layout: Layout, header: ComponentData, footer: ComponentData | null = c('Footer')): PageSet {
  return {
    schemaVersion: 1,
    shell: doc([
      header,
      c('NoticeBanners'),
      c('CutoffBar'),
      c('PageOutlet'),
      ...(layout !== 'webapp' && footer ? [footer] : []),
      ...(layout === 'menu' ? [c('ContactStrip')] : []),
    ]),
    pages: {},
  };
}
const navLinks = () => c('NavLinks', { ariaLabel: 'Site', direction: 'row', items: [STORY_LINK] }, 'nav-1');

/** Cart first, then the brand; no search; a NavLinks in `nav` between the brand and the account icon. */
export function arrangedShell(layout: Layout, header: Record<string, unknown> = {}): PageSet {
  const filter = layout === 'storefront' ? [] : [p('HeaderFilter')];
  return shellWith(layout, c('Header', {
    start: [...(layout === 'webapp' ? [p('HeaderBack')] : []), p('HeaderCart'), p('HeaderBrand')],
    nav: [navLinks()], middle: [], end: [...filter, p('HeaderAccount')], ...header,
  }, 'hdr-arranged'));
}
/** The default arrangement written out in full, as a published stage-4 document keeps it. */
export function defaultShellSet(layout: Layout, header: Record<string, unknown> = {}): PageSet {
  return shellWith(layout, c('Header', {
    start: [...(layout === 'webapp' ? [p('HeaderBack')] : []), p('HeaderBrand')],
    nav: [navLinks()], middle: [p('HeaderSearch')],
    end: [...(layout === 'storefront' ? [] : [p('HeaderFilter')]), p('HeaderAccount'), p('HeaderCart')], ...header,
  }, 'hdr-default'));
}
/** A Header whose slots lack the brand: the guard falls back to the default shell. */
export function brandlessShellSet(layout: Layout): PageSet {
  return shellWith(layout, c('Header', { start: [], nav: [], middle: [p('HeaderSearch')], end: [p('HeaderCart')] }, 'hdr-brandless'));
}
/** A v0.7.0 header: no slots, the three display options (`search`, `accountIcon`, `cartIcon`) as props. */
export function v070Shell(layout: Layout, header: Record<string, unknown> = { search: false, cartIcon: 'hide' }): PageSet {
  return { schemaVersion: 1, shell: shell(layout, c('Footer'), [STORY_LINK], [], header), pages: {} };
}

/**
 * Summary above the lines (a CartSummary beside the container), a RichText after the lines. With
 * `summaryAbove` off the summary stays in CartContents' own `summary` slot (the v0.7.0 place).
 */
export function arrangedCart(layout: Layout = 'storefront', summaryAbove = true): PageSet {
  const summary = c('CartSummary', { items: [p('CartSummarySubtotal'), p('CartSummaryCheckout'), p('CartSummaryContinue')] }, 'sum-above');
  const contents = c('CartContents', {
    head: [p('CartHeading')], main: [p('CartEmpty'), p('CartLines'), RT('<p>Packed in recycled paper.</p>', 'cart-note')], summary: summaryAbove ? [] : [summary],
  }, 'CartContents-e2e');
  return { schemaVersion: 1, shell: shell(layout, c('Footer')), pages: { cart: doc(summaryAbove ? [summary, contents] : [contents]) } };
}
/** A cart document with no checkout part anywhere: the guard falls back to the default cart. */
export function cartWithoutCheckoutSet(layout: Layout = 'storefront'): PageSet {
  const summary = c('CartSummary', { items: [p('CartSummarySubtotal')] }, 'sum-nocheckout');
  const contents = c('CartContents', { head: [p('CartHeading')], main: [p('CartEmpty'), p('CartLines')], summary: [summary] }, 'cart-nocheckout');
  return { schemaVersion: 1, shell: shell(layout, c('Footer')), pages: { cart: doc([contents]) } };
}
/** A v0.7.0 cart document: no slots, and the CartSummary beside CartContents instead of inside it. */
export function v070CartOutsideSummary(layout: Layout = 'storefront'): PageSet {
  return { schemaVersion: 1, shell: shell(layout, c('Footer')), pages: { cart: doc([c('CartContents', {}, 'cart-v070'), c('CartSummary', {}, 'sum-v070')]) } };
}

/** Tabs above the greeting; the order detail with parcels before items; loyalty and profile as built. */
export function arrangedAccountSet(layout: Layout = 'storefront'): PageSet {
  const head = () => [p('AccountTabs'), p('AccountGreeting')];
  const section = (type: string, props: Record<string, unknown>, id: string) => doc([c('AccountNav', { head: head(), body: [c(type, props, id)] }, 'acct')]);
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer')),
    pages: {
      'account.orders': section('OrdersList', { content: [p('OrdersHeading'), p('OrdersRows'), p('OrdersMore'), p('OrdersEmpty')] }, 'orders-arr'),
      'account.order': section('OrderDetail', {
        content: [p('OrderBackLink'), p('OrderHeading'), p('OrderBalance'), p('OrderParcels'), p('OrderItems'), p('OrderPayments'), p('OrderPageLink')],
      }, 'order-arr'),
      'account.loyalty': section('Loyalty', { content: [p('LoyaltyPoints'), p('LoyaltyCredit'), p('LoyaltyNoPoints'), p('LoyaltyRewards')] }, 'loyalty-arr'),
      'account.profile': section('Profile', { content: [p('ProfileDetails'), p('ProfileContact'), p('ProfileBotSwitch'), p('ProfileSignOut')] }, 'profile-arr'),
    },
  };
}

/** The sign-in heading below the ways in; payment, tracking and verify pages rearranged one move each. */
export function arrangedFlowsSet(layout: Layout = 'storefront'): PageSet {
  return {
    schemaVersion: 1,
    shell: shell(layout, c('Footer')),
    pages: {
      login: doc([c('LoginOptions', { content: [p('LoginMethods'), p('LoginHeading')] }, 'login-arr')]),
      'payment-success': doc([c('PaymentSuccess', {
        content: [p('PaymentMark'), p('PaymentEyebrow'), p('PaymentHeadline'), p('PaymentMessage'), p('PaymentReference'), p('PaymentBack')],
      }, 'ps-arr')]),
      'payment-cancel': doc([c('PaymentCancel', {
        content: [p('PaymentMark'), p('PaymentEyebrow'), p('PaymentHeadline'), p('PaymentMessage'), p('PaymentReference'), p('PaymentActions'), p('PaymentContact'), p('PaymentBack')],
      }, 'pc-arr')]),
      'order-placed': doc([c('OrderPlaced', {
        content: [p('PaymentMark'), p('PaymentEyebrow'), p('PaymentReference'), p('PaymentHeadline'), p('PaymentMessage'), p('PaymentActions'), p('PaymentBack')],
      }, 'op-arr')]),
      tracking: doc([c('TrackingLookup', {
        top: [p('TrackingIntro')], main: [p('TrackingState'), p('TrackingForm')],
        result: [RT('<p>Parcels leave the Northbound Supply bench daily.</p>', 'trk-note'), p('TrackingHero'), p('TrackingProgress'), p('TrackingNotice'), p('TrackingParcels')],
      }, 'trk-arr')]),
      verify: doc([c('VerifyForm', { content: [p('VerifyBack'), p('VerifyIntro'), p('VerifyFields'), p('VerifyResult')] }, 'ver-arr')]),
    },
  };
}

/** Every page above arranged in one set, for the 360 px overflow sweep. */
export function arrangedEverythingSet(layout: Layout = 'storefront'): PageSet {
  return {
    schemaVersion: 1,
    shell: arrangedShell(layout).shell,
    pages: { ...arrangedCart(layout).pages, ...arrangedAccountSet(layout).pages, ...arrangedFlowsSet(layout).pages },
  };
}

// ---- checkout and order-status parts (spec 2026-09-30-checkout-parts) ----------------------------

export type StepKind = 'contact' | 'address' | 'shipping' | 'payment' | 'review';
export const STEP_TYPES: Record<StepKind, string> = {
  contact: 'CheckoutContact', address: 'CheckoutAddress', shipping: 'CheckoutShipping', payment: 'CheckoutPayment', review: 'CheckoutReview',
};
/** The four legal step orders (Delivery needs the address first, Payment follows Delivery, Review is last). */
export const LEGAL_STEP_ORDERS: StepKind[][] = [
  ['contact', 'address', 'shipping', 'payment', 'review'],
  ['address', 'contact', 'shipping', 'payment', 'review'],
  ['address', 'shipping', 'contact', 'payment', 'review'],
  ['address', 'shipping', 'payment', 'contact', 'review'],
];
export const SHIPS_NOTE = 'Orders ship from Northbound within one working day';

interface CheckoutShape {
  order?: StepKind[];
  /** Where the coupon sits: Delivery's after slot (the default), the aside, nowhere, or (illegally) in Contact. */
  coupon?: 'shipping.after' | 'aside' | 'aside-columns' | 'none' | 'contact.before';
  /** Where the notes sit: Review's after slot (the default), Payment's, or nowhere. */
  notes?: 'review.after' | 'payment.after' | 'none';
  /** Content blocks: a RichText before the Delivery fields and a Heading after them. */
  content?: boolean;
  progress?: 'default' | 'hide-mobile' | 'none';
  summary?: boolean;
}

/** A published checkout document, every slot written out the way the editor saves one. */
function checkoutDoc(shape: CheckoutShape = {}): PuckDoc {
  const order = shape.order ?? LEGAL_STEP_ORDERS[0]!;
  const coupon = shape.coupon ?? 'shipping.after';
  const notes = shape.notes ?? 'review.after';
  const couponPart = () => c('CheckoutCoupon', {}, 'CheckoutCoupon-e2e');
  const notesPart = () => c('CheckoutNotes', {}, 'CheckoutNotes-e2e');
  const slotsOf = (kind: StepKind) => {
    const before: ComponentData[] = [];
    const after: ComponentData[] = [];
    if (kind === 'shipping') {
      if (shape.content) {
        before.push(RT('<p>' + SHIPS_NOTE + '</p>', 'ships-rt'));
        after.push(c('Heading', { text: 'Tracked and insured', level: 'h3' }, 'ships-h'));
      }
      if (coupon === 'shipping.after') after.push(couponPart());
    }
    if (kind === 'contact' && coupon === 'contact.before') before.push(couponPart());
    if (kind === 'payment' && notes === 'payment.after') after.push(notesPart());
    if (kind === 'review' && notes === 'review.after') after.push(notesPart());
    return { before, after };
  };
  const steps = order.map((k) => c(STEP_TYPES[k], slotsOf(k), STEP_TYPES[k] + '-e2e'));
  const progress = shape.progress === 'none' ? []
    : [c('CheckoutProgress', shape.progress === 'hide-mobile' ? { blockStyle: { hide: 'mobile' } } : {}, 'CheckoutProgress-e2e')];
  return doc([c('CheckoutFlow', {
    head: [c('CheckoutHeading', {}, 'CheckoutHeading-e2e')],
    lead: progress,
    steps,
    after: [],
    aside: [
      ...(shape.summary === false ? [] : [c('CheckoutSummary', {}, 'CheckoutSummary-e2e')]),
      ...(coupon === 'aside' ? [couponPart()] : []),
      ...(coupon === 'aside-columns' ? [c('Columns', { columns: '2', stackBelow: 'sm', col1: [couponPart()], col2: [] }, 'coupon-columns')] : []),
    ],
  }, 'CheckoutFlow-e2e')]);
}

const checkoutPages = (layout: Layout, d: PuckDoc): PageSet => ({ schemaVersion: 1, shell: shell(layout, c('Footer')), pages: { checkout: d } });

/** The checkout as v0.7.0 drew it, written out as parts: nothing moved. */
export function defaultCheckoutSet(layout: Layout): PageSet {
  return checkoutPages(layout, checkoutDoc());
}

/**
 * Address first, then Contact; the coupon in the aside; the notes at the end of Payment; a RichText
 * and a Heading around the Delivery fields; the progress bar hidden below 992 px.
 */
export function arrangedCheckoutSet(layout: Layout, order: StepKind[] = LEGAL_STEP_ORDERS[1]!): PageSet {
  return checkoutPages(layout, checkoutDoc({ order, coupon: 'aside', notes: 'payment.after', content: true, progress: 'hide-mobile' }));
}

/** The coupon inside a Columns in the aside (legal there); the editor drags that Columns into a step. */
export function columnsCouponCheckoutSet(layout: Layout): PageSet {
  return checkoutPages(layout, checkoutDoc({ coupon: 'aside-columns' }));
}

/** A checkout document the guard refuses: the default checkout renders instead. */
export type IllegalCheckout = 'payment-before-shipping' | 'contact-after-review' | 'coupon-in-contact' | 'no-summary';
export function illegalCheckoutSet(layout: Layout, kind: IllegalCheckout): PageSet {
  switch (kind) {
    case 'payment-before-shipping': return checkoutPages(layout, checkoutDoc({ order: ['contact', 'address', 'payment', 'shipping', 'review'] }));
    case 'contact-after-review': return checkoutPages(layout, checkoutDoc({ order: ['address', 'shipping', 'payment', 'review', 'contact'] }));
    case 'coupon-in-contact': return checkoutPages(layout, checkoutDoc({ coupon: 'contact.before' }));
    case 'no-summary': return checkoutPages(layout, checkoutDoc({ summary: false }));
  }
}

/** The default arrangement with the coupon and the notes parts removed (`keep` puts either back). */
export function noCouponCheckoutSet(layout: Layout, keep: { coupon?: boolean; notes?: boolean } = {}): PageSet {
  return checkoutPages(layout, checkoutDoc({ coupon: keep.coupon ? 'shipping.after' : 'none', notes: keep.notes ? 'review.after' : 'none' }));
}

const osPart = (type: string) => c(type, {}, type + '-e2e');

function orderDoc(action: ComponentData[], summary: ComponentData[]): PuckDoc {
  return doc([c('OrderStatus', {
    top: [osPart('OrderStatusHero')], action, summary, bottom: [osPart('OrderStatusFooter')],
  }, 'OrderStatus-e2e')]);
}
const orderPages = (layout: Layout, d: PuckDoc): PageSet => ({ schemaVersion: 1, shell: shell(layout, c('Footer')), pages: { 'order-status': d } });

export const ORDER_NOTE = 'Parcels are packed by hand at Northbound Supply.';

/** The order page as v0.7.0 drew it, written out as parts. */
export function defaultOrderSet(layout: Layout): PageSet {
  return orderPages(layout, orderDoc(
    [osPart('OrderStatusPayment'), osPart('OrderStatusShipments')],
    [osPart('OrderStatusItems'), osPart('OrderStatusAddress')],
  ));
}

/** Items moved into the action column after Payment, a RichText between them, Address removed. */
export function arrangedOrderSet(layout: Layout): PageSet {
  return orderPages(layout, orderDoc(
    [osPart('OrderStatusPayment'), RT('<p>' + ORDER_NOTE + '</p>', 'order-rt'), osPart('OrderStatusItems'), osPart('OrderStatusShipments')],
    [],
  ));
}

/** Payment inside a Section, the only thing in the action column besides tracking; the summary holds Items and Address. */
export function sectionedPaymentOrderSet(layout: Layout): PageSet {
  return orderPages(layout, orderDoc(
    [c('Section', { padding: 'md', backgroundToken: 'surface', content: [osPart('OrderStatusPayment')] }, 'pay-section'), osPart('OrderStatusShipments')],
    [osPart('OrderStatusItems'), osPart('OrderStatusAddress')],
  ));
}

/** An order document the guard refuses: the default order page renders instead. */
export type IllegalOrder = 'shipments-first' | 'hidden-payment';
export function illegalOrderSet(layout: Layout, kind: IllegalOrder): PageSet {
  switch (kind) {
    case 'shipments-first':
      return orderPages(layout, orderDoc([osPart('OrderStatusShipments'), osPart('OrderStatusPayment')], [osPart('OrderStatusItems'), osPart('OrderStatusAddress')]));
    case 'hidden-payment':
      return orderPages(layout, orderDoc(
        [c('Section', { blockStyle: { hide: 'mobile' }, content: [osPart('OrderStatusPayment')] }, 'hidden-pay'), osPart('OrderStatusShipments')],
        [osPart('OrderStatusItems'), osPart('OrderStatusAddress')],
      ));
  }
}
