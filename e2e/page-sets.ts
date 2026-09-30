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
