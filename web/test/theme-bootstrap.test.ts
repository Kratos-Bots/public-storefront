/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { THEME_BOOTSTRAP } from '@/app/theme-bootstrap.ts';
import { applyDocumentTheme, lastKnownBrandName, LEGACY_THEME_STORAGE_KEY, mix, readStoredTemplateId, THEME_STORAGE_KEY } from '@/app/theme-bridge.ts';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import { ROOT_ATTRIBUTE_NAMES } from '@/templates/tokens.ts';
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

  // Fix round 1 (spec §1.8): corrupt/foreign localStorage must be harmless.

  it('ignores an attribute key outside rootAttributes() (e.g. onclick)', () => {
    const stored = { v: 2, templateId: 'modern', vars: {}, attrs: { onclick: "alert('x')", 'data-sf-template': 'modern' }, title: 't', brandName: 'b', fontsHref: null };
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(stored));
    run();
    expect(root().hasAttribute('onclick')).toBe(false);
    expect(root().getAttribute('data-sf-template')).toBe('modern');
  });

  it('ignores a fontsHref that is not a Google Fonts URL', () => {
    const stored = { v: 2, templateId: 'modern', vars: {}, attrs: {}, title: 't', brandName: 'b', fontsHref: 'https://evil.example/steal.css' };
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(stored));
    run();
    expect(document.head.querySelector('link#sf-fonts')).toBeNull();
  });

  it('ignores a var name outside the --sf-* pattern', () => {
    const stored = { v: 2, templateId: 'modern', vars: { '--evil': 'x', '--sf-bg': '#123456' }, attrs: {}, title: 't', brandName: 'b', fontsHref: null };
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(stored));
    run();
    expect(root().style.getPropertyValue('--evil')).toBe('');
    expect(root().style.getPropertyValue('--sf-bg')).toBe('#123456');
  });

  it('falls through to a valid v1 payload when v2 is corrupt', () => {
    localStorage.setItem(THEME_STORAGE_KEY, '{not json');
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, JSON.stringify({ theme, brand }));
    run();
    expect(root().style.getPropertyValue('--sf-bg')).toBe('#0f3965');
    expect(root().getAttribute('data-mantine-color-scheme')).toBe('dark');
  });

  it('inlines the same attribute allowlist as tokens.ts exports (ROOT_ATTRIBUTE_NAMES)', () => {
    const m = THEME_BOOTSTRAP.match(/A=\[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const inline = m![1]!.split(',').map((s) => s.trim().replace(/^'|'$/g, '')).sort();
    expect(inline).toEqual([...ROOT_ATTRIBUTE_NAMES].sort());
  });
});
