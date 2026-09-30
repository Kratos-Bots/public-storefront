import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { z } from 'zod';
import { installMocks, ORIGIN, type MockHandle } from './mocks.ts';
import { checkoutWithoutFlowSet } from './page-sets.ts';

/**
 * The page builder, framed exactly as the admin frames it (spec §6, §13 A6): a page on ANOTHER
 * origin holds the editor in an iframe, speaks the postMessage protocol, and checks every message
 * the editor sends against the admin's own zod shapes (mirrored below from the admin's
 * src/features/storefront-settings/pages/protocol.ts — keep the two in step).
 */

const ADMIN = 'http://admin.shop.example';
const SHOTS = fileURLToPath(new URL('./screenshots/builder-editor/', import.meta.url));
const MEDIA_URL = `/media/storefront-pages/media/${'b'.repeat(32)}.png`;

// ---- the admin's inbound schema (mirror) -------------------------------------------------------

const LOAD_ID_MAX = 64;
const docSchema = z.looseObject({
  root: z.looseObject({ props: z.record(z.string(), z.unknown()) }),
  content: z.array(z.unknown()),
});
const pageSetSchema = z.looseObject({
  schemaVersion: z.literal(1),
  shell: docSchema,
  pages: z.record(z.string(), docSchema),
});
const issueSchema = z.looseObject({
  docKey: z.string(),
  rule: z.string(),
  message: z.string(),
  blockId: z.string().optional(),
});
// The recorder below turns a File into this marker (a File can't leave the page); `isFile` is the
// admin's `z.instanceof(File)`, evaluated in the parent page.
const fileMarker = z.object({ isFile: z.literal(true), name: z.string(), type: z.string(), size: z.number() });
const adminInbound = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sf-builder-ready'), protocol: z.literal(1) }),
  z.object({ type: z.literal('sf-builder-change'), loadId: z.string().min(1).max(LOAD_ID_MAX), pageSet: pageSetSchema, issues: z.array(issueSchema).max(500) }),
  z.object({ type: z.literal('sf-builder-upload-request'), requestId: z.string().min(1).max(100), file: fileMarker }),
  z.object({ type: z.literal('sf-builder-viewport'), width: z.union([z.literal(360), z.literal(768), z.literal(1280), z.null()]) }),
]);

// ---- the stand-in admin page -------------------------------------------------------------------

/**
 * Records every message from the frame (source AND origin checked, as the admin does), answers
 * upload requests with a stored-media URL, and can add a probe frame of the storefront origin to
 * read that origin's real Web Storage (the editor frame shadows its own storage globals).
 */
function parentHtml(width: number): string {
  return `<!doctype html><html><body style="margin:0;background:#dde1e6">
<iframe id="sf" src="${ORIGIN}/__builder?sf-builder=1" style="display:block;width:${width}px;height:900px;border:0"></iframe>
<script>
  window.__msgs = [];
  window.__uploadUrl = ${JSON.stringify(MEDIA_URL)};
  var frame = document.getElementById('sf');
  window.addEventListener('message', function (e) {
    if (e.source !== frame.contentWindow || e.origin !== '${ORIGIN}') return;
    var d = e.data;
    if (d && d.type === 'sf-builder-upload-request') {
      var f = d.file;
      window.__msgs.push({ type: d.type, requestId: d.requestId, file: { isFile: f instanceof File, name: f && f.name, type: f && f.type, size: f && f.size } });
      frame.contentWindow.postMessage({ type: 'sf-builder-upload-result', requestId: d.requestId, url: window.__uploadUrl, error: null }, '${ORIGIN}');
      return;
    }
    window.__msgs.push(d);
    if (d && d.type === 'sf-builder-viewport') frame.style.width = d.width === null ? '${width}px' : d.width + 'px';
  });
  window.__post = function (msg) { frame.contentWindow.postMessage(msg, '${ORIGIN}'); };
  window.__probe = function () {
    return new Promise(function (resolve) {
      var p = document.createElement('iframe');
      p.style.display = 'none';
      p.onload = function () { resolve(true); };
      p.src = '${ORIGIN}/templates.json?probe=' + Date.now();
      document.body.appendChild(p);
    });
  };
</script></body></html>`;
}

