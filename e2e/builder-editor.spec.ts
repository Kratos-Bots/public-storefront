import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expect, test, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { z } from 'zod';
import { installMocks, ORIGIN, type MockHandle } from './mocks.ts';
import { checkoutWithoutFlowSet, editorStyleSet, legacyProductSet, menuSheetSet, productPartsSet, storySet, tileDesignSet } from './page-sets.ts';

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
const textIssueSchema = z.object({ scope: z.enum(['shared', 'layout']), key: z.string(), rule: z.string(), message: z.string() });
const siteTextSchema = z.looseObject({
  schemaVersion: z.literal(1),
  language: z.looseObject({ locale: z.string(), formatLocale: z.string() }),
  strings: z.record(z.string(), z.record(z.string(), z.unknown())),
});
const adminInbound = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sf-builder-ready'), protocol: z.literal(1) }),
  z.object({ type: z.literal('sf-builder-change'), loadId: z.string().min(1).max(LOAD_ID_MAX), pageSet: pageSetSchema, issues: z.array(issueSchema).max(500),
    siteText: siteTextSchema.optional(), textIssues: z.array(textIssueSchema).max(500) }),
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

type TextStrings = { strings: Record<string, Record<string, unknown>> };
type PageSetMsg = { schemaVersion: number; shell: unknown; pages: Record<string, unknown>; text?: TextStrings };
type Msg = {
  type: string; loadId?: string; pageSet?: PageSetMsg; issues?: Array<{ docKey: string; rule: string; blockId?: string }>; width?: number | null; protocol?: number;
  siteText?: TextStrings; textIssues?: Array<{ scope: string; key: string; rule: string }>;
};

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

  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true, isMobile: true });

    test('at a phone-width frame every header control is a 44px target', async ({ page }) => {
      const { frame } = await openFramed(page, 360);
      await loadAndWait(page, frame, load());
      const header = frame.locator('[data-sf-builder-header]');
      expect(await header.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      const small = await header.evaluate((el) =>
        [...el.querySelectorAll<HTMLElement>('button, select, input')]
          .map((c) => ({ c, b: c.getBoundingClientRect() }))
          .filter(({ b }) => b.width > 0 && (b.width < 44 || b.height < 44))
          .map(({ c, b }) => `${c.getAttribute('aria-label') ?? c.textContent?.trim()} ${Math.round(b.width)}×${Math.round(b.height)}`));
      expect(small).toEqual([]);
      // Bigger targets wrap onto more rows; the header never gets wider than the frame.
      expect(await header.evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(360);
    });
  });
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

