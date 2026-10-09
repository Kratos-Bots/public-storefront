import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const tg = vi.hoisted(() => ({ inTelegram: false }));
vi.mock('@/lib/telegram-webapp.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telegram-webapp.ts')>()),
  isTelegramWebApp: () => tg.inTelegram,
}));

import { ReferralLinkRoute, captureReferralFromLocation } from '@/features/referrals/capture.tsx';
import { readStoredReferral } from '@/features/referrals/stored-referral.ts';

beforeEach(() => {
  localStorage.clear();
  tg.inTelegram = false;
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

function mountAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/ref/:code" element={<ReferralLinkRoute />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('/ref/:code route', () => {
  it('stores the code and redirects home', () => {
    mountAt('/ref/test0001');
    expect(screen.getByText('home')).toBeInTheDocument();
    expect(readStoredReferral()).toBe('TEST0001');
  });
  it('stores nothing for a bad code but still goes home', () => {
    mountAt('/ref/!!');
    expect(screen.getByText('home')).toBeInTheDocument();
    expect(readStoredReferral()).toBeNull();
  });
  it('inside Telegram only redirects', () => {
    tg.inTelegram = true;
    mountAt('/ref/TEST0001');
    expect(screen.getByText('home')).toBeInTheDocument();
    expect(readStoredReferral()).toBeNull();
  });
});

describe('captureReferralFromLocation', () => {
  it('captures a #/ref/CODE hash and strips it', () => {
    window.history.replaceState(null, '', '/?a=1#/ref/test0002');
    captureReferralFromLocation();
    expect(readStoredReferral()).toBe('TEST0002');
    expect(window.location.hash).toBe('');
    expect(window.location.pathname + window.location.search).toBe('/?a=1');
  });
  it('also accepts #ref/CODE with a ref_ prefix', () => {
    window.history.replaceState(null, '', '/#ref/ref_test0003');
    captureReferralFromLocation();
    expect(readStoredReferral()).toBe('TEST0003');
  });
  it('captures a /ref/CODE path at boot', () => {
    window.history.replaceState(null, '', '/ref/TEST0004');
    captureReferralFromLocation();
    expect(readStoredReferral()).toBe('TEST0004');
  });
  it('leaves other hashes alone', () => {
    window.history.replaceState(null, '', '/#tgWebAppData=abc&tgWebAppVersion=8');
    captureReferralFromLocation();
    expect(window.location.hash).toBe('#tgWebAppData=abc&tgWebAppVersion=8');
    expect(readStoredReferral()).toBeNull();
  });
  it('captures nothing inside Telegram', () => {
    tg.inTelegram = true;
    window.history.replaceState(null, '', '/#/ref/TEST0005');
    captureReferralFromLocation();
    expect(readStoredReferral()).toBeNull();
  });
});