const settings = JSON.parse(readFileSync(new URL('./fixtures/settings.storefront.json', import.meta.url), 'utf8')) as { theme: Record<string, unknown> };
// The admin never sends customCss (its PreviewTheme has none).
const THEME = (() => {
  const t = { ...settings.theme };
  delete t.customCss;
  return t;
})();

type PageSetMsg = { schemaVersion: number; shell: unknown; pages: Record<string, unknown> };
type Msg = { type: string; loadId?: string; pageSet?: PageSetMsg; issues?: Array<{ docKey: string; rule: string; blockId?: string }>; width?: number | null; protocol?: number };

const allMessages = (page: Page) => page.evaluate(() => (window as unknown as { __msgs: Msg[] }).__msgs);
const messages = async (page: Page, type: string) => (await allMessages(page)).filter((m) => m.type === type);
const changesFor = async (page: Page, loadId: string) => (await messages(page, 'sf-builder-change')).filter((m) => m.loadId === loadId);
const post = (page: Page, msg: unknown) => page.evaluate((m) => (window as unknown as { __post: (x: unknown) => void }).__post(m), msg);

let loadSeq = 0;
function load(extra: Record<string, unknown> = {}) {
  loadSeq += 1;
  return { type: 'sf-builder-load', protocol: 1, loadId: `load-${loadSeq}-${Date.now().toString(36)}`, layout: 'storefront', pageSet: null, theme: THEME, readOnly: false, ...extra } as {
    type: 'sf-builder-load'; loadId: string; readOnly: boolean; layout: string; pageSet: unknown;
  };
}

/** Every message the editor sent must be one the admin accepts. */
async function expectAdminAccepts(page: Page) {
  for (const m of await allMessages(page)) {
    const r = adminInbound.safeParse(m);
    expect(r.success, `admin would reject ${JSON.stringify(m).slice(0, 300)}: ${r.success ? '' : r.error.message}`).toBe(true);
  }
}

/** Requests only the editor chunk makes (dev-server module paths and Puck's prebundle). */
const isEditorCode = (url: string) => url.includes('/src/builder/editor/') || url.includes('@puckeditor');

interface Framed { frame: FrameLocator; mocks: MockHandle; thirdParty: string[]; editorCode: string[] }

