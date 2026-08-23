/** The order page's query keys, in one place so a refetch from any card hits the same cache entry. */
export const publicOrderKey = (reference: string, accessKey: string) =>
  ['public-order', reference, accessKey] as const;

export const paymentOptionsKey = (reference: string) => ['order-payment-options', reference] as const;
