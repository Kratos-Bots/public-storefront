import { describe, expect, it } from 'vitest';
import { pushAvailability, type PushEnv } from '@/features/push/support.ts';

const base: PushEnv = {
  settingsPush: { enabled: true, publicKey: 'BKey' },
  signedIn: true,
  telegram: false,
  hasPushManager: true,
  hasServiceWorker: true,
  isIOS: false,
  standalone: false,
  permission: 'default',
};
const env = (over: Partial<PushEnv>): PushEnv => ({ ...base, ...over });

describe('pushAvailability', () => {
  it('is ready on a capable, signed-in browser', () => {
    expect(pushAvailability(base)).toBe('ready');
  });

  it('older backend without push -> unavailable', () => {
    expect(pushAvailability(env({ settingsPush: undefined }))).toBe('unavailable');
    expect(pushAvailability(env({ settingsPush: null }))).toBe('unavailable');
  });

  it('push switched off or without a key -> unavailable', () => {
    expect(pushAvailability(env({ settingsPush: { enabled: false, publicKey: 'BKey' } }))).toBe('unavailable');
    expect(pushAvailability(env({ settingsPush: { enabled: true, publicKey: '' } }))).toBe('unavailable');
  });

  it('signed out -> unavailable', () => {
    expect(pushAvailability(env({ signedIn: false }))).toBe('unavailable');
  });

  it('telegram -> unavailable', () => {
    expect(pushAvailability(env({ telegram: true }))).toBe('unavailable');
  });

  it('iOS outside an installed app -> needs-install', () => {
    expect(pushAvailability(env({ isIOS: true, standalone: false, hasPushManager: false }))).toBe('needs-install');
  });

  it('iOS installed to the home screen -> ready', () => {
    expect(pushAvailability(env({ isIOS: true, standalone: true }))).toBe('ready');
  });

  it('denied permission -> denied', () => {
    expect(pushAvailability(env({ permission: 'denied' }))).toBe('denied');
  });

  it('no PushManager or no service worker -> unavailable', () => {
    expect(pushAvailability(env({ hasPushManager: false }))).toBe('unavailable');
    expect(pushAvailability(env({ hasServiceWorker: false }))).toBe('unavailable');
    expect(pushAvailability(env({ permission: 'unsupported', hasPushManager: false }))).toBe('unavailable');
  });
});