async function openFramed(page: Page, width = 1440): Promise<Framed> {
  const mocks = await installMocks(page);
  // Registered after installMocks' catch-all abort, so it takes precedence for the admin origin.
  await page.route(`${ADMIN}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: parentHtml(width) }));
  const thirdParty: string[] = [];
  const editorCode: string[] = [];
  page.on('request', (r) => {
    if (isEditorCode(r.url())) editorCode.push(r.url());
    if (!r.url().startsWith(`${ORIGIN}/`) && !r.url().startsWith(`${ADMIN}/`) && !r.url().startsWith('data:')) thirdParty.push(r.url());
  });
  await page.setViewportSize({ width: Math.max(width, 1280) + 40, height: 940 });
  await page.goto(`${ADMIN}/pages`);
  await expect.poll(async () => (await messages(page, 'sf-builder-ready')).length, { timeout: 30_000 }).toBeGreaterThan(0);
  return { frame: page.frameLocator('#sf'), mocks, thirdParty, editorCode };
}

/** Load, and wait for the editor to be up (the baseline change, or the read-only badge). */
async function loadAndWait(page: Page, frame: FrameLocator, msg: ReturnType<typeof load>) {
  await post(page, msg);
  if (msg.readOnly) await expect(frame.getByText('Published version · read only')).toBeVisible();
  else {
    await expect.poll(async () => (await changesFor(page, msg.loadId)).length).toBe(1);
    await expect(frame.getByRole('button', { name: 'Add block' })).toBeVisible();
    await expect(frame.locator('[data-puck-component]').first()).toBeVisible();
  }
}

async function addBlock(frame: FrameLocator, name: string) {
  await frame.getByRole('button', { name: 'Add block' }).click();
  const menu = frame.getByRole('menu', { name: 'Blocks to add' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name, exact: true }).click();
}

const lastPage = async (page: Page, loadId: string, docKey: string) =>
  JSON.stringify((await changesFor(page, loadId)).at(-1)?.pageSet?.pages[docKey] ?? null);

// The stand-in admin is served by page.route, which Chromium treats as a public address; framing
// the dev server (loopback) from it would trip Local Network Access. In production both ends are
// public, so the check doesn't apply there.
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] } });

test.describe('page builder editor · protocol', () => {
  test('ready once; a load gets one baseline change then the viewport; Add block reports a Heading', async ({ page }) => {
    const { frame, thirdParty, editorCode } = await openFramed(page);
    const msg = load();
    await loadAndWait(page, frame, msg);

    // Settle past the debounce: still exactly one change for this load.
    await page.waitForTimeout(1_200);
    const all = await allMessages(page);
    expect(all.filter((m) => m.type === 'sf-builder-ready')).toEqual([{ type: 'sf-builder-ready', protocol: 1 }]);
    const baseline = await changesFor(page, msg.loadId);
    expect(baseline).toHaveLength(1);
    expect(baseline[0]!.pageSet).toMatchObject({ schemaVersion: 1, pages: {} });
    expect(baseline[0]!.pageSet!.shell).toBeTruthy();
    expect(baseline[0]!.issues).toEqual([]);
    // Order: ready, the baseline change, then the viewport (Fit = null).
    expect(all.map((m) => m.type)).toEqual(['sf-builder-ready', 'sf-builder-change', 'sf-builder-viewport']);
    expect(all[2]).toEqual({ type: 'sf-builder-viewport', width: null });

    await expect(frame.getByLabel('Page', { exact: true })).toHaveValue('catalog');
    await addBlock(frame, 'Heading');
    await expect.poll(() => lastPage(page, msg.loadId, 'catalog')).toContain('"type":"Heading"');
    expect((await messages(page, 'sf-builder-change')).every((m) => m.loadId === msg.loadId)).toBe(true);
    await expectAdminAccepts(page);
    // The editor frame fetches nothing from third parties (Puck's stock CSS imports a web font).
    expect(thirdParty).toEqual([]);
    // Positive control for the gate tests: framed, the editor's own modules and Puck do load.
    expect(editorCode.some((u) => u.includes('/src/builder/editor/EditorApp.tsx'))).toBe(true);
    expect(editorCode.some((u) => u.includes('@puckeditor'))).toBe(true);
  });

  test('a new load drops the change still debouncing from the old one', async ({ page }) => {
    const { frame } = await openFramed(page);
    const first = load();
    await loadAndWait(page, frame, first);

    // Add a block (on the canvas, so its change is now debouncing), then switch layout before
    // the 500 ms debounce can fire.
    await addBlock(frame, 'Heading');
    await expect(frame.locator('[data-sf-builder-canvas] [data-sf-block="Heading"]')).toBeVisible();
    const second = load({ layout: 'menu' });
    await post(page, second);
    await expect.poll(async () => (await changesFor(page, second.loadId)).length).toBe(1);
    await page.waitForTimeout(1_500);
    // Load B is answered like any load: its baseline, then the viewport, and nothing else.
    const tail = await allMessages(page);
    const at = tail.findIndex((m) => m.type === 'sf-builder-change' && m.loadId === second.loadId);
    expect(tail.slice(at + 1)).toEqual([{ type: 'sf-builder-viewport', width: null }]);

    // The Heading's change was still debouncing: it was dropped, not sent under either load.
    expect(JSON.stringify(await changesFor(page, first.loadId))).not.toContain('"type":"Heading"');
    const underSecond = await changesFor(page, second.loadId);
    expect(underSecond).toHaveLength(1);
    expect(JSON.stringify(underSecond[0]!.pageSet)).not.toContain('"type":"Heading"');
    expect(underSecond[0]!.pageSet!.pages).toEqual({});
    // Nothing after the second load carries the first load's id either.
    const all = await allMessages(page);
    const secondAt = all.findIndex((m) => m.type === 'sf-builder-change' && m.loadId === second.loadId);
    expect(all.slice(secondAt).filter((m) => m.type === 'sf-builder-change' && m.loadId !== second.loadId)).toEqual([]);
    await expectAdminAccepts(page);
  });

  test('a read-only load renders the page and never reports changes', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load({ readOnly: true });
    await loadAndWait(page, frame, msg);
    await expect(frame.getByRole('button', { name: 'Add block' })).toHaveCount(0);
    await page.waitForTimeout(1_500);
    expect(await messages(page, 'sf-builder-change')).toHaveLength(0);
    // The viewport still goes out after a read-only load.
    expect(await messages(page, 'sf-builder-viewport')).toEqual([{ type: 'sf-builder-viewport', width: null }]);
    await expectAdminAccepts(page);
  });

  test('a width preset resizes the frame and shows the exact page; Back to editing restores the editor', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load();
    await loadAndWait(page, frame, msg);
    await expect.poll(async () => (await messages(page, 'sf-builder-viewport')).map((m) => m.width)).toEqual([null]);

    // Something to come back to: a Heading, with undo history.
    await addBlock(frame, 'Heading');
    const heading = frame.locator('[data-sf-builder-canvas] [data-sf-block="Heading"]');
    await expect(heading).toBeVisible();
    await expect(frame.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await expect.poll(() => lastPage(page, msg.loadId, 'catalog')).toContain('"type":"Heading"');
    const changesBefore = (await changesFor(page, msg.loadId)).length;

    const widths = frame.getByRole('group', { name: 'Preview width' });
    await widths.getByRole('button', { name: 'Tablet' }).click();
    await expect.poll(async () => (await messages(page, 'sf-builder-viewport')).at(-1)).toEqual({ type: 'sf-builder-viewport', width: 768 });
    // The stand-in admin resizes the frame, as the real one does.
    await expect.poll(() => page.locator('#sf').evaluate((el) => el.getBoundingClientRect().width)).toBe(768);
    const bar = frame.getByRole('region', { name: 'Exact preview' });
    await expect(bar).toContainText('Previewing at 768 px');
    // No Puck chrome: no header controls, no sidebars or rail; the page fills the frame.
    await expect(frame.getByRole('button', { name: 'Add block' })).toBeHidden();
    await expect(frame.getByRole('button', { name: 'Blocks panel' })).toBeHidden();
    await expect(frame.getByRole('button', { name: 'Outline' })).toBeHidden();
    const preview = frame.locator('[data-sf-builder-exact="768"]');
    await expect(preview).toBeVisible();
    expect(await preview.evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(768);
    expect(await preview.evaluate(() => window.innerWidth)).toBe(768);
    // The draft, through the shop's own shell: its header, the new Heading inside <main>, no Puck wrappers.
    await expect(preview.locator('header').first()).toBeVisible();
    await expect(preview.locator('main [data-sf-block="Heading"]')).toBeVisible();
    await expect(preview.locator('[data-puck-component]')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}exact-preview-768.png` });

    // The Heading is still selected on the hidden canvas, and "Back to editing" has focus: Puck's
    // delete and undo hotkeys must not reach it.
    const backButton = bar.getByRole('button', { name: 'Back to editing' });
    await expect(backButton).toBeFocused();
    await backButton.press('Backspace');
    await backButton.press('Delete');
    await backButton.press('Control+z');

    await bar.getByRole('button', { name: 'Back to editing' }).click();
    await expect.poll(async () => (await messages(page, 'sf-builder-viewport')).at(-1)).toEqual({ type: 'sf-builder-viewport', width: null });
    await expect(frame.getByRole('button', { name: 'Add block' })).toBeVisible();
    await expect(bar).toBeHidden();
    // The same canvas: the Heading is still there and still undoable; Fit is pressed.
    await expect(heading).toBeVisible();
    await expect(frame.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await expect(widths.getByRole('button', { name: 'Fit' })).toHaveAttribute('aria-pressed', 'true');
    // Previewing posted no change.
    await page.waitForTimeout(800);
    expect((await changesFor(page, msg.loadId)).length).toBe(changesBefore);

    // Phone: 360 on the way in, null on the way out.
    await widths.getByRole('button', { name: 'Phone' }).click();
    await expect.poll(async () => (await messages(page, 'sf-builder-viewport')).at(-1)).toEqual({ type: 'sf-builder-viewport', width: 360 });
    await expect(frame.getByRole('region', { name: 'Exact preview' })).toContainText('Previewing at 360 px');
    await page.screenshot({ path: `${SHOTS}exact-preview-360.png` });
    await frame.getByRole('button', { name: 'Back to editing' }).click();
    await expect.poll(async () => (await messages(page, 'sf-builder-viewport')).at(-1)).toEqual({ type: 'sf-builder-viewport', width: null });
    await expectAdminAccepts(page);
  });

  test('an image upload goes through the admin and lands in the Image block', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load();
    await loadAndWait(page, frame, msg);
    await addBlock(frame, 'Image');
    // The Image block shows only once it has alt text.
    await frame.getByRole('textbox', { name: 'Alt' }).fill('A crate of Northbound Supply jars');
    await frame.getByLabel('Upload image').locator('visible=true').setInputFiles({ name: 'crate.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') });

    await expect.poll(async () => (await messages(page, 'sf-builder-upload-request')).length).toBe(1);
    const [request] = await messages(page, 'sf-builder-upload-request');
    expect(request).toMatchObject({ file: { isFile: true, name: 'crate.png', type: 'image/png' } });
    await expect.poll(() => lastPage(page, msg.loadId, 'catalog')).toContain(MEDIA_URL);
    await expect(frame.locator(`[data-sf-builder-canvas] img[src="${MEDIA_URL}"]`)).toBeVisible();
    await expectAdminAccepts(page);
  });
});

