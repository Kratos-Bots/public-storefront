import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { TextLayerProvider } from '@/text/runtime.tsx';
import { loadPack } from '@/text/packs/index.ts';
import { NothingShippedScreen } from '@/features/tracking/StateScreens.tsx';
import type { TrackingLookup } from '@/types/tracking.ts';

afterEach(cleanup);

const order = (status: string): TrackingLookup => ({
  reference: 'R-1', status, createdAt: new Date().toISOString(), itemCount: 1, isPreorder: false,
  parcels: [], trackingAvailable: false, checkedAt: null,
});

function show(locale: string, status: string) {
  render(
    <MantineProvider>
      <TextLayerProvider text={{ locale, formatLocale: '', shared: {}, layout: {} }}>
        <NothingShippedScreen data={order(status)} />
      </TextLayerProvider>
    </MantineProvider>,
  );
}

describe('the cancelled/refunded body names the status in the shop language', () => {
  it('English is the raw status word, as before', () => {
    show('en', 'cancelled');
    expect(screen.getByText('This order was cancelled. Nothing will be dispatched.')).toBeTruthy();
  });
  it('French uses the translated status label, lower-cased', async () => {
    await loadPack('fr');
    show('fr', 'refunded');
    expect(screen.getByText('Cette commande a été remboursée. Rien ne sera expédié.')).toBeTruthy();
  });
});
