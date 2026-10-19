import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { installMocks, installTelegramStub, type Layout } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';
import type { CustomerTicketDetail } from '../web/src/api/support.ts';

/**
 * Screenshots of a support ticket's conversation for a visual review: templates x layouts at a phone and a desktop
 * width, an open thread with photos and a closed one past its reopen window. Not an assertion suite beyond "no
 * sideways overflow" and "the reply box is on screen", so it only runs when asked:
 * `SUPPORT_THREAD_SHOTS=1 TZ=UTC npx playwright test -c e2e/playwright.config.ts e2e/support-thread-visual.spec.ts`.
 * Synthetic data only.
 */

test.skip(process.env.SUPPORT_THREAD_SHOTS !== '1', 'set SUPPORT_THREAD_SHOTS=1 to capture the support thread screenshots');

const SHOTS = fileURLToPath(new URL('./screenshots/support-thread/', import.meta.url));

const TEMPLATES = [
  { template: 'modern', preset: 'default' },
  { template: 'dark-luxury', preset: 'gold' },
] as const;
const LAYOUTS: Layout[] = ['storefront', 'webapp'];
const WIDTHS = [390, 1280] as const;

const photo = (id: number, width: number, height: number) => ({
  id, width, height, url: `public/storefront/support/attachments/${id}?exp=1&sig=x`,
});

const OPEN: CustomerTicketDetail = {
  id: 7,
  subject: 'Where is my parcel? Tracking has not moved since Monday',
  status: 'waiting_on_customer',
  order: { reference: 'K4M2QP', status: 'shipped', createdAt: '2026-08-20T10:00:00Z' },
  timeline: [{ type: 'opened', at: '2026-08-22T09:12:00Z' }],
  canReply: true,
  reopenUntil: null,
  createdAt: '2026-08-22T09:12:00Z',
  messages: [
    { id: 1, fromSupport: false, authorLabel: 'Ada', body: "Tracking hasn't moved since Monday, is it lost?", attachments: [photo(11, 1200, 1600)], createdAt: '2026-08-22T09:12:00Z' },
    { id: 2, fromSupport: true, authorLabel: 'Support · Example Shop', body: "Hi! It's with the courier, there's a delay at the depot. I've chased it for you and will update you here.", attachments: [], createdAt: '2026-08-22T11:40:00Z' },
    { id: 3, fromSupport: false, authorLabel: 'Ada', body: 'Thanks.', attachments: [], createdAt: '2026-08-22T11:45:00Z' },
    { id: 4, fromSupport: false, authorLabel: 'Ada', body: 'Here is the box from last time, for reference.', attachments: [photo(12, 1600, 1200), photo(13, 1200, 1200), photo(14, 900, 1600)], createdAt: '2026-08-22T11:46:00Z' },
    { id: 5, fromSupport: true, authorLabel: 'Support · Example Shop', body: 'It is moving again: due tomorrow.', attachments: [], createdAt: '2026-08-23T08:05:00Z' },
  ],
};

const EXPIRED: CustomerTicketDetail = {
  ...OPEN,
  status: 'closed',
  canReply: false,
  timeline: [...OPEN.timeline, { type: 'closed', at: '2026-08-23T09:00:00Z' }],
};

async function setup(page: Page, template: string, preset: string, layout: Layout, width: number, ticket: CustomerTicketDetail) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (layout === 'webapp') await installTelegramStub(page);
  const themed = await presetTheme(page, template, preset);
  await installMocks(page, {
    layout, session: true, support: { tickets: [ticket] },
    tweakSettings: themed,
  });
}

async function expectNoOverflow(page: Page): Promise<void> {
  const o = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(o.scroll, 'horizontal overflow').toBeLessThanOrEqual(o.inner);
}

for (const t of TEMPLATES) {
  for (const layout of LAYOUTS) {
    for (const width of WIDTHS) {
      for (const [name, ticket] of [['open', OPEN], ['expired', EXPIRED]] as const) {
        test(`${t.template} ${layout} ${width} ${name}`, async ({ page }) => {
          await setup(page, t.template, t.preset, layout, width, ticket);
          await page.goto('/support/tickets/7');
          await expect(page.getByRole('log')).toContainText('due tomorrow');
          await page.evaluate(() => document.fonts.ready);
          await page.waitForLoadState('networkidle');
          await expectNoOverflow(page);
          if (name === 'open') await expect(page.getByRole('textbox', { name: 'Message' })).toBeInViewport();
          await page.screenshot({ path: `${SHOTS}${t.template}-${layout}-${width}-${name}.png`, animations: 'disabled', caret: 'hide' });
          if (name === 'open') {
            await page.getByRole('textbox', { name: 'Message' }).fill('One more thing: can it go to the neighbour at number 12 if nobody is in?');
            await page.screenshot({ path: `${SHOTS}${t.template}-${layout}-${width}-typing.png`, animations: 'disabled', caret: 'hide' });
          }
        });
      }
    }
  }
}

// A revisit inside the app (chunk loaded, ticket cached) still opens at the newest message, not where the router's
// scroll reset leaves the page.
test('a revisit through the tickets list opens at the newest message', async ({ page }) => {
  await setup(page, 'modern', 'default', 'storefront', 390, OPEN);
  await page.goto('/support/tickets/7');
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeInViewport();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('link', { name: 'Back to support' }).click();
    await page.getByRole('link', { name: /Where is my parcel/ }).click();
    await expect(page.getByRole('log')).toContainText('due tomorrow');
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeInViewport();
    await expect(page.getByText('It is moving again: due tomorrow.')).toBeInViewport();
  }
});