/** What the storefront origin's real Web Storage holds, read from a sibling frame (same partition). */
async function realStorage(page: Page): Promise<{ local: string[]; session: string[] }> {
  await page.evaluate(() => (window as unknown as { __probe: () => Promise<unknown> }).__probe());
  const probe = page.frames().filter((f) => f.url().includes('/templates.json?probe=')).at(-1)!;
  return probe.evaluate(() => ({ local: Object.keys(window.localStorage), session: Object.keys(window.sessionStorage) }));
}

/** Width of Puck's canvas column (between the two sidebars). */
const canvasWidth = (frame: FrameLocator) =>
  frame.locator('[class*="PuckCanvas-root"], [class*="_PuckCanvas_"]').first().evaluate((el) => el.getBoundingClientRect().width);

test.describe('page builder editor · fixture mode', () => {
  test('Preview as shows fixture orders; mutations are preview-only, never sent, never stored', async ({ page }) => {
    const { frame, mocks } = await openFramed(page);
    const mutations: string[] = [];
    page.on('request', (r) => {
      if (r.url().startsWith(`${ORIGIN}/api/`) && r.method() !== 'GET') mutations.push(`${r.method()} ${r.url()}`);
    });
    const before = await realStorage(page);
    expect(before).toEqual({ local: [], session: [] });

    await loadAndWait(page, frame, load());
    const as = frame.getByLabel('Preview as — session');
    await as.selectOption('signed-in');
    await frame.getByLabel('Page', { exact: true }).selectOption('account.orders');
    await expect(frame.getByText('NB1042')).toHaveCount(0);
    await as.selectOption('signed-in-orders');
    await expect(frame.getByText('NB1042').first()).toBeVisible();
    await expect(frame.getByText('NB0977').first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}fixture-orders.png` });

    // On the canvas Puck owns the pointer (blocks are for selecting, not clicking), so a shopper
    // action is tried where it can be clicked: the read-only view of the published version.
    await post(page, load({ readOnly: true }));
    await expect(frame.getByText('Published version · read only')).toBeVisible();
    await frame.getByLabel('Page', { exact: true }).selectOption('catalog');
    await frame.locator('[data-sf-builder-canvas]').getByRole('button', { name: /^Add — / }).first().click();
    await expect(frame.getByText('Preview only — nothing was sent.')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}fixture-preview-only.png` });

    await page.waitForTimeout(800);
    expect(mutations).toEqual([]);
    expect(mocks.requests().filter((r) => !r.startsWith('GET '))).toEqual([]);
    // No shopper data from the fixtures reached the live shop's API.
    expect(mocks.requests().filter((r) => /storefront\/(orders|profile|cart)/.test(r))).toEqual([]);
    expect(await realStorage(page)).toEqual({ local: [], session: [] });
  });
});

