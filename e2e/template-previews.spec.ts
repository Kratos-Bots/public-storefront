import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { installMocks } from './mocks.ts';
import { FIXED_NOW } from './flows.ts';
import { presetTheme } from './template-theme.ts';

const TARGETS = [
  { template: 'dark-luxury', preset: 'gold' },
  { template: 'cyber-brutalism', preset: 'acid-dark' },
];

test.describe('template previews', () => {
  test.skip(process.env.CAPTURE_PREVIEWS !== '1', 'set CAPTURE_PREVIEWS=1 (and E2E_REAL_FONTS=1) to regenerate preview.webp');

  for (const t of TARGETS) {
    test(`capture ${t.template}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.clock.setFixedTime(FIXED_NOW);
      await installMocks(page, { layout: 'storefront', tweakSettings: await presetTheme(page, t.template, t.preset) });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'All products', level: 1 })).toBeVisible();
      // await inside the page: returning the FontFaceSet itself is not serialisable
      await page.evaluate(async () => { await document.fonts.ready; });
      const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 800 } });
      const webp = await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 400;
        canvas.getContext('2d')!.drawImage(img, 0, 0, 640, 400);
        return canvas.toDataURL('image/webp', 0.82).split(',')[1]!;
      }, png.toString('base64'));
      writeFileSync(fileURLToPath(new URL(`../web/src/templates/${t.template}/preview.webp`, import.meta.url)), Buffer.from(webp, 'base64'));
    });
  }
});
