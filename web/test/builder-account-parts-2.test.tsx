import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Suspense, type ReactNode } from 'react';
import type { Profile, RedeemOptions } from '@/types/profile.ts';

// The data entry points the goldens mock stay the only way these containers read data.
const s = vi.hoisted(() => ({
  profile: undefined as unknown, redeem: undefined as unknown,
  inTelegram: false, layout: 'storefront', mode: 'off',
  links: { whatsapp: null, telegram: null } as { whatsapp: string | null; telegram: string | null },
  redeemCalls: [] as number[], claimCalls: [] as string[], logoutCalls: 0,
  clearCart: 0, resetSync: 0, assign: [] as string[],
}));
vi.mock('@/features/account/queries.ts', async (orig) => ({
  ...(await orig<typeof import('@/features/account/queries.ts')>()),
  useProfile: () => s.profile, useRedeemOptions: () => s.redeem,
}));
vi.mock('@/api/profile.ts', () => ({
  redeem: async (id: number) => { s.redeemCalls.push(id); return { pointsDeducted: 500, creditAwarded: 5, newPointsBalance: 750, newCreditBalance: 12.5 }; },
  setBotMode: async () => ({ classic: true }),
  setReferralCode: async (code: string) => { s.claimCalls.push(code); return { referrerNickname: 'Grace' }; },
}));
vi.mock('@/api/auth.ts', () => ({ logout: async () => { s.logoutCalls += 1; } }));
vi.mock('@/features/cart/useServerCart.ts', () => ({ resetCartSync: () => { s.resetSync += 1; } }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: () => false }));
vi.mock('@/lib/telegram-webapp.ts', async (orig) => ({ ...(await orig<typeof import('@/lib/telegram-webapp.ts')>()), isTelegramWebApp: () => s.inTelegram, tgClose: () => {} }));
vi.mock('@/app/layout.ts', () => ({ useEffectiveLayout: () => s.layout }));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: s.links },
    telegramWebApp: { mode: s.mode }, features: { layout: s.layout, ordering: true, accounts: true },
  }),
}));

import { defaultDoc } from '@/builder/defaults/index.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { RenderDoc } from '@/builder/render.tsx';
import { validateDoc } from '@/builder/guard.ts';
import { checkRules } from '@/builder/rules.ts';
import { upgradeDoc, upgradeItems } from '@/builder/upgrade.ts';
import { partId, type ContainerSpec } from '@/builder/parts.ts';
import { BuilderModeProvider, type BuilderMode } from '@/builder/mode.ts';
import { LoyaltyFamily, type LoyaltyPreview } from '@/builder/family-loyalty.ts';
import { ReferralsFamily, type ReferralsPreview } from '@/builder/family-referrals.ts';
import { ProfileFamily, type ProfilePreview } from '@/builder/family-profile.ts';
import { useCartStore } from '@/stores/cart.ts';
import type { ComponentData, DocKey, LayoutKind, PuckDoc } from '@/builder/types.ts';
import { STAGE4_PARTS } from './helpers/stage4-parts.ts';
import classes from '@/features/account/Account.module.css';

afterEach(cleanup);

const noop = () => {};
const PROFILE: Profile = {
  loyaltyPoints: 1250, storeCreditBalance: 7.5, referralCode: 'NORTH-4F2A', referralsCount: 3, referredPeopleCount: 2,
  hasReferrer: false, referrerNickname: null, totalOrders: 4, totalSpend: 182.4, memberSince: '2026-03-04T12:00:00.000Z',
  nickname: 'Ada', identities: { telegram: true, whatsapp: false, email: true },
};
const LADDER: RedeemOptions = {
  loyaltyPoints: 1250,
  options: [
    { id: 1, label: 'GBP 5 off', pointsCost: 500, creditValue: 5, affordable: true },
    { id: 2, label: 'GBP 20 off', pointsCost: 2000, creditValue: 20, affordable: false },
  ],
};
const ok = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: noop });
const pending = { data: undefined, isPending: true, isError: false, refetch: noop };

beforeEach(() => {
  s.profile = pending; s.redeem = pending; s.inTelegram = false; s.layout = 'storefront'; s.mode = 'off';
  s.links = { whatsapp: null, telegram: null }; s.redeemCalls = []; s.claimCalls = []; s.logoutCalls = 0; s.resetSync = 0;
  s.assign = [];
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign: (u: string) => s.assign.push(u) } });
});

