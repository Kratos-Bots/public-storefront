import { expect, test, type Page } from '@playwright/test';
import { installMocks, type InstallMocksOptions, type Layout, type MockHandle } from './mocks.ts';
import type { CustomerTicketDetail } from '../web/src/api/support.ts';
import { FIXED_NOW } from './flows.ts';

/**
 * Support tickets as a shopper meets them: asking for help from an order, writing in a thread with a photo, a ticket
 * that stopped taking replies while the tab was open, and the page signed out. Everything runs against the mocked
 * backend (`installMocks({ support })`). Synthetic data only.
 */

const REF = 'K4M2QP';
/** A 1x1 PNG: the smallest thing the composer will accept as a photo. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHP8bJgAAAABJRU5ErkJggg==', 'base64');

interface OpenOptions extends InstallMocksOptions {
  width?: number;
  layout?: Layout;
  path: string;
}

async function open(page: Page, o: OpenOptions): Promise<MockHandle> {
  const { width = 1280, layout = 'storefront', path, session = true, ...rest } = o;
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mocks = await installMocks(page, { layout, session, ...rest });
  await page.goto(o.path);
  return mocks;
}

for (const width of [390, 1280]) {
  test.describe(`support at ${width}px`, () => {
    test('asking for help from an order opens a ticket and lands in its thread', async ({ page }) => {
      const mocks = await open(page, { width, path: `/account/orders/${REF}`, support: {} });
      await page.getByRole('link', { name: 'Get help with this order' }).click();

      await expect(page).toHaveURL(new RegExp(`/support/new\\?order=${REF}$`));
      // The order is the chosen one and names the subject.
      await expect(page.getByRole('radio', { name: new RegExp(REF) })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('textbox', { name: 'Subject' })).toHaveValue(`Order ${REF}`);
      await page.getByRole('textbox', { name: 'Message' }).fill('The parcel arrived with the seal broken.');
      await page.getByRole('button', { name: 'Send' }).click();

      await expect(page).toHaveURL(/\/support\/tickets\/\d+$/);
      await expect(page.getByRole('log')).toContainText('The parcel arrived with the seal broken.');
      await expect(page.getByRole('heading', { level: 1, name: `Order ${REF}` })).toBeVisible();
      expect(mocks.state.support.ticketPosts).toEqual([
        { subject: `Order ${REF}`, body: 'The parcel arrived with the seal broken.', orderReference: REF, files: [] },
      ]);
    });

    test('a reply with a photo shows at once as sending, then as the server stored it', async ({ page }) => {
      const mocks = await open(page, { width, path: '/support/tickets/7', support: { holdMessages: true } });
      const log = page.getByRole('log');
      await expect(log).toContainText('delay at the depot');

      await page.locator('input[type="file"]').setInputFiles({ name: 'seal.png', mimeType: 'image/png', buffer: PNG });
      // A pick is prepared (a big photo brought down to size) before its preview shows.
      await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
      await page.getByRole('textbox', { name: 'Message' }).fill('Here is a photo of the seal.');
      await page.getByRole('button', { name: 'Send' }).click();

      // The optimistic bubble: the text and the local preview, marked as in flight, while the request is still held.
      const sending = log.locator('[data-state="sending"]');
      await expect(sending).toContainText('Here is a photo of the seal.');
      await expect(sending.locator('img')).toHaveAttribute('src', /^blob:/);
      await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('');

      mocks.state.support.releaseMessages();

      // The server's copy replaces it: same text, the stored photo, nothing left in flight and nothing doubled.
      await expect(log.locator('[data-state]')).toHaveCount(0);
      await expect(log.getByText('Here is a photo of the seal.')).toHaveCount(1);
      await expect(log.locator('img[src*="support/attachments/"]')).toHaveCount(1);
      expect(mocks.state.support.messagePosts).toEqual([{ ticketId: 7, body: 'Here is a photo of the seal.', files: ['seal.png'] }]);
    });

    test('a ticket that stopped taking replies offers a new one and carries the refused draft to it', async ({ page }) => {
      const mocks = await open(page, {
        width, path: '/support/tickets/9',
        support: { refuseMessages: { status: 409, error: 'TICKET_CLOSED' } },
      });
      // Still inside the reopen window as far as this tab knows: the reply box is there.
      await expect(page.getByText('This ticket is closed. Replying reopens it.')).toBeVisible();
      await page.getByRole('textbox', { name: 'Message' }).fill('It is still broken, can you look again?');
      await page.getByRole('button', { name: 'Send' }).click();

      // Refused: the reply box gives way to a new ticket, and what was written stays on screen.
      const fresh = page.getByRole('link', { name: 'Open a new ticket' });
      await expect(fresh).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Message' })).toHaveCount(0);
      await expect(page.getByRole('log')).toContainText('It is still broken, can you look again?');

      // That ticket was the only one about this order and it is closed, so the order is chosen and nothing is redirected.
      await fresh.click();
      await expect(page).toHaveURL(new RegExp(`/support/new\\?order=${REF}$`));
      await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('It is still broken, can you look again?');
      expect(mocks.state.support.messagePosts).toHaveLength(1);
    });
  });
}

test('a ticket closed past its reopen window offers a new one from the start, with no reply box to fail in', async ({ page }) => {
  const closed: CustomerTicketDetail = {
    id: 9, subject: `Order ${REF} arrived damaged`, status: 'closed',
    order: { reference: REF, status: 'delivered', createdAt: '2026-08-20T10:00:00Z' },
    timeline: [{ type: 'opened', at: '2026-07-01T09:00:00Z' }, { type: 'closed', at: '2026-07-03T09:00:00Z' }],
    canReply: false, reopenUntil: null, createdAt: '2026-07-01T09:00:00Z',
    messages: [{ id: 21, fromSupport: false, authorLabel: 'Ada', body: 'The box was crushed when it arrived.', attachments: [], createdAt: '2026-07-01T09:00:00Z' }],
  };
  const mocks = await open(page, { path: '/support/tickets/9', support: { tickets: [closed] } });
  await expect(page.getByRole('log')).toContainText('The box was crushed when it arrived.');
  await expect(page.getByText('This ticket is closed.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open a new ticket' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Open a new ticket' }).click();
  await expect(page).toHaveURL(new RegExp(`/support/new\\?order=${REF}$`));
  await expect(page.getByRole('radio', { name: new RegExp(REF) })).toHaveAttribute('aria-checked', 'true');
  expect(mocks.state.support.messagePosts).toEqual([]);
});

test('an order that already has an open ticket goes straight to it', async ({ page }) => {
  const mocks = await open(page, { path: '/account/orders/E2E1', orderFixture: 'shipped', support: {} });
  await page.getByRole('link', { name: 'Get help with this order' }).click();
  await expect(page).toHaveURL(/\/support\/tickets\/7$/);
  await expect(page.getByRole('log')).toContainText('delay at the depot');
  expect(mocks.state.support.ticketPosts).toEqual([]);
});

test('signed out, the support page asks for a sign-in and keeps the shop\'s chat links', async ({ page }) => {
  const mocks = await open(page, { path: '/support', session: false, support: {} });
  await expect(page.getByRole('heading', { level: 1, name: 'Support' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in to open a ticket' })).toHaveAttribute('href', `/login?returnTo=${encodeURIComponent('/support')}`);
  // The page's own contact routes (the footer repeats the chat link, so scope to the section).
  const contact = page.getByLabel('Prefer chat?');
  await expect(contact.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /wa.me/);
  await expect(contact.getByRole('link', { name: 'Contact' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New ticket' })).toHaveCount(0);
  // Nothing of the customer's is asked for.
  expect(mocks.requests().filter((r) => r.includes('support/tickets'))).toEqual([]);
});