test.describe('page builder editor · text', () => {
  const KEY = 'catalog.search.placeholder';
  const DEFAULT = 'Search products';
  const canvasSearch = (frame: FrameLocator, placeholder: string) =>
    frame.locator(`[data-sf-builder-canvas] input[placeholder="${placeholder}"]`).first();

  async function openText(frame: FrameLocator) {
    await frame.getByLabel('Page', { exact: true }).selectOption('shell');
    await expect(canvasSearch(frame, DEFAULT)).toBeVisible();
    // In the header: Puck's block drawer also has a "Text" (rich text) item with role="button".
    await frame.locator('[data-sf-builder-header]').getByRole('button', { name: 'Text', exact: true }).click();
    const panel = frame.getByRole('region', { name: 'Site text' });
    await panel.getByRole('searchbox', { name: 'Search text' }).fill(KEY);
    return panel.locator(`[data-text-key="${KEY}"]`);
  }

  test('a shared edit re-renders the canvas at once and goes out as siteText', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load({ siteText: null });
    await loadAndWait(page, frame, msg);
    const baseline = (await changesFor(page, msg.loadId))[0]!;
    expect(baseline.siteText).toEqual({ schemaVersion: 1, language: { locale: 'en', formatLocale: '' }, strings: {} });
    expect(baseline.textIssues).toEqual([]);
    const row = await openText(frame);
    await row.getByRole('textbox').fill('Find a Northbound product');
    await expect(canvasSearch(frame, 'Find a Northbound product')).toBeVisible();
    await expect.poll(async () => (await changesFor(page, msg.loadId)).at(-1)?.siteText?.strings.en?.[KEY]).toBe('Find a Northbound product');
    await expectAdminAccepts(page);
  });

  test('an override for this layout goes into pageSet.text and leaves shared text alone', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load({ siteText: null });
    await loadAndWait(page, frame, msg);
    const row = await openText(frame);
    await row.getByRole('button', { name: 'Only Storefront' }).click();
    await row.getByRole('textbox').fill('Search the storefront');
    await expect(canvasSearch(frame, 'Search the storefront')).toBeVisible();
    await expect.poll(async () => (await changesFor(page, msg.loadId)).at(-1)?.pageSet?.text?.strings.en?.[KEY]).toBe('Search the storefront');
    expect((await changesFor(page, msg.loadId)).at(-1)?.siteText?.strings).toEqual({});
    await expectAdminAccepts(page);
  });

  test('an unknown placeholder is a blocking issue and the canvas keeps the built-in wording', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load({ siteText: null });
    await loadAndWait(page, frame, msg);
    const row = await openText(frame);
    await row.getByRole('textbox').fill('Search {nope}');
    await expect(row.getByText(/\{nope\} isn’t available/)).toBeVisible();
    // The header's issue list (the Text panel's "Issues" filter is a button too).
    await expect(frame.locator('[data-sf-builder-header]').getByRole('button', { name: /^Issues/ })).toContainText('1 issue');
    await expect(canvasSearch(frame, DEFAULT)).toBeVisible();
    await expect.poll(async () => (await changesFor(page, msg.loadId)).at(-1)?.textIssues).toEqual([
      expect.objectContaining({ scope: 'shared', key: KEY, rule: 'unknown-placeholder' }),
    ]);
    await expectAdminAccepts(page);
  });

  test('an older admin (no siteText): shared text is read-only and never posted', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load();
    await loadAndWait(page, frame, msg);
    const row = await openText(frame);
    await expect(row.getByRole('button', { name: 'All layouts' })).toBeDisabled();
    await row.getByRole('textbox').fill('Only on this layout');
    await expect.poll(async () => (await changesFor(page, msg.loadId)).at(-1)?.pageSet?.text?.strings.en?.[KEY]).toBe('Only on this layout');
    expect((await changesFor(page, msg.loadId)).every((m) => !('siteText' in m))).toBe(true);
    await expectAdminAccepts(page);
  });

  test('overrides that arrive with the page set leave in the baseline unchanged', async ({ page }) => {
    const { frame } = await openFramed(page);
    const text = { strings: { en: { [KEY]: 'Kept wording' }, de: { [KEY]: 'Behalten' } } };
    const msg = load({ pageSet: { ...checkoutWithoutFlowSet(), text }, siteText: null });
    await loadAndWait(page, frame, msg);
    expect((await changesFor(page, msg.loadId))[0]!.pageSet!.text).toEqual(text);
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

test.describe('page builder editor · style', () => {
  // Puck mounts the fields twice (a hidden left-sidebar Fields tab and the right sidebar): use the shown one.
  const panel = (frame: FrameLocator) => frame.locator('[data-sf-style-panel]').locator('visible=true');

  test('a swatch restyles the canvas and posts blockStyle; Reset style removes it', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load();
    await loadAndWait(page, frame, msg);
    await addBlock(frame, 'Heading');
    await panel(frame).locator('summary').click();
    // The swatches fill the sidebar's width in rows, not one tall column.
    const swatchTops = await panel(frame).getByRole('radiogroup', { name: 'Background' }).getByRole('radio').evaluateAll((els) => els.slice(0, 2).map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(swatchTops[0]).toBe(swatchTops[1]);
    await panel(frame).getByRole('radiogroup', { name: 'Background' }).getByRole('radio', { name: 'Surface 2' }).click();
    await expect(frame.locator('[data-sf-builder-canvas] [data-sf-style="Heading"][data-sfs-bg="surface-2"]')).toBeVisible();
    await expect.poll(() => lastPage(page, msg.loadId, 'catalog')).toContain('"blockStyle":{"bg":"surface-2"}');
    await panel(frame).getByRole('button', { name: 'Reset style' }).click();
    await expect(frame.locator('[data-sf-builder-canvas] [data-sf-style="Heading"]')).toHaveCount(0);
    await expect.poll(() => lastPage(page, msg.loadId, 'catalog')).not.toContain('blockStyle');
    await expectAdminAccepts(page);
  });

  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true });
    test('44 px swatches stay inside the narrow sidebar', async ({ page }) => {
      const { frame } = await openFramed(page, 768);
      const msg = load();
      await loadAndWait(page, frame, msg);
      await addBlock(frame, 'Heading');
      await panel(frame).locator('summary').click();
      const group = panel(frame).getByRole('radiogroup', { name: 'Background' });
      const edges = await group.evaluate((g) => ({
        right: g.getBoundingClientRect().right,
        swatches: [...g.querySelectorAll('[role="radio"]')].map((r) => { const b = r.getBoundingClientRect(); return { w: b.width, right: b.right }; }),
      }));
      for (const s of edges.swatches) {
        expect(s.w).toBeGreaterThanOrEqual(44);
        expect(s.right).toBeLessThanOrEqual(edges.right + 0.5);
      }
    });
  });

  test('a route block offers box styles but no Visibility row', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load({ pageSet: editorStyleSet() });
    await loadAndWait(page, frame, msg);
    await frame.locator('[data-sf-builder-canvas] [data-puck-component="grid-1"]').click();
    await panel(frame).locator('summary').click();
    await expect(panel(frame).getByRole('radiogroup', { name: 'Padding top' })).toBeVisible();
    await expect(panel(frame).getByRole('radiogroup', { name: 'Visibility' })).toHaveCount(0);
  });

  test('a hidden block is ghosted in Fit and gone in the Phone exact preview', async ({ page }) => {
    const { frame } = await openFramed(page, 900);
    const msg = load({ pageSet: editorStyleSet() });
    await loadAndWait(page, frame, msg);
    const ghost = frame.locator('[data-sf-builder-canvas] [data-sfs-ghost="mobile"]');
    await expect(ghost).toBeVisible();
    expect(await ghost.evaluate((el) => getComputedStyle(el).opacity)).toBe('0.4');
    await frame.getByRole('group', { name: 'Preview width' }).getByRole('button', { name: 'Phone' }).click();
    const preview = frame.locator('[data-sf-builder-exact="360"]');
    await expect(preview).toBeVisible();
    await expect(preview.locator('[data-sfs-hide="mobile"]')).toHaveCount(1);
    await expect(preview.getByRole('heading', { name: 'Ghost heading' })).toBeHidden();
    await frame.getByRole('button', { name: 'Back to editing' }).click();
  });
});

