/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { THEME_BOOTSTRAP } from '@/app/theme-bootstrap.ts';
import { applyDocumentTheme, lastKnownBrandName, LEGACY_THEME_STORAGE_KEY, mix, readStoredTemplateId, THEME_STORAGE_KEY } from '@/app/theme-bridge.ts';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import type { Brand, Theme } from '@/types/settings.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const theme: Theme = {
  scheme: 'dark',
  colors: { primary: '#3355ff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: 'Space Grotesk', body: 'Inter', mono: null },
  radius: 'lg', density: 'compact', customCss: '',
};
const brand: Brand = { name: 'Acme', shortName: 'Acme', tagline: 'tag', title: 'Acme Shop', description: 'desc', logoUrl: null, faviconUrl: null, logoHeight: 32, links: { whatsapp: null, telegram: null } };
const run = () => new Function(THEME_BOOTSTRAP)();
const root = () => document.documentElement;
function reset() {
  root().removeAttribute('style');
  for (const a of [...root().attributes]) if (a.name.startsWith('data-')) root().removeAttribute(a.name);
  document.head.querySelectorAll('#sf-fonts').forEach((n) => n.remove());
}

describe('theme bootstrap (inlined first-paint script)', () => {
  afterEach(() => { localStorage.clear(); reset(); });

  it('replays exactly what applyDocumentTheme painted', () => {
    applyDocumentTheme(resolveTheme(theme, lookupManifest), brand);
    const painted = { style: root().getAttribute('style'), template: root().getAttribute('data-sf-template'), scheme: root().getAttribute('data-mantine-color-scheme') };
    reset();
    run();
    expect(root().getAttribute('style')).toBe(painted.style);
    expect(root().getAttribute('data-sf-template')).toBe(painted.template);
    expect(root().getAttribute('data-mantine-color-scheme')).toBe(painted.scheme);
    expect(document.head.querySelector<HTMLLinkElement>('link#sf-fonts')?.href).toContain('Space+Grotesk');
    expect(document.title).toBe('Acme Shop');
  });

  it('never persists in preview mode', () => {
    applyDocumentTheme(resolveTheme(theme, lookupManifest), brand, { persist: false });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('paints a legacy v1 payload from the previous release', () => {
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, JSON.stringify({ theme, brand }));
    run();
    expect(root().style.getPropertyValue('--sf-bg')).toBe('#0f3965');
    expect(root().style.getPropertyValue('--sf-line')).toBe(mix('#15457a', '#ffffff', 0.12));
    expect(root().getAttribute('data-mantine-color-scheme')).toBe('dark');
  });

  it('does not throw on empty or corrupt storage', () => {
    expect(run).not.toThrow();
    localStorage.setItem(THEME_STORAGE_KEY, '{not json');
    expect(run).not.toThrow();
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ v: 2, vars: null }));
    expect(run).not.toThrow();
  });

  it('exposes the stored template id and brand name', () => {
    expect(readStoredTemplateId()).toBeNull();
    applyDocumentTheme(resolveTheme(theme, lookupManifest), brand);
    expect(readStoredTemplateId()).toBe('modern');
    expect(lastKnownBrandName()).toBe('Acme');
    localStorage.clear();
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, JSON.stringify({ theme, brand: { ...brand, name: 'Old' } }));
    expect(lastKnownBrandName()).toBe('Old');
  });

  it('is inlined verbatim in index.html', () => {
    expect(readFileSync(path.resolve(testDir, '../index.html'), 'utf8')).toContain(THEME_BOOTSTRAP);
  });
});
