import { useMemo, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { useUiStore } from '@/stores/ui.ts';
import { Brand } from '@/components/Brand.tsx';
import { BagIcon, ChevronIcon, FilterIcon, UserIcon } from '@/components/icons.tsx';
import { NoticeBanners } from '@/features/notices/NoticeBanners.tsx';
import { isFirstHistoryEntry } from '@/features/webapp/useTelegramChrome.ts';
import { SearchField } from '@/layouts/SearchField.tsx';
import { useShellState } from '@/layouts/shell-context.ts';
import { isTelegramWebApp } from '@/lib/telegram-webapp.ts';
import { Slot } from '@/templates/runtime.tsx';
import { headerIconClass, useCoreOptions } from '@/templates/hooks.ts';
import { useText } from '@/text/runtime.tsx';
import { compactScope, iconOverride, type Override, type SlotRender, type StyleAttrs } from '@/builder/define.ts';
import { CoreOptionsScope } from '@/builder/blocks/_shared/CoreOptionsScope.tsx';
import { HeaderFamily, type HeaderData } from '@/builder/family-header.ts';
import { fixedSlot, type FamilyValue, type PartViewProps } from '@/builder/parts.ts';
import type { ComponentData } from '@/builder/types.ts';
import storefront from '@/layouts/StorefrontShell.module.css';
import menu from '@/layouts/MenuShell.module.css';
import webapp from '@/layouts/WebAppShell.module.css';

type Variant = HeaderData['variant'];

/** The container's own class names: the storefront module calls them `header` / `headerInner`. */
const CLASSES: Record<Variant, { bar: string; inner: string; actions: string; unstuck: string; safeTop?: string }> = {
  storefront: { bar: storefront.header!, inner: storefront.headerInner!, actions: storefront.actions!, unstuck: storefront.unstuck! },
  menu: { bar: menu.bar!, inner: menu.barInner!, actions: menu.actions!, unstuck: menu.unstuck! },
  webapp: { bar: webapp.bar!, inner: webapp.barInner!, actions: webapp.actions!, unstuck: webapp.unstuck!, safeTop: webapp.safeTop! },
};
const MODULES: Record<Variant, Readonly<Record<string, string>>> = { storefront, menu, webapp };

const onCatalogPath = (pathname: string) => pathname === '/' || pathname.startsWith('/c/');

// ── views (the v0.7.0 JSX of each piece, moved verbatim) ────────────────────

function BrandView({ styleAttrs }: PartViewProps) {
  const { variant, classes, brandName } = HeaderFamily.useData();
  const { t } = useText();
  return (
    <Link to="/" className={classes.home} aria-label={t('shell.header.homeAriaLabel', { shop: brandName })} {...styleAttrs}>
      <Brand size={variant === 'storefront' ? 'md' : 'sm'} />
    </Link>
  );
}

function BackView({ styleAttrs }: PartViewProps) {
  const { variant, classes, showBack, goBack } = HeaderFamily.useData();
  const { t } = useText();
  if (variant !== 'webapp' || !showBack) return null;
  return (
    <button
      type="button"
      className={`${classes.action} ${classes.back}`}
      onClick={goBack}
      aria-label={t('shell.webapp.back')}
      {...styleAttrs}
    >
      <ChevronIcon size={17} />
    </button>
  );
}

function SearchView({ styleAttrs }: PartViewProps) {
  const { variant, classes, search, setSearch } = HeaderFamily.useData();
  const { t } = useText();
  return (
    <SearchField
      className={classes.search}
      value={search}
      onChange={setSearch}
      placeholder={variant === 'storefront' ? undefined : t('shell.header.searchPlaceholder')}
      rootAttrs={styleAttrs}
    />
  );
}

function FilterView({ styleAttrs }: PartViewProps) {
  const { variant, classes, canFilter, filtered, openFilter } = HeaderFamily.useData();
  const { t } = useText();
  if (variant === 'storefront' || !canFilter) return null;
  return (
    <button
      type="button"
      className={classes.action}
      onClick={openFilter}
      aria-label={filtered ? t('shell.header.categoriesFiltered') : t('shell.header.categories')}
      {...styleAttrs}
    >
      <FilterIcon size={17} />
      {filtered ? <span className={classes.mark} aria-hidden /> : null}
    </button>
  );
}

function AccountInner({ styleAttrs }: { styleAttrs?: StyleAttrs }) {
  const { variant, classes, loggedIn, native } = HeaderFamily.useData();
  const { features } = useSettings();
  const { t } = useText();
  const { headerAccountIcon } = useCoreOptions();
  const accountClass = headerIconClass(headerAccountIcon);
  if (!features.accounts || accountClass === null) return null;
  if (variant === 'storefront') {
    return loggedIn ? (
      <Link to="/account" className={`${classes.action} ${accountClass}`} aria-label={t('common.nav.yourAccount')} {...styleAttrs}>
        <UserIcon size={18} />
      </Link>
    ) : (
      <Link to="/login" className={`${classes.signIn} ${accountClass}`} {...styleAttrs}>
        {t('common.actions.signIn')}
      </Link>
    );
  }
  return (
    <Link
      to={loggedIn || (variant === 'webapp' && native) ? '/account' : '/login'}
      className={`${classes.action} ${accountClass}`}
      aria-label={loggedIn ? t('common.nav.yourAccount') : t('common.actions.signIn')}
      {...styleAttrs}
    >
      <UserIcon size={17} />
    </Link>
  );
}

function AccountView({ props, styleAttrs }: PartViewProps) {
  return (
    <CoreOptionsScope value={compactScope({ headerAccountIcon: iconOverride(props.icon as Override) })}>
      <AccountInner styleAttrs={styleAttrs} />
    </CoreOptionsScope>
  );
}

function CartInner({ styleAttrs }: { styleAttrs?: StyleAttrs }) {
  const { variant, classes, cartCount } = HeaderFamily.useData();
  const { features } = useSettings();
  const { tp } = useText();
  const { headerCartIcon } = useCoreOptions();
  const cartClass = headerIconClass(headerCartIcon);
  if (!features.ordering || cartClass === null) return null;
  return (
    <Link to="/cart" className={`${classes.action} ${cartClass}`} aria-label={tp('shell.header.cartAriaLabel', cartCount)} {...styleAttrs}>
      <BagIcon size={variant === 'storefront' ? 18 : 17} />
      {cartCount > 0 ? <span className={classes.count} data-sf-part="badge">{cartCount}</span> : null}
    </Link>
  );
}

function CartView({ props, styleAttrs }: PartViewProps) {
  return (
    <CoreOptionsScope value={compactScope({ headerCartIcon: iconOverride(props.icon as Override) })}>
      <CartInner styleAttrs={styleAttrs} />
    </CoreOptionsScope>
  );
}

export const HEADER_VIEWS: FamilyValue<HeaderData>['views'] = {
  HeaderBrand: BrandView, HeaderBack: BackView, HeaderSearch: SearchView,
  HeaderFilter: FilterView, HeaderAccount: AccountView, HeaderCart: CartView,
};

// ── the container view ──────────────────────────────────────────────────────

export interface HeaderBarProps {
  variant: Variant;
  topBar: boolean;
  sticky: boolean;
  slots: { start: SlotRender; nav: SlotRender; middle: SlotRender; end: SlotRender };
  styleAttrs?: StyleAttrs;
}

/** TopBar slot + the header bar: the Header container's markup around its slots (stage-4 spec §5.1). */
export function HeaderBar({ variant, topBar, sticky, slots, styleAttrs }: HeaderBarProps): ReactNode {
  const { brand, features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const cartCount = useCartStore(selectCount);
  const openPanel = useUiStore((s) => s.open);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { search, setSearch } = useShellState();
  const { showCategoryPicker } = useCoreOptions();
  const native = isTelegramWebApp();

  const onCatalog = onCatalogPath(pathname);
  // Only the catalogue body carries the sheet this button opens — wholesale replaces it.
  const canFilter = onCatalog && !features.wholesale && showCategoryPicker;
  const filtered = pathname.startsWith('/c/');
  const showBack = !native && !onCatalog;

  const data = useMemo<HeaderData>(() => ({
    variant, classes: MODULES[variant], brandName: brand.name, loggedIn, native, cartCount, search, setSearch,
    onCatalog, canFilter, filtered, showBack,
    openFilter: () => openPanel('filterOpen'),
    // A deep link has nothing behind it in this tab: go home, not off the shop.
    goBack: () => (isFirstHistoryEntry() ? navigate('/', { replace: true }) : navigate(-1)),
  }), [variant, brand.name, loggedIn, native, cartCount, search, setSearch, onCatalog, canFilter, filtered, showBack, openPanel, navigate]);
  const value = useMemo(() => ({ data, views: HEADER_VIEWS }), [data]);

  const c = CLASSES[variant];
  return (
    <HeaderFamily.Provider value={value}>
      {topBar && variant !== 'webapp' ? <Slot name="TopBar" /> : null}
      <header className={sticky ? c.bar : `${c.bar} ${c.unstuck}`} data-sf-part="header" {...styleAttrs}>
        {variant === 'webapp' ? <div className={c.safeTop} /> : null}
        <NoticeBanners pinned />
        <div className={c.inner}>
          {slots.start()}
          {slots.nav()}
          {slots.middle()}
          {slots.end({ className: c.actions })}
        </div>
      </header>
    </HeaderFamily.Provider>
  );
}

/**
 * The v0.7.0 header as slot renders: the container's default arrangement drawn straight through the
 * family's views. The legacy `StorefrontHeader` / `MenuHeader` / `WebAppHeader` entry points use it
 * (it needs no registry, so the shells and the PageOutlet block never import each other in a cycle);
 * it is the same arrangement `HEADER_CONTAINER.defaultSlots` stores in the default document.
 */
export function legacyHeaderSlots(variant: Variant, search: boolean, nav: ReactNode): HeaderBarProps['slots'] {
  const host = (name: string, props: Record<string, unknown> = {}) => <HeaderFamily.PartHost key={name} name={name} props={props} />;
  const item = (type: string): ComponentData => ({ type, props: { id: type } });
  const run = (names: string[], props: Record<string, Record<string, unknown>> = {}) =>
    fixedSlot(names.map((n) => host(n, props[n])), names.map(item));
  const icons = { HeaderAccount: { icon: 'inherit' }, HeaderCart: { icon: 'inherit' } };
  return {
    start: run(variant === 'webapp' ? ['HeaderBack', 'HeaderBrand'] : ['HeaderBrand']),
    nav: fixedSlot(nav),
    middle: run(search ? ['HeaderSearch'] : []),
    end: run([...(variant === 'storefront' ? [] : ['HeaderFilter']), 'HeaderAccount', 'HeaderCart'], icons),
  };
}