// ---- product parts and card designs (spec 2026-09-30-product-parts §11) -----------------------

/** Screenshots of this block go to a scratch directory, never into the repo. */
const SCRATCH = process.env.SF_E2E_SHOTS ?? tmpdir();

const canvas = (frame: FrameLocator) => frame.locator('[data-sf-builder-canvas]');
const part = (frame: FrameLocator, id: string) => canvas(frame).locator(`[data-puck-component="${id}"]`);
/** The selected block's action bar (the outline's layer buttons share the title). */
const bar = (frame: FrameLocator, title: string) => frame.locator(`button[class*="ActionBarAction"][title="${title}"]`);
/** `a` precedes `b` in document order. */
const before = (a: Locator, b: Locator) => b.elementHandle().then((h) => a.evaluate((el, other) => !!(el.compareDocumentPosition(other as Node) & Node.DOCUMENT_POSITION_FOLLOWING), h));
const rightPanel = (frame: FrameLocator) => frame.locator('[data-sfb-container-panel]').locator('visible=true');

/** Drag with real pointer events, in steps (dnd-kit needs movement to start). `where` is the edge of `to` to land on. */
async function drag(page: Page, from: Locator, to: Locator, where: 'above' | 'below' = 'above') {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + Math.min(a.height / 2, 12));
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + 20, { steps: 4 });
  const ty = where === 'above' ? b.y + 4 : b.y + b.height - 4;
  await page.mouse.move(b.x + b.width / 2, ty, { steps: 14 });
  await page.waitForTimeout(250);
  await page.mouse.move(b.x + b.width / 2, ty + (where === 'above' ? 1 : -1), { steps: 2 });
  await page.mouse.up();
}

type Comp = { type: string; props: Record<string, unknown> };
type ProductDoc = { content: Array<{ type: string; props: Record<string, unknown> & { top?: Comp[]; media?: Comp[]; main?: Comp[]; below?: Comp[] } }> };
const productOf = async (page: Page, loadId: string) => JSON.parse(await lastPage(page, loadId, 'product')) as ProductDoc | null;
const mainTypes = async (page: Page, loadId: string): Promise<string[]> => ((await productOf(page, loadId))?.content[0]?.props.main ?? []).map((c) => c.type);
/** The v0.7.0 default order: description after the add button. */
function defaultOrderSet() {
  const set = productPartsSet('storefront');
  const pd = set.pages.product!.content[0]!;
  const main = (pd.props.main as Comp[]).filter((x) => x.type !== 'RichText');
  const byType = (t: string) => main.find((x) => x.type === t)!;
  const reordered = ['ProductTitle', 'ProductGroup', 'ProductAddToCart', 'ProductDescription', 'ProductBulkPricing', 'ProductProvenance', 'ProductAsk'].map(byType);
  return { ...set, pages: { product: { ...set.pages.product!, content: [{ ...pd, props: { ...pd.props, main: reordered } }] } } };
}

