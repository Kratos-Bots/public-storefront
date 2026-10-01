import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { Suspense, type ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';

vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ brand: { links: { whatsapp: null, telegram: null } } } as unknown as StorefrontSettings) }));
vi.mock('@/api/verify.ts', () => ({ verifyProductUnit: vi.fn() }));

import { verifyProductUnit } from '@/api/verify.ts';
import { RenderDoc } from '@/builder/render.tsx';
import { BuilderModeProvider } from '@/builder/mode.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { validateDoc } from '@/builder/guard.ts';
import { checkRules } from '@/builder/rules.ts';
import { upgradeDoc, upgradeItems } from '@/builder/upgrade.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { part, partId } from '@/builder/parts.ts';
import { VerifyFamily, type VerifyPreview } from '@/builder/family-verify.ts';
import { VERIFY_CONTAINER } from '@/builder/blocks/_shared/verify-container.ts';
import { EMPTY_ROOT, type ComponentData, type LayoutKind, type PuckDoc } from '@/builder/types.ts';
import { STAGE4_PARTS } from './helpers/stage4-parts.ts';

const verifyMock = vi.mocked(verifyProductUnit);
afterEach(() => { cleanup(); verifyMock.mockReset(); });

const PARTS = ['VerifyIntro', 'VerifyFields', 'VerifyResult', 'VerifyBack'] as const;
const REQUIRED = ['VerifyIntro', 'VerifyFields', 'VerifyResult'] as const;
const LAYOUTS: LayoutKind[] = ['storefront', 'menu', 'webapp'];

const docOf = (content: ComponentData[]): PuckDoc => ({ root: { props: { ...EMPTY_ROOT } }, content, zones: {} });
const form = (props: Record<string, unknown> = {}): ComponentData => ({ type: 'VerifyForm', props: { id: 'vf', ...props } });
const p = (type: string, id = type, extra: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...extra } });
const rules = (d: PuckDoc, layout: LayoutKind = 'storefront') => checkRules(d, 'verify', layout).map((i) => i.rule);
const types = (items: unknown) => (items as ComponentData[]).map((c) => c.type);

function Wrap({ children, fixture }: { children: ReactNode; fixture?: VerifyPreview }) {
  return (
    <MantineProvider env="test">
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/verify']}>
          <BuilderModeProvider value={{ editing: !!fixture, previewAs: null, previewFixtures: fixture ? { VerifyForm: fixture } : null }}>
            {children}
          </BuilderModeProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>
  );
}
async function mount(doc: PuckDoc, fixture?: VerifyPreview) {
  const guarded = validateDoc(doc, 'verify', 'storefront').doc!;
  const out = render(<Wrap fixture={fixture}><Suspense fallback={null}><RenderDoc doc={guarded} docKey="verify" layout="storefront" /></Suspense></Wrap>);
  await waitFor(() => expect(out.container.querySelector('div[class*="page"]')).not.toBeNull(), { timeout: 30_000 });
  return out;
}
const fill = (code = 'AB3D-SKU12', auth = '123456') => {
  fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: code } });
  fireEvent.change(screen.getByLabelText(/authentication code/i), { target: { value: auth } });
};
const submit = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: /verify product|checking/i })); });
const VERIFIED = { status: 'verified' as const, data: { createdAt: '2026-01-15T00:00:00.000Z', expiryDate: '2099-01-15T00:00:00.000Z' } };