const NEW_PARTS = Object.keys(STAGE4_PARTS).filter((n) => /^(Loyalty|Referral|Profile)[A-Z]/.test(n));
const familyOf = (n: string) => (n.startsWith('Loyalty') ? 'loyalty' : n.startsWith('Referral') ? 'referrals' : 'profile');
const SPECS: Record<string, ContainerSpec> = {
  Loyalty: BLOCKS.Loyalty!.container!, Referrals: BLOCKS.Referrals!.container!, Profile: BLOCKS.Profile!.container!,
};
const DOC_OF: Record<string, DocKey> = { Loyalty: 'account.loyalty', Referrals: 'account.referrals', Profile: 'account.profile' };
const REQUIRED: Record<string, string[]> = { Loyalty: ['LoyaltyPoints', 'LoyaltyRewards'], Referrals: ['ReferralCode'], Profile: ['ProfileSignOut'] };
const DEFAULTS: Record<string, string[]> = {
  Loyalty: ['LoyaltyPoints', 'LoyaltyCredit', 'LoyaltyNoPoints', 'LoyaltyRewards'],
  Referrals: ['ReferralCode', 'ReferralShare', 'ReferralStats', 'ReferralReferrer'],
  Profile: ['ProfileDetails', 'ProfileChannels', 'ProfilePassword', 'ProfileContact', 'ProfileBotSwitch', 'ProfileSignOut'],
};
const LAYOUTS: LayoutKind[] = ['storefront', 'menu', 'webapp'];

const root = { props: { title: '', description: '', chrome: 'shell' } } as PuckDoc['root'];
const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const doc = (content: ComponentData[]): PuckDoc => ({ root, content });
const types = (items: unknown) => (items as ComponentData[]).map((i) => i.type);
const rulesOf = (d: PuckDoc, key: DocKey) => checkRules(d, key, 'storefront').map((i) => i.rule);
const p = (container: string, type: string): ComponentData => c(type, partId(container, type));
const arranged = (container: string, parts: string[], extra: ComponentData[] = []) =>
  validateDoc(doc([c(container, 'k', { content: [...parts.map((t) => p('k', t)), ...extra] })]), DOC_OF[container]!, 'storefront').doc!;

function view(d: PuckDoc, key: DocKey, mode?: Partial<BuilderMode>) {
  const inner: ReactNode = <RenderDoc doc={d} docKey={key} layout="storefront" />;
  const wrapped = mode ? <BuilderModeProvider value={{ editing: false, previewAs: null, ...mode }}>{inner}</BuilderModeProvider> : inner;
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}><MantineProvider env="test"><MemoryRouter><Suspense fallback={null}>{wrapped}</Suspense></MemoryRouter></MantineProvider></QueryClientProvider>);
}
const defaultOf = (container: string) => validateDoc(defaultDoc(DOC_OF[container]!, 'storefront')!, DOC_OF[container]!, 'storefront').doc!;
const ready = async (r: { container: HTMLElement }) => { await waitFor(() => expect(r.container.querySelector(`.${classes.body}`)).not.toBeNull()); return r; };

describe('contract', () => {
  it('covers every part of the three containers', () => {
    expect([...NEW_PARTS].sort()).toEqual(['LoyaltyCredit', 'LoyaltyNoPoints', 'LoyaltyPoints', 'LoyaltyRewards', 'ProfileBotSwitch', 'ProfileChannels',
      'ProfileContact', 'ProfileDetails', 'ProfileSignOut', 'ReferralCode', 'ReferralReferrer', 'ReferralShare', 'ReferralStats']);
  });
  it.each(NEW_PARTS)('%s: family and style match the stage 4 table', (name) => {
    const def = BLOCKS[name]!;
    expect(def.part).toEqual({ family: familyOf(name) });
    expect(def.style).toEqual(expect.objectContaining({ target: STAGE4_PARTS[name]!.style.target }));
    expect([...(def.style ? def.style.keys : [])].sort()).toEqual([...STAGE4_PARTS[name]!.style.keys].sort());
    expect(def.slots).toEqual([]);
  });
  it('no required part carries hide', () => {
    for (const spec of Object.values(SPECS)) for (const r of spec.required) expect(BLOCKS[r]!.style && BLOCKS[r]!.style.keys).not.toContain('hide');
  });
  it.each(NEW_PARTS)('%s renders nothing outside its container', (name) => {
    const { container } = render(<>{BLOCKS[name]!.render({ id: 'x', puck: {} } as never)}</>);
    expect(container.innerHTML).toBe('');
  });
  it('the containers declare their slot and required parts, every part unique', () => {
    for (const [name, spec] of Object.entries(SPECS)) {
      expect(BLOCKS[name]!.slots).toEqual(['content']);
      expect(spec.insertSlot).toBe('content');
      expect(spec.required).toEqual(REQUIRED[name]);
      expect(spec.unique).toEqual(DEFAULTS[name]);
    }
  });
  it('default ids are at most 64 characters and unique', () => {
    for (const spec of Object.values(SPECS)) {
      const ids = spec.defaultSlots({}, { layout: 'storefront', id: 'x'.repeat(60) }).content!.map((i) => String(i.props.id));
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id.length).toBeLessThanOrEqual(64);
    }
  });
  it.each(Object.entries(DOC_OF))('the %s default document passes its rules in every layout', (_n, key) => {
    for (const layout of LAYOUTS) {
      const d = upgradeDoc(defaultDoc(key, layout)!, key, layout);
      expect(checkRules(d, key, layout)).toEqual([]);
    }
  });
});

