/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { Suspense, type ReactNode } from 'react';

const h = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('@/api/auth.ts', () => ({ verifyEmail: h.verify }));

import { BLOCKS } from '@/builder/registry.ts';
import { RenderDoc } from '@/builder/render.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { validateDoc } from '@/builder/guard.ts';
import { checkRules } from '@/builder/rules.ts';
import { upgradeDoc } from '@/builder/upgrade.ts';
import { BuilderModeProvider } from '@/builder/mode.ts';
import { partId } from '@/builder/parts.ts';
import { VerifyEmailFamily } from '@/builder/family-verify-email.ts';
import { VERIFY_EMAIL_CONTAINER } from '@/builder/blocks/_shared/verify-email-container.ts';
import { isTextKey, matchesTextPattern, TEXT_ENTRIES } from '@/text/registry.ts';
import { EMPTY_ROOT, type ComponentData, type LayoutKind, type PuckDoc } from '@/builder/types.ts';
import { PASSWORD_PARTS } from './helpers/password-parts.ts';

const PARTS = ['VerifyEmailHeading', 'VerifyEmailStatus'] as const;
const LAYOUTS: LayoutKind[] = ['storefront', 'menu', 'webapp'];
const docOf = (content: ComponentData[]): PuckDoc => ({ root: { props: { ...EMPTY_ROOT } }, content, zones: {} });
const container = (props: Record<string, unknown> = {}): ComponentData => ({ type: 'VerifyEmail', props: { id: 've', ...props } });
const p = (type: string, id = type): ComponentData => ({ type, props: { id } });
const rules = (d: PuckDoc, key: 'verify-email' | 'login' = 'verify-email', layout: LayoutKind = 'storefront') => checkRules(d, key, layout).map((i) => i.rule);

beforeEach(() => { h.verify.mockReset().mockResolvedValue({ ok: true }); });
afterEach(cleanup);

function Wrap({ children, fixture }: { children: ReactNode; fixture?: unknown }) {
  const tree = (
    <MantineProvider env="test"><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/verify-email?token=tok']}>{children}</MemoryRouter>
    </QueryClientProvider></MantineProvider>
  );
  return fixture
    ? <BuilderModeProvider value={{ editing: true, previewAs: null, previewFixtures: { VerifyEmail: fixture } }}>{tree}</BuilderModeProvider>
    : tree;
}
async function mount(doc: PuckDoc, fixture?: unknown) {
  const guarded = validateDoc(doc, 'verify-email', 'storefront').doc!;
  const out = render(<Wrap fixture={fixture}><Suspense fallback={null}><RenderDoc doc={guarded} docKey="verify-email" layout="storefront" /></Suspense></Wrap>);
  await waitFor(() => expect(out.container.querySelector('div[class*="page"]')).not.toBeNull(), { timeout: 30_000 });
  return out;
}