describe('contract', () => {
  it.each(PARTS)('%s: family, style row, no hide on required parts', async (name) => {
    const def = BLOCKS[name]!;
    expect(def.part).toEqual({ family: 'verify' });
    const row = STAGE4_PARTS[name]!.style as { target: string; keys: string[] };
    expect(def.style && { target: def.style.target, keys: [...def.style.keys].sort() }).toEqual({ target: row.target, keys: [...row.keys].sort() });
    if ((REQUIRED as readonly string[]).includes(name)) expect(def.style && def.style.keys).not.toContain('hide');
  });
  it('PartHost outside a container renders nothing', async () => {
    const { container } = render(<VerifyFamily.PartHost name="VerifyIntro" props={{}} />);
    expect(container.innerHTML).toBe('');
  });
  it('default ids are unique and at most 64 chars (even for a 64-char container id)', async () => {
    const slots = VERIFY_CONTAINER.defaultSlots({}, { layout: 'storefront', id: 'x'.repeat(64) }).content!;
    const ids = slots.map((c) => String(c.props.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.max(...ids.map((i) => i.length))).toBeLessThanOrEqual(64);
    expect(types(slots)).toEqual([...PARTS]);
  });
  it('the default document passes its own rules in every layout', async () => {
    for (const l of LAYOUTS) expect(checkRules(defaultDoc('verify', l)!, 'verify', l)).toEqual([]);
  });
  it('the CSS module reads --sf-block-fg and --sf-text-scale for the TEXT parts', async () => {
    const css = readFileSync('src/features/verify/VerifyPage.module.css', 'utf8');
    expect(css).toContain('var(--sf-block-fg,');
    expect(css).toContain('var(--sf-text-scale, 1)');
  });
});

describe('rules', () => {
  const sans = (name: string) => PARTS.filter((x) => x !== name).map((x) => p(x));
  it.each(REQUIRED)('removing %s is part-required', async (name) => {
    expect(rules(docOf([form({ content: sans(name) })]))).toContain(`part-required:VerifyForm.${name}`);
  });
  it.each(REQUIRED)('duplicating %s is part-required', async (name) => {
    expect(rules(docOf([form({ content: [...PARTS.map((x) => p(x)), p(name, `${name}-2`)] })]))).toContain(`part-required:VerifyForm.${name}`);
  });
  it('duplicating the back link is part-unique', async () => {
    expect(rules(docOf([form({ content: [...PARTS.map((x) => p(x)), p('VerifyBack', 'b2')] })]))).toContain('part-unique:VerifyForm.VerifyBack');
  });
  it('a part outside the container is part-placement', async () => {
    expect(rules(docOf([form({ content: PARTS.map((x) => p(x)) }), p('VerifyBack', 'loose')]))).toContain('part-placement:VerifyBack');
  });
  it('a part of another family inside the container is part-placement', async () => {
    const r = rules(docOf([form({ content: [...PARTS.map((x) => p(x)), p('LoginMethods', 'lm')] })]));
    expect(r.some((x) => x === 'part-placement:LoginMethods' || x.startsWith('drop:'))).toBe(true);
  });
  it('hiding the optional back link is allowed; required parts take no hide', async () => {
    const hidden = form({ content: PARTS.map((x) => p(x, x, x === 'VerifyBack' ? { blockStyle: { hide: 'mobile' } } : {})) });
    expect(rules(docOf([hidden]))).toEqual([]);
  });
});

describe('upgrade of a stored v0.7.0 container (absent slots)', () => {
  const stored = docOf([form()]);
  const defaults = VERIFY_CONTAINER.defaultSlots({}, { layout: 'storefront', id: 'vf' });
  it('absent content is filled from defaultSlots', async () => {
    const out = upgradeDoc(stored, 'verify', 'storefront');
    expect(out.content[0]!.props.content).toEqual(defaults.content);
    expect((out.content[0]!.props.content as ComponentData[]).map((c) => c.props.id)).toEqual(PARTS.map((x) => partId('vf', x)));
  });
  it('a present empty slot is never touched', async () => {
    const doc = docOf([form({ content: [] })]);
    expect(upgradeDoc(doc, 'verify', 'storefront')).toBe(doc);
  });
  it('is idempotent', async () => {
    const once = upgradeItems(stored.content, 'storefront');
    expect(upgradeItems(once, 'storefront')).toBe(once);
  });
  it('the guard accepts the stored container without a required-part issue', async () => {
    expect(validateDoc(stored, 'verify', 'storefront').issues.filter((i) => i.rule.startsWith('part-'))).toEqual([]);
  });
});

describe('rendering', () => {
  it('a stored container with absent slots renders the full default arrangement', async () => {
    const { container } = await mount(docOf([form()]));
    const page = container.querySelector('div[class*="page"]')!;
    expect(page.querySelector('h1')).not.toBeNull();
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    expect(page.lastElementChild!.tagName).toBe('A');
  });
  it('the default document is the same markup as a stored container', async () => {
    const a = (await mount(defaultDoc('verify', 'storefront')!)).container.innerHTML;
    cleanup();
    const b = (await mount(docOf([form()]))).container.innerHTML;
    const norm = (h: string) => h.replace(/_r_\w+_/g, 'ID');
    expect(norm(a)).toBe(norm(b));
  });
  it('draws the back link above the form when arranged so, with an interleaved RichText', async () => {
    const rt = p('RichText', 'rt', { bodyHtml: '<p>Hello batch</p>', width: 'narrow' });
    const { container } = await mount(docOf([form({ content: [p('VerifyBack'), p('VerifyIntro'), rt, p('VerifyFields'), p('VerifyResult')] })]));
    const page = container.querySelector('div[class*="page"]')!;
    const kids = [...page.children].map((c) => c.tagName + (c.textContent ?? '').slice(0, 5));
    expect(kids[0]).toMatch(/^A/);
    expect(page.children[1]!.className).toMatch(/masthead/);
    expect(page.children[2]!.textContent).toContain('Hello batch');
    expect(page.children[3]!.tagName).toBe('FORM');
  });
  it('a removed optional part is absent', async () => {
    const { container } = await mount(docOf([form({ content: REQUIRED.map((x) => p(x)) })]));
    expect(container.querySelector('a')).toBeNull();
  });
  it('an all-parts-removed (hidden optional) container still keeps the fields working', async () => {
    verifyMock.mockResolvedValue({ status: 'invalid' });
    await mount(docOf([form({ content: [p('VerifyFields'), p('VerifyResult'), p('VerifyIntro')] })]));
    fill();
    await submit();
    expect(await screen.findByText(/not verified/i)).toBeInTheDocument();
  });
});

describe('state ownership', () => {
  it('result drawn above the form still shows each verdict; an edit drops it', async () => {
    verifyMock.mockResolvedValue({ status: 'invalid' });
    await mount(docOf([form({ content: [p('VerifyIntro'), p('VerifyResult'), p('VerifyFields'), p('VerifyBack')] })]));
    expect(document.querySelector('[data-tone]')).toBeNull();
    fill();
    await submit();
    expect(await screen.findByText(/not verified/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: 'AB3D-SKU13' } });
    expect(screen.queryByText(/not verified/i)).toBeNull();
  });
  it('VerifyResult is nothing while idle and while pending', async () => {
    verifyMock.mockReturnValue(new Promise(() => {}));
    await mount(docOf([form()]));
    expect(document.querySelector('[data-tone]')).toBeNull();
    fill();
    await submit();
    expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled();
    expect(document.querySelector('[data-tone]')).toBeNull();
  });
  it.each([
    ['authentic', VERIFIED, /authentic product/i, 'success'],
    ['not verified', { status: 'invalid' as const }, /not verified/i, 'danger'],
  ])('%s renders its card', async (_n, outcome, text, tone) => {
    verifyMock.mockResolvedValue(outcome);
    await mount(docOf([form()]));
    fill();
    await submit();
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(document.querySelector(`[data-tone="${tone}"]`)).not.toBeNull();
  });
  it('a connection error renders the warn card', async () => {
    verifyMock.mockRejectedValue(new Error('x'));
    await mount(docOf([form()]));
    fill();
    await submit();
    expect(await screen.findByText(/connection error/i)).toBeInTheDocument();
    expect(document.querySelector('[data-tone="warn"]')).not.toBeNull();
  });
  it('validation errors render inside the form part and nothing is sent', async () => {
    await mount(docOf([form()]));
    await submit();
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(verifyMock).not.toHaveBeenCalled();
  });
});