test.describe('page builder editor · fixture checkout', () => {
  test('placing an order in the preview is refused on the spot and nothing is posted', async ({ page }) => {
    const { frame, mocks } = await openFramed(page);
    const mutations: string[] = [];
    page.on('request', (r) => {
      if (r.url().startsWith(`${ORIGIN}/api/`) && r.method() !== 'GET') mutations.push(`${r.method()} ${r.url()}`);
    });
    // Read-only: on the editing canvas Puck owns the pointer, so the checkout is clicked here.
    await post(page, load({ readOnly: true }));
    await expect(frame.getByText('Published version · read only')).toBeVisible();
    await frame.getByLabel('Preview as — cart').selectOption('items');
    await frame.getByLabel('Page', { exact: true }).selectOption('checkout');

    const next = () => frame.getByRole('button', { name: 'Continue' }).click();
    await frame.getByRole('textbox', { name: 'First name' }).fill('Ada');
    await frame.getByRole('textbox', { name: 'Surname' }).fill('Sterling');
    await frame.getByRole('textbox', { name: 'Email' }).fill('ada@example.invalid');
    await next();
    await frame.getByRole('textbox', { name: 'Address line 1' }).fill('14 Kirkgate');
    await frame.getByRole('textbox', { name: 'City' }).fill('Leeds');
    await frame.getByRole('textbox', { name: 'ZIP / Postcode' }).fill('LS1 6BY');
    await next();
    await frame.getByText('Tracked 24').click();
    await next();
    await frame.locator('label').filter({ hasText: 'Bank transfer' }).first().click();
    await next();

    await frame.getByRole('button', { name: /^Place order/ }).click();
    // The toast, and the checkout's own error line with the same words.
    const toast = frame.locator('#sf-builder-preview-only');
    await expect(toast).toContainText('Preview only — nothing was sent.');
    await expect(frame.locator('#root').getByText('Preview only — nothing was sent.')).toBeVisible();
    // At the bottom of the frame, clear of the sticky bar at the top.
    expect((await toast.boundingBox())!.y).toBeGreaterThan(450);
    await page.screenshot({ path: `${SHOTS}fixture-place-order.png` });

    await page.waitForTimeout(800);
    // The quote is answered from fixtures inside the frame: nothing, least of all a checkout POST, leaves it.
    expect(mutations).toEqual([]);
    expect(mocks.requests().filter((r) => !r.startsWith('GET '))).toEqual([]);
  });
});

