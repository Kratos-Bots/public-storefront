/** The order page's query keys, in one place so a refetch from any card hits the same cache entry. */
export const orderPaymentKey = (reference: string) => ['order-payment', reference] as const;
export const paymentOptionsKey = (reference: string) => ['order-payment-options', reference] as const;