describe('preview states (no network)', () => {
  const result = { createdAt: '2026-01-15T00:00:00.000Z', expiryDate: '2026-02-15T00:00:00.000Z' };
  it.each([
    ['form', { status: 'idle' as const }, null],
    ['authentic', { status: 'authentic' as const, result: { ...result, expiryDate: '2099-01-15T00:00:00.000Z' } }, 'success'],
    ['expired', { status: 'expired' as const, result }, 'success'],
    ['not-verified', { status: 'not-verified' as const }, 'danger'],
    ['error', { status: 'error' as const }, 'warn'],
  ])('%s', async (_n, fixture, tone) => {
    await mount(docOf([form()]), fixture);
    expect(verifyMock).not.toHaveBeenCalled();
    expect(document.querySelector('[data-tone]')?.getAttribute('data-tone') ?? null).toBe(tone);
    if (_n === 'expired') expect(document.querySelector('p[data-tone="danger"]')).not.toBeNull();
  });
  it('shoppers (no fixture) never preview', async () => {
    await mount(docOf([form()]));
    expect(document.querySelector('[data-tone]')).toBeNull();
  });
});

describe('style per part', () => {
  it('lands on each part root, nothing when unstyled', async () => {
    const bs = { padTop: 'lg' };
    const { container } = await mount(docOf([form({ content: PARTS.map((x) => p(x, x, { blockStyle: bs })) })]));
    const page = container.querySelector('div[class*="page"]')!;
    expect(page.children[0]!.hasAttribute('data-sf-style')).toBe(true);
    expect(page.children[1]!.tagName).toBe('FORM');
    expect(page.children[1]!.hasAttribute('data-sf-style')).toBe(true);
    expect(page.lastElementChild!.hasAttribute('data-sf-style')).toBe(true);
    cleanup();
    const plain = (await mount(docOf([form()]))).container.querySelector('div[class*="page"]')!;
    expect([...plain.children].some((c) => c.hasAttribute('data-sf-style'))).toBe(false);
  });
});

describe('part helper', () => {
  it('part() ids follow partId', async () => {
    expect(part('VerifyBack', 'vf').props.id).toBe(partId('vf', 'VerifyBack'));
  });
});