test.describe('page builder editor · product parts', () => {
  const openProduct = async (page: Page, set: ReturnType<typeof load>['pageSet'] = defaultOrderSet(), containerId = 'pd-e2e') => {
    const framed = await openFramed(page);
    const msg = load({ pageSet: set });
    await loadAndWait(page, framed.frame, msg);
    await framed.frame.getByLabel('Page', { exact: true }).selectOption('product');
    await expect(part(framed.frame, containerId)).toBeVisible();
    return { ...framed, msg };
  };

  test('the Product page parts group is in the drawer on the product page only', async ({ page }) => {
    const { frame } = await openFramed(page);
    await loadAndWait(page, frame, load({ pageSet: storySet('storefront') }));
    await frame.getByLabel('Page', { exact: true }).selectOption('product');
    await expect(frame.getByRole('button', { name: 'Product page parts' })).toBeVisible();
    await frame.getByLabel('Page', { exact: true }).selectOption('page:our-story');
    await expect(frame.getByRole('button', { name: 'Content' })).toBeVisible();
    await expect(frame.getByRole('button', { name: 'Product page parts' })).toHaveCount(0);
  });

  test('Price has no delete action; Description does', async ({ page }) => {
    const { frame } = await openProduct(page);
    await part(frame, 'ProductPrice-e2e').click();
    await expect(frame.getByTitle('Select parent').first()).toBeVisible();
    await expect(bar(frame, 'Delete')).toHaveCount(0);
    await part(frame, 'ProductDescription-e2e').click();
    await expect(bar(frame, 'Delete')).toHaveCount(1);
  });

  test('dragging Description above the price group changes the product document', async ({ page }) => {
    const { frame, msg } = await openProduct(page);
    await drag(page, part(frame, 'ProductDescription-e2e'), part(frame, 'ProductGroup-priceRow-e2e'), 'above');
    await expect.poll(() => mainTypes(page, msg.loadId)).toEqual(['ProductTitle', 'ProductDescription', 'ProductGroup', 'ProductAddToCart', 'ProductBulkPricing', 'ProductProvenance', 'ProductAsk']);
    await expectAdminAccepts(page);
  });

  test('a removed part reads Removed in the panel and Add puts it back in its default place, as one undo step', async ({ page }) => {
    const { frame, msg } = await openProduct(page);
    await part(frame, 'ProductBulkPricing-e2e').click();
    await bar(frame, 'Delete').click();
    await expect.poll(() => mainTypes(page, msg.loadId)).not.toContain('ProductBulkPricing');
    await part(frame, 'pd-e2e').click({ position: { x: 3, y: 3 } });
    const row = rightPanel(frame).locator('[data-part-type="ProductBulkPricing"]');
    await expect(row).toContainText('Removed');
    // Puck replaces the item on Add: the fields panel must stay mounted, so focus and the announcement survive.
    await rightPanel(frame).evaluate((el) => el.setAttribute('data-probe', 'kept'));
    await rightPanel(frame).getByRole('button', { name: 'Add Bulk pricing' }).click();
    await expect(row).toContainText('On the page');
    await expect(rightPanel(frame)).toHaveAttribute('data-probe', 'kept');
    await expect(rightPanel(frame).getByRole('status')).toHaveText('Bulk pricing added');
    await expect(rightPanel(frame).locator(':focus')).toHaveAttribute('data-part-label', '');
    await page.screenshot({ path: `${SCRATCH}/parts-added.png` });
    await expect.poll(() => mainTypes(page, msg.loadId)).toEqual(['ProductTitle', 'ProductGroup', 'ProductAddToCart', 'ProductDescription', 'ProductBulkPricing', 'ProductProvenance', 'ProductAsk']);
    // One Undo takes the Add back and nothing else.
    await frame.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => mainTypes(page, msg.loadId)).not.toContain('ProductBulkPricing');
    await part(frame, 'pd-e2e').click({ position: { x: 3, y: 3 } });
    await expect(rightPanel(frame).locator('[data-part-type="ProductBulkPricing"]')).toContainText('Removed');
  });

  test('Add block puts a removed part back inside the container: after the selection, or at the end of main', async ({ page }) => {
    const { frame, msg } = await openProduct(page);
    const without = ['ProductTitle', 'ProductGroup', 'ProductAddToCart', 'ProductDescription', 'ProductProvenance', 'ProductAsk'];
    await part(frame, 'ProductBulkPricing-e2e').click();
    await bar(frame, 'Delete').click();
    await expect.poll(() => mainTypes(page, msg.loadId)).toEqual(without);

    // A part selected in main: the new one lands right after it.
    await part(frame, 'ProductDescription-e2e').click();
    await frame.getByRole('button', { name: 'Add block' }).click();
    const menu = frame.getByRole('menu', { name: 'Blocks to add' });
    await expect(menu).toBeVisible();
    await page.screenshot({ path: `${SCRATCH}/add-block-parts-menu.png` });
    await menu.getByRole('menuitem', { name: 'Bulk pricing', exact: true }).click();
    await expect.poll(() => mainTypes(page, msg.loadId)).toEqual(['ProductTitle', 'ProductGroup', 'ProductAddToCart', 'ProductDescription', 'ProductBulkPricing', 'ProductProvenance', 'ProductAsk']);

    // The container itself selected: the end of its main column, never the page root.
    await canvas(frame).locator('[data-puck-component^="ProductBulkPricing"]').click();
    await bar(frame, 'Delete').click();
    await expect.poll(() => mainTypes(page, msg.loadId)).toEqual(without);
    await part(frame, 'pd-e2e').click({ position: { x: 3, y: 3 } });
    await addBlock(frame, 'Bulk pricing');
    await expect.poll(() => mainTypes(page, msg.loadId)).toEqual([...without, 'ProductBulkPricing']);
    expect((await productOf(page, msg.loadId))!.content.map((c) => c.type)).toEqual(['ProductDetail']);
    await expectAdminAccepts(page);
  });

  test('Reset arrangement restores the four default slots and is one undo step', async ({ page }) => {
    const { frame, msg } = await openProduct(page);
    await drag(page, part(frame, 'ProductDescription-e2e'), part(frame, 'ProductGroup-priceRow-e2e'), 'above');
    await expect.poll(() => mainTypes(page, msg.loadId)).toContain('ProductDescription');
    await expect.poll(async () => (await mainTypes(page, msg.loadId)).indexOf('ProductDescription')).toBe(1);
    await part(frame, 'pd-e2e').click({ position: { x: 3, y: 3 } });
    await rightPanel(frame).getByRole('button', { name: 'Reset arrangement' }).click();
    await expect(rightPanel(frame).getByRole('status')).toHaveText('Arrangement reset');
    await expect(rightPanel(frame).getByRole('button', { name: 'Reset arrangement' })).toBeFocused();
    await expect.poll(async () => JSON.stringify(await productOf(page, msg.loadId).then((d) => {
      const pr = d!.content[0]!.props;
      return { top: pr.top!.map((c) => c.type), media: pr.media!.map((c) => c.type), main: pr.main!.map((c) => c.type), below: pr.below!.map((c) => c.type) };
    }))).toBe(JSON.stringify({
      top: ['ProductBreadcrumbs'], media: ['ProductGallery'],
      main: ['ProductTitle', 'ProductGroup', 'ProductAddToCart', 'ProductDescription', 'ProductBulkPricing', 'ProductProvenance', 'ProductAsk'],
      below: ['ProductUpsells'],
    }));
    await frame.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => mainTypes(page, msg.loadId).then((m) => m.indexOf('ProductDescription'))).toBe(1);
    expect((await productOf(page, msg.loadId))!.content[0]!.props.below).toEqual([]);
  });

  test('a Price dropped at the document root is a flagged issue carried in the change', async ({ page }) => {
    const { frame, msg } = await openProduct(page);
    await frame.getByRole('list').getByText('Outline', { exact: true }).click();
    const layer = frame.locator('[class*="LayerTree"] [class*="Layer-inner"]').first();
    await expect(layer).toBeVisible();
    // The outline's empty area under the last layer is the root zone.
    const lb = (await layer.boundingBox())!;
    const pb = (await part(frame, 'ProductPrice-e2e').boundingBox())!;
    await page.mouse.move(pb.x + 40, pb.y + 10);
    await page.mouse.down();
    await page.mouse.move(pb.x + 30, pb.y + 30, { steps: 4 });
    await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height + 30, { steps: 20 });
    await page.waitForTimeout(400);
    await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height + 32, { steps: 2 });
    await page.mouse.up();
    await expect.poll(async () => (await productOf(page, msg.loadId))?.content.map((c) => c.type)).toEqual(['ProductPrice', 'ProductDetail']);
    await expect.poll(async () => (await changesFor(page, msg.loadId)).at(-1)?.issues?.some((i) => i.rule === 'part-placement:ProductPrice')).toBe(true);
    await expect(frame.getByRole('button', { name: /^Issues \d+ issues?, publishing is blocked/ })).toBeVisible();
    // The stray Price is highlighted on the canvas (leave the outline to see the page again).
    await frame.getByRole('list').getByText('Blocks', { exact: true }).click();
    await expect(frame.getByText('Needs attention').first()).toBeVisible();
    await page.screenshot({ path: `${SCRATCH}/part-placement-issue.png` });
    await expectAdminAccepts(page);
  });

  test('on a v0.7.0 document one style change posts the upgraded slot arrays', async ({ page }) => {
    const { frame, msg } = await openProduct(page, legacyProductSet(), 'pd-legacy');
    await frame.locator('[data-sf-builder-canvas] [data-puck-component]', { hasText: 'Alpine Extract 10ml' }).last().click();
    const panel = frame.locator('[data-sf-style-panel]').locator('visible=true');
    await panel.locator('summary').click();
    await panel.getByRole('radiogroup', { name: 'Background' }).getByRole('radio', { name: 'Surface 2' }).click();
    await expect.poll(async () => JSON.stringify((await productOf(page, msg.loadId))?.content[0]?.props ?? {})).toContain('"blockStyle"');
    const props = (await productOf(page, msg.loadId))!.content[0]!.props as Record<string, unknown> & { top: Comp[]; media: Comp[]; main: Comp[]; below: Comp[] };
    expect(props.top.length).toBeGreaterThan(0);
    expect(props.main.length).toBeGreaterThan(0);
    expect(props.media).toEqual([]);
    expect(props.below).toEqual([]);
    expect('gallery' in props).toBe(false);
    expect('upsells' in props).toBe(false);
  });
});