describe('rules', () => {
  it.each(Object.keys(SPECS))('%s: required parts', (container) => {
    const key = DOC_OF[container]!;
    const full = (): ComponentData[] => SPECS[container]!.defaultSlots({}, { layout: 'storefront', id: 'k' }).content!;
    const wrap = (content: ComponentData[]) => doc([c(container, 'k', { content })]);
    for (const r of REQUIRED[container]!) {
      expect(rulesOf(wrap(full().filter((i) => i.type !== r)), key)).toContain(`part-required:${container}.${r}`);
      expect(rulesOf(wrap([...full(), c(r, 'dup')]), key)).toContain(`part-required:${container}.${r}`);
    }
    for (const o of DEFAULTS[container]!.filter((n) => !REQUIRED[container]!.includes(n))) {
      expect(rulesOf(wrap([...full(), c(o, 'dup')]), key)).toContain(`part-unique:${container}.${o}`);
      expect(rulesOf(wrap(full().filter((i) => i.type !== o)), key).filter((r) => r.startsWith('part-'))).toEqual([]);
    }
  });
  it('a part inside another family container raises part-placement', () => {
    const d = doc([c('Loyalty', 'k', { content: [p('k', 'LoyaltyPoints'), p('k', 'LoyaltyRewards'), c('ProfileSignOut', 'x')] })]);
    expect(rulesOf(d, 'account.loyalty')).toContain('part-placement:ProfileSignOut');
    const d2 = doc([c('Profile', 'k', { content: [p('k', 'ProfileSignOut'), c('ReferralCode', 'x')] })]);
    expect(rulesOf(d2, 'account.profile')).toContain('part-placement:ReferralCode');
  });
});

describe('upgrade (spec section 8)', () => {
  it.each(Object.keys(SPECS))('%s: absent content equals the defaults, [] is untouched, a second pass is idempotent', (type) => {
    const stored = [c(type, `${type}-default`)];
    const once = upgradeItems(stored, 'storefront');
    expect(types(once[0]!.props.content)).toEqual(DEFAULTS[type]);
    expect(once[0]!.props.content).toEqual(SPECS[type]!.defaultSlots({}, { layout: 'storefront', id: `${type}-default` }).content);
    expect(upgradeItems(once, 'storefront')).toBe(once);
    const present = [c(type, `${type}-default`, { content: [] })];
    expect(upgradeItems(present, 'storefront')).toBe(present);
  });
});