test.describe('page builder editor · issues and chrome', () => {
  test('a checkout without CheckoutFlow is an issue; issue and lock marks show at rest', async ({ page }) => {
    const { frame } = await openFramed(page);
    const set = checkoutWithoutFlowSet();
    // A block that may only sit on account pages: a placement issue tied to a block.
    set.pages.checkout!.content.push({ type: 'AccountNav', props: { id: 'misplaced-nav' } });
    const msg = load({ pageSet: set });
    await loadAndWait(page, frame, msg);

    const [baseline] = await changesFor(page, msg.loadId);
    const issues = baseline!.issues!;
    expect(issues.some((i) => i.docKey === 'checkout' && i.rule.includes('CheckoutFlow'))).toBe(true);
    expect(issues.some((i) => i.docKey === 'checkout' && i.blockId === 'misplaced-nav')).toBe(true);
    expect(issues.every((i) => !i.rule.startsWith('drop:'))).toBe(true);
    const count = issues.length;
    await expect(frame.getByRole('button', { name: new RegExp(`^Issues ${count} issues?, publishing is blocked`) })).toBeVisible();

    await frame.getByLabel('Page', { exact: true }).selectOption('checkout');
    await page.mouse.move(2, 2);
    const nav = frame.locator('[data-sf-builder-canvas] [data-puck-component="misplaced-nav"]');
    await expect(nav).toHaveCSS('outline-style', 'dashed');
    await expect(nav).toHaveCSS('outline-width', '2px');
    await page.screenshot({ path: `${SHOTS}issues-checkout.png` });

    // An exactly-one route block is locked on its page, and marked without hovering.
    await frame.getByLabel('Page', { exact: true }).selectOption('account.orders');
    await page.mouse.move(2, 2);
    const orders = frame.locator('[data-sf-builder-canvas] [data-puck-component="OrdersList-default"]');
    await expect(orders).toHaveCSS('outline-style', 'dashed');
    await expect(orders).toHaveCSS('outline-width', '1px');
    await page.screenshot({ path: `${SHOTS}lock-account-orders.png` });

    await frame.getByRole('button', { name: /^Issues/ }).click();
    const panel = frame.getByRole('dialog', { name: 'Fix these to publish' });
    await expect(panel).toBeVisible();
    await page.screenshot({ path: `${SHOTS}issues-panel.png` });
  });

  for (const width of [768, 1280]) {
    test(`at a ${width}px frame the sidebars leave a usable canvas`, async ({ page }) => {
      const { frame } = await openFramed(page, width);
      await loadAndWait(page, frame, load());
      await page.mouse.move(2, 2);
      await page.screenshot({ path: `${SHOTS}chrome-${width}.png` });

      const blocks = frame.getByRole('button', { name: 'Blocks panel' });
      const settingsPanel = frame.getByRole('button', { name: 'Settings panel' });
      // A narrow frame opens with the Blocks panel closed (both open left ~200 px of canvas at 768).
      await expect(blocks).toHaveAttribute('aria-pressed', width >= 1024 ? 'true' : 'false');
      await expect(settingsPanel).toHaveAttribute('aria-pressed', 'true');
      const atOpen = await canvasWidth(frame);
      expect(atOpen, 'canvas as opened').toBeGreaterThanOrEqual(width >= 1280 ? 600 : 400);

      // The toggles work both ways, and closing the settings panel widens the canvas.
      await settingsPanel.click();
      await expect(settingsPanel).toHaveAttribute('aria-pressed', 'false');
      await expect.poll(() => canvasWidth(frame)).toBeGreaterThan(atOpen);
      await blocks.click();
      await expect(blocks).toHaveAttribute('aria-pressed', width >= 1024 ? 'false' : 'true');
      await page.screenshot({ path: `${SHOTS}chrome-${width}-toggled.png` });
      await settingsPanel.click();
      await expect(settingsPanel).toHaveAttribute('aria-pressed', 'true');
      if (width < 1024) await expect(frame.getByText('Testimonial', { exact: true }).first()).toBeVisible();
    });
  }
});