test.describe('page builder editor · card designs', () => {
  /** A tile design with the name above the price (the built-in order). */
  function nameFirstSet() {
    const set = tileDesignSet('storefront');
    const tile = set.cards!.tile!;
    const root = tile.content[0]!;
    const body = (root.props.content as Comp[]).find((c) => c.type === 'CardTileGroup')!;
    const items = body.props.items as Comp[];
    body.props.items = [items.find((c) => c.type === 'CardTileName')!, items.find((c) => c.type === 'CardTilePrice')!, items.find((c) => c.type === 'CardTileGroup')!];
    return set;
  }

  test('the first grid item is the editable card (Puck\'s wrapper), the same width as the copies', async ({ page }) => {
    const { frame } = await openFramed(page);
    await loadAndWait(page, frame, load({ pageSet: nameFirstSet() }));
    await frame.getByLabel('Page', { exact: true }).selectOption('card:tile');
    const grid = canvas(frame).locator('[data-sf-part="product-grid"]');
    await expect(grid).toBeVisible();
    await page.waitForTimeout(1500); // the cards' entrance animation settles
    const kids = await grid.evaluate((g) => [...g.children].map((k) => ({ puck: !!k.querySelector('[data-puck-component="tile-e2e"]') || k.getAttribute('data-puck-component') === 'tile-e2e', inert: k.hasAttribute('inert'), w: Math.round((k.hasAttribute('inert') ? k.firstElementChild! : k).getBoundingClientRect().width), top: Math.round((k.hasAttribute('inert') ? k.firstElementChild! : k).getBoundingClientRect().top) })));
    expect(kids.length).toBe(4);
    expect(kids[0]!.puck).toBe(true);
    expect(kids.slice(1).every((k) => k.inert && !k.puck)).toBe(true);
    expect(Math.abs(kids[0]!.w - kids[1]!.w)).toBeLessThanOrEqual(2);
    expect(Math.max(...kids.map((k) => k.top)) - Math.min(...kids.map((k) => k.top))).toBeLessThanOrEqual(1);
  });

  test('moving the price above the name updates the copies, the catalogue canvas and the posted cards', async ({ page }) => {
    const { frame } = await openFramed(page);
    const msg = load({ pageSet: nameFirstSet() });
    await loadAndWait(page, frame, msg);
    await frame.getByLabel('Page', { exact: true }).selectOption('card:tile');
    await expect(part(frame, 't-name')).toBeVisible();
    const copies = canvas(frame).locator('[data-sf-part="product-grid"] > [inert]');
    await expect(copies).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) expect(await before(copies.nth(i).locator('a').last(), copies.nth(i).locator('[data-sf-part="price"]'))).toBe(true);

    // Move the name below the price: the drop lands inside the body group, not at its edge.
    await drag(page, part(frame, 't-name'), part(frame, 't-price'), 'below');
    await expect.poll(async () => {
      const c = (await changesFor(page, msg.loadId)).at(-1)?.pageSet as { cards?: { tile?: { content: Array<{ props: { content: Comp[] } }> } } } | undefined;
      const body = c?.cards?.tile?.content[0]?.props.content.find((x) => x.type === 'CardTileGroup');
      return (body?.props.items as Comp[] | undefined)?.map((x) => x.type);
    }).toEqual(['CardTilePrice', 'CardTileName', 'CardTileGroup']);
    for (let i = 0; i < 3; i += 1) await expect.poll(() => before(copies.nth(i).locator('[data-sf-part="price"]'), copies.nth(i).locator('a').last())).toBe(true);
    await page.screenshot({ path: `${SCRATCH}/cards-price-first.png` });

    await frame.getByLabel('Page', { exact: true }).selectOption('catalog');
    const card = canvas(frame).locator('[data-sf-part="product-card"]').first();
    await expect(card).toBeVisible();
    expect(await before(card.locator('[data-sf-part="price"]'), card.locator('a').last())).toBe(true);

    const last = (await changesFor(page, msg.loadId)).at(-1)!;
    expect(last.pageSet!.pages['card:tile']).toBeUndefined();
    expect(Object.keys(last.pageSet!.pages).some((k) => k.startsWith('card:'))).toBe(false);
    await expectAdminAccepts(page);
  });
});