describe('loyalty', () => {
  const loaded = () => { s.profile = ok(PROFILE); s.redeem = ok(LADDER); };
  it('default arrangement: meter, credit row, rewards, and the modal is the wrapper last child', async () => {
    loaded();
    const { container } = await ready(view(defaultOf('Loyalty'), 'account.loyalty'));
    const body = container.querySelector(`.${classes.body}`)!;
    expect(body.children[0]!.className).toBe(classes.meter);
    expect(body.children[1]!.className).toBe(classes.row);
    expect(body.querySelector('section')).not.toBeNull();
    expect(container.querySelector(`.${classes.note}`)).toBeNull();
  });
  it('redeem still confirms through the modal with LoyaltyRewards moved first', async () => {
    loaded();
    await ready(view(arranged('Loyalty', ['LoyaltyRewards', 'LoyaltyPoints']), 'account.loyalty'));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Redeem' }))[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('GBP 5 off');
    fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Redeem')!);
    await waitFor(() => expect(s.redeemCalls).toEqual([1]));
  });
  it('LoyaltyRewards renders null until the ladder loads while required', async () => {
    s.profile = ok(PROFILE); s.redeem = pending;
    const { container } = await ready(view(defaultOf('Loyalty'), 'account.loyalty'));
    expect(container.querySelector('section')).toBeNull();
    expect(container.querySelector(`.${classes.meter}`)).not.toBeNull();
  });
  it('a zero balance draws the note; the credit row can be removed', async () => {
    s.profile = ok({ ...PROFILE, loyaltyPoints: 0 }); s.redeem = ok(LADDER);
    const { container } = await ready(view(arranged('Loyalty', ['LoyaltyPoints', 'LoyaltyNoPoints', 'LoyaltyRewards']), 'account.loyalty'));
    expect(container.querySelector(`.${classes.note}`)).toHaveTextContent(/./);
    expect(container.querySelector(`.${classes.row}`)).toBeNull();
  });
  it('the load-failed screen stays before any slot', () => {
    s.profile = { data: undefined, isPending: false, isError: true, refetch: noop };
    const { container } = view(defaultOf('Loyalty'), 'account.loyalty');
    expect(container.querySelector(`.${classes.meter}`)).toBeNull();
  });
  it('preview states render from the fixture with both queries pending', async () => {
    const fixture: LoyaltyPreview = { profile: PROFILE, options: LADDER };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const mode = (state: string): Partial<BuilderMode> => ({ previewStates: { Loyalty: state }, previewFixtures: { Loyalty: fixture } });
    const r = await ready(view(defaultOf('Loyalty'), 'account.loyalty', mode('rewards')));
    expect(r.container.querySelector(`.${classes.meter}`)).toHaveTextContent('1,250');
    expect(r.container.querySelector('section')).not.toBeNull();
    cleanup();
    const r2 = await ready(view(defaultOf('Loyalty'), 'account.loyalty', mode('no-points')));
    expect(r2.container.querySelector(`.${classes.meter}`)).toHaveTextContent('0');
    expect(r2.container.querySelector(`.${classes.note}`)).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('referrals', () => {
  it('default arrangement: plate, stats and referrer sections inside div.body', async () => {
    s.profile = ok(PROFILE);
    const { container } = await ready(view(defaultOf('Referrals'), 'account.referrals'));
    const body = container.querySelector(`.${classes.body}`)!;
    expect(body.children[0]!.className).toBe(classes.plate);
    expect(body.querySelectorAll('section')).toHaveLength(2);
  });
  it('the claim form works inside ReferralReferrer, however it is arranged', async () => {
    s.profile = ok(PROFILE);
    const { container } = await ready(view(arranged('Referrals', ['ReferralReferrer', 'ReferralCode']), 'account.referrals'));
    expect(container.querySelector(`.${classes.plate}`)).not.toBeNull();
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: ' GRACE-1 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(s.claimCalls).toEqual(['GRACE-1']));
  });
  it('a referred shopper sees who referred them instead of the form', async () => {
    s.profile = ok({ ...PROFILE, hasReferrer: true, referrerNickname: 'Grace' });
    const { container } = await ready(view(defaultOf('Referrals'), 'account.referrals'));
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector(`.${classes.referrer}`)).toHaveTextContent('Grace');
  });
  it('share is null with no share method, and the stats can be removed', async () => {
    s.profile = ok(PROFILE);
    const { container } = await ready(view(arranged('Referrals', ['ReferralCode', 'ReferralShare']), 'account.referrals'));
    expect(container.querySelector(`.${classes.share}`)).toBeNull();
    expect(container.querySelector(`.${classes.counts}`)).toBeNull();
  });
  it('share links draw when the shop has them', async () => {
    s.profile = ok(PROFILE); s.links = { whatsapp: 'https://wa.me/447700900123', telegram: null };
    const { container } = await ready(view(defaultOf('Referrals'), 'account.referrals'));
    expect(container.querySelector(`.${classes.share} a`)).toHaveAttribute('href', expect.stringContaining('wa.me'));
  });
  it('shows the shareable link under the code in a browser, with its own copy button', async () => {
    s.profile = ok(PROFILE);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container } = await ready(view(defaultOf('Referrals'), 'account.referrals'));
    const plate = container.querySelector(`.${classes.plate}`)!;
    expect(plate).toHaveTextContent(`${window.location.origin}/ref/${PROFILE.referralCode}`);
    fireEvent.click(screen.getByRole('button', { name: 'Copy your referral link' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/ref/${PROFILE.referralCode}`);
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });
  it('shows no link inside the Telegram Mini App', async () => {
    s.profile = ok(PROFILE); s.inTelegram = true;
    const { container } = await ready(view(defaultOf('Referrals'), 'account.referrals'));
    expect(container.querySelector(`.${classes.plate}`)!.textContent).not.toContain('/ref/');
    expect(screen.queryByRole('button', { name: 'Copy your referral link' })).toBeNull();
    s.inTelegram = false;
  });
  it('preview states render from the fixture with the query pending', async () => {
    const fixture: ReferralsPreview = { info: PROFILE };
    const mode = (state: string): Partial<BuilderMode> => ({ previewStates: { Referrals: state }, previewFixtures: { Referrals: fixture } });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await ready(view(defaultOf('Referrals'), 'account.referrals', mode('new')));
    expect(r.container.querySelector('input')).not.toBeNull();
    cleanup();
    const r2 = await ready(view(defaultOf('Referrals'), 'account.referrals', mode('referred')));
    expect(r2.container.querySelector('input')).toBeNull();
    expect(r2.container.querySelector(`.${classes.referrer}`)).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('profile', () => {
  beforeEach(() => { s.profile = ok(PROFILE); });
  it('default arrangement ends with the sign-out button', async () => {
    const { container } = await ready(view(defaultOf('Profile'), 'account.profile'));
    expect(container.querySelector(`.${classes.body}`)!.lastElementChild).toBe(container.querySelector(`.${classes.logout}`));
  });
  it('without ProfileChannels it still signs out and runs the clear-cart path', async () => {
    useCartStore.getState().setMode('server');
    await ready(view(arranged('Profile', ['ProfileDetails', 'ProfileSignOut']), 'account.profile'));
    expect(screen.queryByText(/not linked|linked/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(s.assign).toEqual(['/']));
    expect(s.logoutCalls).toBe(1);
    expect(s.resetSync).toBe(1);
    expect(useCartStore.getState().mode).toBe('local');
  });
  it('inside Telegram the sign-out part is null', async () => {
    s.inTelegram = true; s.layout = 'webapp';
    const { container } = await ready(view(defaultOf('Profile'), 'account.profile'));
    expect(container.querySelector(`.${classes.logout}`)).toBeNull();
  });
  it('the contact section needs the web app layout and chat links; the bot switch needs Telegram beta', async () => {
    s.layout = 'webapp'; s.links = { whatsapp: 'https://wa.me/447700900123', telegram: null };
    const a = await ready(view(defaultOf('Profile'), 'account.profile'));
    expect(a.container.querySelectorAll('section')).toHaveLength(2);
    cleanup();
    s.inTelegram = true; s.mode = 'beta'; s.links = { whatsapp: null, telegram: null };
    const b = await ready(view(defaultOf('Profile'), 'account.profile'));
    expect(b.container.querySelectorAll('section')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Switch to the classic bot' })).toBeInTheDocument();
  });
  it('rows move: sign-out first, details after', async () => {
    const { container } = await ready(view(arranged('Profile', ['ProfileSignOut', 'ProfileDetails']), 'account.profile'));
    expect(container.querySelector(`.${classes.body}`)!.firstElementChild).toBe(container.querySelector(`.${classes.logout}`));
  });
  it('preview states render from the fixture with the query pending', async () => {
    s.profile = pending;
    const fixture: ProfilePreview = { surface: 'website', profile: PROFILE };
    const mode = (surface: 'website' | 'webapp'): Partial<BuilderMode> => ({ previewStates: { Profile: surface }, previewFixtures: { Profile: { ...fixture, surface } } });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await ready(view(defaultOf('Profile'), 'account.profile', mode('website')));
    expect(r.container.querySelectorAll('section')).toHaveLength(2);
    cleanup();
    s.links = { whatsapp: 'https://wa.me/447700900123', telegram: null };
    const r2 = await ready(view(defaultOf('Profile'), 'account.profile', mode('webapp')));
    expect(r2.container.querySelectorAll('section')).toHaveLength(3);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('family views', () => {
  it('a view reads its data from the container', () => {
    for (const F of [LoyaltyFamily, ReferralsFamily, ProfileFamily]) {
      const Probe = () => { F.useData(); return null; };
      expect(() => render(<Probe />)).toThrow(/outside its container/);
    }
  });
});

describe('css (spec section 9)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/features/account/Account.module.css'), 'utf8').replaceAll(String.fromCharCode(13), '');
  it.each(['.meterFigure', '.meterUnit', '.optionLabel', '.optionCost', '.shortfall', '.plateLabel', '.code', '.copy', '.countFigure',
    '.countLabel', '.identity', '.logout'])('%s takes the fg and text-size variables', (sel) => {
    const m = new RegExp(`\\n\\${sel} \\{\\n([\\s\\S]*?)\\n\\}`).exec(css)!;
    expect(m[1]).toContain('var(--sf-block-fg,');
    expect(m[1]).toMatch(/--sf-text-scale/);
  });
});