describe('contract', () => {
  it.each(PARTS)('%s: family, style row, never hideable (both parts are required)', (name) => {
    const def = BLOCKS[name]!;
    expect(def.part).toEqual({ family: 'verify-email' });
    expect(def.category).toBe('part');
    expect(def.slots).toEqual([]);
    const row = PASSWORD_PARTS[name]!.style;
    expect(def.style && { target: def.style.target, keys: [...def.style.keys].sort() }).toEqual({ target: row.target, keys: [...row.keys].sort() });
    expect(def.style && def.style.keys).not.toContain('hide');
    expect(name.length).toBeLessThanOrEqual(23);
  });

  it('the container is a route-bound commerce block on the verify-email document only', () => {
    const def = BLOCKS.VerifyEmail!;
    expect(def.routeBound).toBe(true);
    expect(def.category).toBe('commerce');
    expect(def.layouts).toBe('all');
    expect(def.container).toBe(VERIFY_EMAIL_CONTAINER);
    expect(VERIFY_EMAIL_CONTAINER).toMatchObject({ family: 'verify-email', insertSlot: 'content', required: [...PARTS], unique: [...PARTS] });
    expect(rules(docOf([container({ content: PARTS.map((x) => p(x)) })]), 'login')).toContain('placement:VerifyEmail');
  });

  it('PartHost outside a container renders nothing', () => {
    expect(render(<VerifyEmailFamily.PartHost name="VerifyEmailHeading" props={{}} />).container.innerHTML).toBe('');
  });

  it('default ids are unique and at most 64 characters, even for a 64-character container id', () => {
    const slots = VERIFY_EMAIL_CONTAINER.defaultSlots({}, { layout: 'storefront', id: 'x'.repeat(64) }).content!;
    const ids = slots.map((c) => String(c.props.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.max(...ids.map((i) => i.length))).toBeLessThanOrEqual(64);
    expect(slots.map((c) => c.type)).toEqual([...PARTS]);
  });

  it('the default document passes its own rules in every layout', () => {
    for (const l of LAYOUTS) expect(checkRules(defaultDoc('verify-email', l)!, 'verify-email', l)).toEqual([]);
  });

  it('every text pattern the blocks list is a registered key or prefix, and the new keys are all claimed', () => {
    const owners = ['VerifyEmail', ...PARTS];
    for (const name of owners) {
      for (const pattern of BLOCKS[name]!.text ?? []) {
        const ok = pattern.endsWith('.*') ? Object.keys(TEXT_ENTRIES).some((k) => matchesTextPattern(k, pattern)) : isTextKey(pattern);
        expect(ok, `${name}: ${pattern}`).toBe(true);
      }
    }
    const patterns = owners.flatMap((n) => BLOCKS[n]!.text ?? []);
    const unclaimed = Object.keys(TEXT_ENTRIES).filter((k) => k.startsWith('auth.verifyEmail.') && !patterns.some((pt) => matchesTextPattern(k, pt)));
    expect(unclaimed).toEqual([]);
  });

  it('the CSS module reads the block text variables for the TEXT parts', () => {
    const css = readFileSync('src/features/auth/VerifyEmailPage.module.css', 'utf8');
    expect(css).toContain('var(--sf-block-fg,');
    expect(css).toContain('var(--sf-text-scale, 1)');
  });
});

describe('rules', () => {
  const sans = (name: string) => PARTS.filter((x) => x !== name).map((x) => p(x));
  it.each(PARTS)('removing %s is part-required', (name) => {
    expect(rules(docOf([container({ content: sans(name) })]))).toContain(`part-required:VerifyEmail.${name}`);
  });
  it.each(PARTS)('duplicating %s is part-required', (name) => {
    expect(rules(docOf([container({ content: [...PARTS.map((x) => p(x)), p(name, `${name}-2`)] })]))).toContain(`part-required:VerifyEmail.${name}`);
  });
  it('a part outside the container is part-placement', () => {
    expect(rules(docOf([container({ content: PARTS.map((x) => p(x)) }), p('VerifyEmailStatus', 'loose')]))).toContain('part-placement:VerifyEmailStatus');
  });
  it('a part of another family inside the container is refused', () => {
    const r = rules(docOf([container({ content: [...PARTS.map((x) => p(x)), p('LoginMethods', 'lm')] })]));
    expect(r.some((x) => x === 'part-placement:LoginMethods' || x.startsWith('drop:'))).toBe(true);
  });
  it('the document needs exactly one container', () => {
    expect(rules(docOf([]))).toContain('exactly-one:VerifyEmail');
  });
});

describe('upgrade of a stored container with absent slots', () => {
  it('is filled from defaultSlots and the guard raises no part issue', () => {
    const stored = docOf([container()]);
    const out = upgradeDoc(stored, 'verify-email', 'storefront');
    expect((out.content[0]!.props.content as ComponentData[]).map((c) => c.props.id)).toEqual(PARTS.map((x) => partId('ve', x)));
    expect(validateDoc(stored, 'verify-email', 'storefront').issues.filter((i) => i.rule.startsWith('part-'))).toEqual([]);
  });
});

describe('rendering', () => {
  it('the default document renders the heading and confirms a good token', async () => {
    await mount(defaultDoc('verify-email', 'storefront')!);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Confirm your email');
    expect(await screen.findByText('Email confirmed')).toBeTruthy();
    expect(h.verify).toHaveBeenCalledTimes(1);
  });

  it('an arrangement with the status above the heading still confirms', async () => {
    await mount(docOf([container({ content: [p('VerifyEmailStatus'), p('VerifyEmailHeading')] })]));
    expect(await screen.findByText('Email confirmed')).toBeTruthy();
  });

  it.each([
    ['done', 'Email confirmed'], ['invalid', 'This link has expired'],
    ['otherAccount', 'This link is for a different account'], ['error', 'We couldn’t confirm your email'],
  ])('the editor previews the %s state from a fixture and never calls the backend', async (phase, title) => {
    await mount(defaultDoc('verify-email', 'storefront')!, { phase });
    expect(screen.getByText(title)).toBeTruthy();
    expect(h.verify).not.toHaveBeenCalled();
  });
});