test.describe('page builder editor · final review fixes', () => {
  test('the richtext toolbar offers only what the sanitiser keeps', async ({ page }) => {
    const { frame } = await openFramed(page);
    await loadAndWait(page, frame, load());
    await addBlock(frame, 'Text');
    const menu = frame.locator('[class*="RichTextMenu"]').locator('visible=true').first();
    await expect(menu).toBeVisible();
    for (const name of ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Inline code', 'Blockquote'])
      await expect(menu.getByRole('button', { name, exact: true })).toBeVisible();
    // Heading and list selects only: no alignment select (the sanitiser drops style="text-align").
    await expect(menu.getByRole('button', { name: 'Select', exact: true })).toHaveCount(2);
    const options = frame.locator('ul[data-puck-rte-menu]').locator('visible=true');
    // Puck swaps its lazy-loaded heading select in after first paint, which can close a popover
    // opened during the swap: open it until its whole option list reads back in one go.
    await expect(async () => {
      if ((await options.count()) === 0) await menu.getByRole('button', { name: 'Select', exact: true }).first().click();
      const labels = (await options.first().locator('li').allInnerTexts()).map((t) => t.trim());
      expect(labels.filter((t) => /^Heading/.test(t))).toEqual(['Heading 2', 'Heading 3', 'Heading 4']);
    }).toPass({ timeout: 15_000 });
    await expect(frame.getByText('Align left', { exact: true })).toHaveCount(0);
  });

  test('an edit is sent the moment the owner clicks into the admin, not 500 ms later', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load();
    await loadAndWait(page, frame, msg);
    await addBlock(frame, 'Heading');
    await expect.poll(() => lastPage(page, msg.loadId, 'catalog')).toContain('"type":"Heading"');
    await frame.getByRole('textbox', { name: 'Text' }).fill('Flushed on blur');
    const typed = Date.now();
    // Click the admin page outside the frame: the frame window blurs.
    await page.mouse.click(1470, 920);
    await expect.poll(() => lastPage(page, msg.loadId, 'catalog'), { timeout: 400, intervals: [25] }).toContain('Flushed on blur');
    expect(Date.now() - typed).toBeLessThan(500);
    await expectAdminAccepts(page);
  });
});

