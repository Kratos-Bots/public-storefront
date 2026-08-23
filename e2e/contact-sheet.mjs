/**
 * Builds `docs/screenshots/e2e-contact-sheet.png` from whatever
 * `e2e/screenshots/` holds — one plate per shot, grouped by scenario.
 *
 *   node e2e/contact-sheet.mjs        (run `npm run test:e2e` first)
 *
 * The screenshots themselves are gitignored; the contact sheet is the committed
 * record of what the mocked pass actually rendered.
 */
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const shotsDir = fileURLToPath(new URL('./screenshots/', import.meta.url));
const outDir = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const outFile = `${outDir}e2e-contact-sheet.png`;

const SECTIONS = {
  '1': 'Catalogue · search · categories',
  '2': 'Product → cart → checkout → order',
  '3': 'Guest checkout (Turnstile shimmed)',
  '4': 'WhatsApp sign-in and the account',
  '5': 'Kill switch and the order-link exemption',
  '6': 'Tracking and verify',
};

const files = readdirSync(shotsDir).filter((f) => f.endsWith('.png')).sort();
if (files.length === 0) throw new Error(`No screenshots in ${shotsDir} — run npm run test:e2e first`);

const caption = (file) => file.replace(/^\d+-/, '').replace(/\.png$/, '').replace(/-/g, ' ');
const dataUri = (file) => `data:image/png;base64,${readFileSync(shotsDir + file).toString('base64')}`;

const groups = new Map();
for (const file of files) {
  const key = file.slice(0, 1);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(file);
}

const sections = [...groups.entries()]
  .map(
    ([key, group]) => `
      <section>
        <h2><span class="num">${key}</span>${SECTIONS[key] ?? 'Other'}</h2>
        <div class="grid">
          ${group
            .map(
              (file) => `
            <figure>
              <div class="plate"><img src="${dataUri(file)}" alt="${caption(file)}" /></div>
              <figcaption>${caption(file)}</figcaption>
            </figure>`,
            )
            .join('')}
        </div>
      </section>`,
  )
  .join('');

const html = `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 36px 32px 44px; width: 1440px;
    background: #0b0c0e; color: #f2f3f5;
    font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
  }
  header { border-bottom: 1px solid #2a2e34; padding-bottom: 18px; margin-bottom: 8px; }
  h1 { margin: 0 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
  header p { margin: 0; font-size: 12px; color: #9aa0a6; }
  section { margin-top: 30px; }
  h2 {
    display: flex; align-items: center; gap: 10px; margin: 0 0 14px;
    font-size: 11px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; color: #c8a44b;
  }
  .num {
    display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
    border: 1px solid #c8a44b; border-radius: 4px; font-size: 11px; letter-spacing: 0;
  }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  figure { margin: 0; }
  .plate {
    height: 230px; display: flex; align-items: center; justify-content: center; overflow: hidden;
    background: #14161a; border: 1px solid #23262c; border-radius: 6px;
  }
  .plate img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
  figcaption {
    margin-top: 7px; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #9aa0a6;
  }
</style></head>
<body>
  <header>
    <h1>Storefront · mocked end-to-end pass</h1>
    <p>${files.length} screenshots from <code>npm run test:e2e</code> — both layouts, 390×844 and 1280×800, every API call mocked.</p>
  </header>
  ${sections}
</body></html>`;

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: outFile, fullPage: true });
await browser.close();
console.log(`wrote ${outFile} (${files.length} shots)`);
