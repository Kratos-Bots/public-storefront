import { describe, expect, it } from 'vitest';
import { referralShareLinks, referralShareText } from '@/features/account/referral-share.ts';
import type { Brand } from '@/types/settings.ts';

function brandWith(links: Brand['links']): Brand {
  return {
    name: 'Thorbard',
    shortName: 'Thorbard',
    tagline: '',
    title: '',
    description: '',
    logoUrl: null,
    faviconUrl: null,
    logoHeight: 28,
    links,
  };
}

describe('referralShareText', () => {
  it('carries the code and the shop name', () => {
    const text = referralShareText('AB12CD34', 'Thorbard');
    expect(text).toContain('AB12CD34');
    expect(text).toContain('Thorbard');
  });
});

describe('referralShareLinks', () => {
  it('prefills the code into the WhatsApp and Telegram links', () => {
    const links = referralShareLinks(
      'AB12CD34',
      brandWith({ whatsapp: 'https://wa.me/447700900000', telegram: 'https://t.me/thorbardbot' }),
    );
    expect(links.whatsapp).toContain('wa.me/447700900000');
    expect(links.whatsapp).toContain('text=');
    expect(links.whatsapp).toContain('AB12CD34');
    expect(links.telegram).toContain('t.me/thorbardbot');
    expect(links.telegram).toContain('AB12CD34');
  });

  it('has no link where the shop has no chat channel', () => {
    const links = referralShareLinks('AB12CD34', brandWith({ whatsapp: null, telegram: null }));
    expect(links).toEqual({ whatsapp: null, telegram: null });
  });
});
