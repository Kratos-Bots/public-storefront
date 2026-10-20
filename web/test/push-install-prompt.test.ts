import { beforeEach, describe, expect, it } from 'vitest';
import { guardInstallPrompt, setInstallPromptAllowed } from '@/features/push/install-prompt.ts';

function fire(): Event {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  window.dispatchEvent(e);
  return e;
}

describe('install prompt guard', () => {
  beforeEach(() => setInstallPromptAllowed(false));
  guardInstallPrompt();

  it('suppresses the automatic prompt while push is off or unknown', () => {
    expect(fire().defaultPrevented).toBe(true);
  });

  it('lets the prompt through once push is enabled', () => {
    setInstallPromptAllowed(true);
    expect(fire().defaultPrevented).toBe(false);
  });

  it('suppresses it again if push is switched off', () => {
    setInstallPromptAllowed(true);
    setInstallPromptAllowed(false);
    expect(fire().defaultPrevented).toBe(true);
  });
});
