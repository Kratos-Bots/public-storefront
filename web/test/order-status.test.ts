import { describe, expect, it } from 'vitest';
import {
  cardState,
  isManual,
  maskTxid,
  paymentPollInterval,
  pollInterval,
  methodNote,
  submittedTxidMask,
  visibleCryptoPayments,
} from '@/features/order-status/payment-state.ts';
import type { PublicCryptoPayment, PublicOrder } from '@/types/public-order.ts';
import type { PaymentMethod } from '@/types/checkout.ts';

function order(patch: Partial<PublicOrder> = {}): PublicOrder {
  return {
    reference: 'AB12CD',
    status: 'pending',
    createdAt: '2026-08-01T12:00:00.000Z',
    deliveredAt: null,
    isPreorder: false,
    currency: 'GBP',
    items: [],
    totals: { subtotal: 40, shippingAmount: 5, discountAmount: 0, taxAmount: 0, totalAmount: 45 },
    shippingAddress: null,
    shipments: [],
    ...patch,
  };
}

function crypto(patch: Partial<PublicCryptoPayment> = {}): PublicCryptoPayment {
  return {
    paymentId: 1,
    paymentStatus: 'pending',
    coin: 'btc',
    network: 'bitcoin',
    coinLabel: 'BTC',
    networkLabel: 'Bitcoin',
    address: 'bc1qexampleaddress',
    coinAmount: '0.00123400',
    fiatAmount: 45,
    verificationStatus: 'pending',
    needsAttention: false,
    txidMasked: null,
    ...patch,
  };
}

function method(patch: Partial<PaymentMethod> = {}): PaymentMethod {
  return {
    method: 'sushipp',
    displayName: 'Sushipp',
    type: 'gateway',
    details: null,
    feeType: null,
    feeValue: null,
    feeRateText: '',
    feeLabel: '',
    fee: 0,
    chargeTotal: 45,
    ...patch,
  };
}

// ------------------------------------------------------- visibleCryptoPayments

describe('visibleCryptoPayments', () => {
  it('is empty when the backend sent no crypto payments', () => {
    expect(visibleCryptoPayments(order())).toEqual([]);
  });

  it('hides cancelled and failed payments — they are dead ends', () => {
    const live = crypto({ paymentId: 3 });
    const shown = visibleCryptoPayments(
      order({
        cryptoPayments: [
          crypto({ paymentId: 1, paymentStatus: 'cancelled' }),
          crypto({ paymentId: 2, paymentStatus: 'failed' }),
          live,
        ],
      }),
    );
    expect(shown).toEqual([live]);
  });

  it('keeps a completed payment so it can render as confirmed', () => {
    const done = crypto({ paymentStatus: 'completed', verificationStatus: 'confirmed' });
    expect(visibleCryptoPayments(order({ cryptoPayments: [done] }))).toEqual([done]);
  });
});

// ------------------------------------------------------------------ maskTxid

describe('maskTxid', () => {
  it('leaves a short id alone', () => {
    expect(maskTxid('abc123')).toBe('abc123');
    expect(maskTxid('12345678901234')).toBe('12345678901234'); // exactly 14
  });

  it('keeps the first and last six characters of a long id', () => {
    expect(maskTxid('123456789012345')).toBe('123456…012345');
  });

  it('trims before measuring', () => {
    expect(maskTxid('  abc123  ')).toBe('abc123');
  });
});

// ----------------------------------------------------------------- cardState

describe('cardState', () => {
  it('awaits payment while nothing has been submitted', () => {
    expect(cardState(crypto())).toBe('awaiting');
  });

  it('flips to checking the moment a txid is submitted, before the refetch lands', () => {
    expect(cardState(crypto(), { verification: 'checking', txid: 'a'.repeat(40) })).toBe('checking');
  });

  it('reads a masked txid on the order as checking even with no submission', () => {
    expect(cardState(crypto({ txidMasked: '123456…012345' }))).toBe('checking');
  });

  it('confirms on the verification status', () => {
    expect(cardState(crypto({ verificationStatus: 'confirmed' }))).toBe('confirmed');
  });

  it('confirms on a completed payment even when verification lags', () => {
    expect(cardState(crypto({ paymentStatus: 'completed', verificationStatus: 'checking' }))).toBe(
      'confirmed',
    );
  });

  it('shows review when the backend flags it', () => {
    expect(cardState(crypto({ verificationStatus: 'needs_review', needsAttention: true }))).toBe(
      'attention',
    );
  });

  it('lets a fresh submission out of review — the customer just acted', () => {
    expect(
      cardState(crypto({ needsAttention: true, verificationStatus: 'needs_review' }), {
        verification: 'checking',
        txid: 'b'.repeat(40),
      }),
    ).toBe('checking');
  });

  it('reports review back when that is what the submission returned', () => {
    expect(cardState(crypto(), { verification: 'needs_review', txid: 'c'.repeat(40) })).toBe(
      'attention',
    );
  });
});