test.describe('page builder editor · sheet canvas', () => {
  const stage = (frame: FrameLocator) => frame.locator('[data-sf-builder-sheet]');
  const openSheet = async (page: Page, width: number) => {
    const framed = await openFramed(page, width);
    const msg = load({ layout: 'menu', pageSet: menuSheetSet('menu') });
    await loadAndWait(page, framed.frame, msg);
    await framed.frame.getByLabel('Page', { exact: true }).selectOption('product');
    await expect(stage(framed.frame)).toBeVisible();
    return { ...framed, msg };
  };
  const box = async (l: Locator) => (await l.boundingBox())!;
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5;

  for (const width of [360, 1440]) {
    test(`at a ${width}px frame the sheet stands between its fixed header and footer, the caption clear of both`, async ({ page }) => {
      const { frame } = await openSheet(page, width);
      const sheet = stage(frame);
      // The arrangement shows: bulk pricing above the title, the title in the sheet's own heading.
      const title = sheet.locator('[data-sf-part="sheet-title"]');
      await expect(title).toBeVisible();
      await expect(sheet.getByRole('heading', { name: 'Buy more, pay less' })).toBeVisible();
      expect(await before(sheet.getByRole('heading', { name: 'Buy more, pay less' }), title)).toBe(true);
      await expect(sheet.getByText('The sheet’s header and add button are fixed. Arrange the parts between them.')).toBeVisible();
      // Nothing is wider than the frame; the editor header's controls wrap rather than overflow.
      const w = await sheet.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect(w.sw).toBeLessThanOrEqual(w.cw);
      expect(await frame.locator('[data-sf-builder-header]').evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(width);
      // "Preview with" stays reachable in the header at this width.
      const pick = frame.getByLabel('Preview with');
      await expect(pick).toBeVisible();
      const pb = await box(pick);
      expect(pb.x).toBeGreaterThanOrEqual(0);
      expect(pb.x + pb.width).toBeLessThanOrEqual(width + 0.5);
      // For every product (including a pre-order and an out-of-stock one, whose add button carries a note)
      // the caption sits under the pinned footer, never over it.
      for (const name of ['Alpine Extract 10ml', 'Dune Starter Kit', 'Echo Balm 12ml']) {
        await pick.selectOption({ label: name });
        await expect(title).toHaveText(name);
        const foot = sheet.locator('[inert][class*="foot"]');
        const cap = sheet.getByText('The sheet’s header and add button are fixed.');
        expect(overlap(await box(foot), await box(cap)), `caption over the footer for ${name}`).toBe(false);
        expect((await box(cap)).y, `caption above the footer for ${name}`).toBeGreaterThanOrEqual((await box(foot)).y + (await box(foot)).height - 0.5);
        const notes = await foot.locator('*').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ y: r.y, h: r.height })));
        const capTop = (await box(cap)).y;
        expect(notes.every((n) => n.y + n.h <= capTop + 0.5), `something in the footer pokes past the caption for ${name}`).toBe(true);
      }
      await page.screenshot({ path: `${SCRATCH}/sheet-canvas-${width}.png` });
    });
  }

  test('the exact preview opens the real sheet through ?p= on the picked product', async ({ page }) => {
    const { frame } = await openSheet(page, 1440);
    await frame.getByLabel('Preview with').selectOption({ label: 'Alpine Extract 10ml' });
    await frame.getByRole('group', { name: 'Preview width' }).getByRole('button', { name: 'Phone' }).click();
    const preview = frame.locator('[data-sf-builder-exact="360"]');
    await expect(preview).toBeVisible();
    // The sheet is a drawer, portalled out of the preview's scroller.
    const sheet = frame.locator('[data-sf-part="sheet"]');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-sf-part="sheet-title"]')).toHaveText('Alpine Extract 10ml');
    expect(await before(sheet.getByRole('heading', { name: 'Buy more, pay less' }), sheet.locator('[data-sf-part="sheet-title"]'))).toBe(true);
    await page.screenshot({ path: `${SCRATCH}/sheet-exact-preview.png` });
    // The sheet is modal, as for a shopper, but the way back to editing stays above its overlay.
    await frame.getByRole('button', { name: 'Back to editing' }).click();
    await expect(stage(frame)).toBeVisible();
    // A different pick, a different sheet.
    await frame.getByLabel('Preview with').selectOption({ label: 'Citrine Capsules 60ct' });
    await frame.getByRole('group', { name: 'Preview width' }).getByRole('button', { name: 'Phone' }).click();
    await expect(frame.locator('[data-sf-part="sheet"] [data-sf-part="sheet-title"]')).toHaveText('Citrine Capsules 60ct');
  });
});

