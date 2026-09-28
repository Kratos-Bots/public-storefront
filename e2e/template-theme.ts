import { expect, type Page } from '@playwright/test';
import type { InstallMocksOptions } from './mocks.ts';

interface CatalogPreset {
  id: string;
  scheme: 'dark' | 'light';
  colors: Record<string, string>;
  fonts: Record<'heading' | 'body' | 'mono', { family: string } | null>;
  radius: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}
interface CatalogJson { templates: Array<{ id: string; presets: CatalogPreset[] }> }

type Tweak = NonNullable<InstallMocksOptions['tweakSettings']>;

/** A tweakSettings that stores `template`/`preset` the way the admin does: preset values copied in. */
export async function presetTheme(page: Page, template: string, preset: string, options: Record<string, boolean | string> = {}): Promise<Tweak> {
  const res = await page.request.get('/templates.json');
  expect(res.ok()).toBe(true);
  const p = ((await res.json()) as CatalogJson).templates.find((t) => t.id === template)?.presets.find((x) => x.id === preset);
  if (!p) throw new Error(`no preset ${template}/${preset} in /templates.json`);
  return (s) => {
    s.theme = {
      ...s.theme,
      template,
      preset,
      options,
      scheme: p.scheme,
      colors: p.colors as typeof s.theme.colors,
      fonts: { heading: p.fonts.heading?.family ?? null, body: p.fonts.body?.family ?? null, mono: p.fonts.mono?.family ?? null },
      radius: p.radius,
    };
  };
}