describe('submittedTxidMask', () => {
  it('prefers the backend mask', () => {
    expect(submittedTxidMask(crypto({ txidMasked: 'aaaaaa…ffffff' }), null)).toBe('aaaaaa…ffffff');
  });

  it('masks the just-submitted id until the refetch lands', () => {
    expect(submittedTxidMask(crypto(), { verification: 'checking', txid: '123456789012345' })).toBe(
      '123456…012345',
    );
  });

  it('is null while nothing has been submitted', () => {
    expect(submittedTxidMask(crypto(), null)).toBeNull();
  });
});

// -------------------------------------------------------------- pollInterval

describe('pollInterval', () => {
  it('does not poll a settled order', () => {
    expect(pollInterval(order({ status: 'delivered' }))).toBe(false);
  });

  it('polls every 30s while payment is outstanding and nothing is in flight', () => {
    expect(pollInterval(order({ payment: { canPay: true, payBy: null, activePayment: null } }))).toBe(
      30_000,
    );
  });

  it('polls every 10s while a hosted checkout is open in another tab', () => {
    const o = order({
      payment: {
        canPay: true,
        payBy: null,
        activePayment: {
          paymentId: 7,
          method: 'sushipp',
          kind: 'gateway',
          status: 'pending',
          checkoutUrl: 'https://pay.example/x',
          canChange: true,
        },
      },
    });
    expect(pollInterval(o)).toBe(10_000);
  });

  it('polls every 10s while a crypto txid is being verified on a payable order', () => {
    const o = order({
      payment: { canPay: true, payBy: null, activePayment: null },
      cryptoPayments: [crypto({ verificationStatus: 'checking' })],
    });
    expect(pollInterval(o)).toBe(10_000);
  });

  it('keeps a slow poll for a verification still running on a no-longer-payable order', () => {
    const o = order({
      status: 'confirmed',
      payment: { canPay: false, payBy: null, activePayment: null },
      cryptoPayments: [crypto({ verificationStatus: 'checking' })],
    });
    expect(pollInterval(o)).toBe(30_000);
  });

  it('ignores a verification on a cancelled payment', () => {
    const o = order({
      status: 'confirmed',
      payment: { canPay: false, payBy: null, activePayment: null },
      cryptoPayments: [crypto({ paymentStatus: 'cancelled', verificationStatus: 'checking' })],
    });
    expect(pollInterval(o)).toBe(false);
  });
});

// ------------------------------------------------------- paymentPollInterval

describe('paymentPollInterval', () => {
  const hosted = order({
    payment: {
      canPay: true,
      payBy: null,
      activePayment: {
        paymentId: 7,
        method: 'sushipp',
        kind: 'gateway',
        status: 'pending',
        checkoutUrl: 'https://pay.example/x',
        canChange: true,
      },
    },
  });

  it('does not poll before a first read has succeeded, even after a failed one', () => {
    expect(paymentPollInterval({ data: undefined, status: 'pending' })).toBe(false);
    expect(paymentPollInterval({ data: undefined, status: 'error' })).toBe(false);
  });

  it('slows to once a minute after a failed read, keeping the last good data', () => {
    expect(paymentPollInterval({ data: hosted, status: 'error' })).toBe(60_000);
  });

  it('follows the order own interval while reads succeed', () => {
    expect(paymentPollInterval({ data: hosted, status: 'success' })).toBe(10_000);
  });

  it('stops when there is nothing left to wait for', () => {
    expect(paymentPollInterval({ data: order({ status: 'delivered' }), status: 'success' })).toBe(false);
  });
});

// ---------------------------------------------------------------- methodNote

describe('methodNote', () => {
  it('says nothing about a method that costs what is due', () => {
    expect(methodNote(method({ fee: 0 }), 'GBP')).toBeNull();
  });

  it('spells a discount out by its rate, whichever minus the backend signed it with', () => {
    expect(methodNote(method({ fee: -1.42, feeRateText: '−3%' }), 'GBP')).toBe('3% discount');
    expect(methodNote(method({ fee: -2, feeRateText: '-5%' }), 'GBP')).toBe('5% discount');
  });

  it('names a discount by its amount when the shop gave no rate', () => {
    expect(methodNote(method({ fee: -1.42, feeRateText: '' }), 'GBP')).toBe('Saves £1.42');
  });

  it('says what a surcharge comes to', () => {
    expect(methodNote(method({ fee: 1.42, feeRateText: '+3%' }), 'GBP')).toBe('Includes a £1.42 fee');
  });
});

describe('isManual', () => {
  it('is decided by the method type, not the slot', () => {
    expect(isManual(method({ type: 'offline', method: 'uk_bank_transfer' }))).toBe(true);
    expect(isManual(method({ type: 'gateway', slot: 'manual' }))).toBe(false);
    expect(isManual(method({ type: 'crypto' }))).toBe(false);
  });
});