test.describe('page builder editor · card designer at a phone width', () => {
  test('the caption sits under the cards and nothing is wider than a 360px frame', async ({ page }) => {
    const { frame } = await openFramed(page, 360);
    await loadAndWait(page, frame, load());
    await frame.getByLabel('Page', { exact: true }).selectOption('card:tile');
    const stageEl = frame.locator('[data-sf-builder-cards="tile"]');
    await expect(stageEl).toBeVisible();
    await page.waitForTimeout(1200);
    const geo = await stageEl.evaluate((el) => {
      const grid = el.querySelector('[data-sf-part="product-grid"]')!;
      const cap = el.querySelector('[class*="caption"]')!;
      const cards = [...grid.querySelectorAll('article, [data-puck-component]')].map((c) => c.getBoundingClientRect());
      const r = cap.getBoundingClientRect();
      return { sw: el.scrollWidth, cw: el.clientWidth, capTop: r.top, capLeft: r.left, capRight: r.right, cardsBottom: Math.max(...cards.map((c) => c.bottom)), cardsRight: Math.max(...cards.map((c) => c.right)), view: window.innerWidth };
    });
    expect(geo.sw).toBeLessThanOrEqual(geo.cw);
    expect(geo.capTop).toBeGreaterThanOrEqual(geo.cardsBottom - 0.5);
    expect(geo.capRight).toBeLessThanOrEqual(geo.view);
    expect(geo.cardsRight).toBeLessThanOrEqual(geo.view);
    await page.screenshot({ path: `${SCRATCH}/cards-360.png` });
    // The row designer too.
    await frame.getByLabel('Page', { exact: true }).selectOption('card:row');
    const rows = frame.locator('[data-sf-builder-cards="row"]');
    await expect(rows).toBeVisible();
    await page.waitForTimeout(800);
    expect(await rows.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `${SCRATCH}/cards-row-360.png` });
  });
});
