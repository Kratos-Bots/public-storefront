import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TextLayerProvider } from '@/text/runtime.tsx';
import { formatRelative, formatStamp } from '@/features/tracking/status.ts';

afterEach(cleanup);
const now = Date.parse('2026-07-07T12:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();
describe('tracking wording follows published text', () => {
  it('relative times keep today\'s English and follow edits', () => {
    expect(formatRelative(ago(12 * 60_000), now)).toBe('12 min ago');
    expect(formatStamp(null)).toBe('Date unknown');
    render(<TextLayerProvider text={{ locale: 'en', formatLocale: '', shared: { 'tracking.time.minutesAgo': '{minutes} minutes ago' }, layout: {} }}><span /></TextLayerProvider>);
    expect(formatRelative(ago(12 * 60_000), now)).toBe('12 minutes ago');
  });
});