test.describe('page builder editor · list items', () => {
  // The renderer drops list rows that fail the schema (empty question / label), so a blank new
  // row would be invisible on the canvas. New rows start filled in instead (fields/FAQ.ts, NavLinks.ts).
  const addRow = (frame: FrameLocator) => frame.locator('[class*="ArrayField-addButton"]').locator('visible=true').click();

  test('a new FAQ question shows on the canvas straight away', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load();
    await loadAndWait(page, frame, msg);
    await addBlock(frame, 'FAQ');
    const faq = frame.locator('[data-sf-builder-canvas] [data-sf-block="FAQ"]');
    await expect(faq.locator('details')).toHaveCount(1);
    await addRow(frame);
    await expect(faq.locator('details')).toHaveCount(2);
    await expect(faq.getByText('New question')).toBeVisible();
    await expect.poll(() => lastPage(page, msg.loadId, 'catalog')).toContain('"question":"New question"');
    expect(await lastPage(page, msg.loadId, 'catalog')).not.toContain('"question":""');
    await faq.scrollIntoViewIfNeeded();
    await page.mouse.move(2, 2);
    await page.screenshot({ path: `${SHOTS}faq-new-row.png` });
  });

  test('a new header link shows on the canvas straight away', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load();
    await loadAndWait(page, frame, msg);
    await frame.getByLabel('Page', { exact: true }).selectOption('shell');
    await addBlock(frame, 'Links');
    const links = frame.locator('[data-sf-builder-canvas] [data-sf-block="NavLinks"]').last();
    await expect(links.getByRole('link')).toHaveCount(1);
    await addRow(frame);
    await expect(links.getByRole('link')).toHaveCount(2);
    await expect(links.getByRole('link', { name: 'New link' })).toBeVisible();
    await expect.poll(async () => JSON.stringify((await changesFor(page, msg.loadId)).at(-1)?.pageSet?.shell ?? null)).toContain('"label":"New link"');
  });
});

test.describe('page builder gate', () => {
  for (const path of ['/__builder', '/__builder?sf-builder=1']) {
    test(`${path} outside a frame redirects to / without loading the editor`, async ({ page }) => {
      await installMocks(page);
      const editor: string[] = [];
      page.on('request', (r) => {
        if (isEditorCode(r.url())) editor.push(r.url());
      });
      await page.goto(path);
      await expect(page).toHaveURL(`${ORIGIN}/`);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(editor).toEqual([]);
    });
  }
});
